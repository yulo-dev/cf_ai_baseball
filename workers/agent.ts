/**
 * cf_ai_baseball Worker
 * AI-powered Baseball Stats Assistant using Cloudflare Workers AI (Llama 3.3)
 */

export interface Env {
	DB: D1Database;
	AI: Ai;
}

const SYSTEM_PROMPT = `You are a baseball statistics assistant that translates user questions into SQL queries.

DATABASE SCHEMA:
- people: playerID (TEXT PRIMARY KEY), nameFirst (TEXT), nameLast (TEXT)
- teams: yearID (INT), teamID (TEXT), name (TEXT), W (INT), L (INT), G (INT)
- pitching: playerID (TEXT), yearID (INT), stint (INT), teamID (TEXT), W (INT), L (INT), G (INT), GS (INT), SV (INT), IPouts (INT), SO (INT), BB (INT), ERA (REAL), H (INT), ER (INT), HR (INT)

RULES:
1. Use SQLite syntax
2. Always include LIMIT clause to prevent excessive results (default LIMIT 10)
3. Use proper JOINs when querying across tables
4. Match player names with LIKE for flexibility (e.g., nameLast LIKE '%deGrom%')
5. Use aggregate functions (AVG, SUM, MAX, MIN) for statistics
6. Always filter by yearID when year is mentioned
7. teamID uses abbreviations (e.g., 'SEA', 'NYA', 'LAD', 'HOU', 'WAS' for Nationals)
8. ERA is stored as a REAL number, lower is better
9. IPouts represents innings pitched as outs (divide by 3 for innings)

RESPONSE FORMAT:
Return ONLY the SQL query without any explanation or markdown formatting.

EXAMPLES:
Q: Who had the lowest ERA in 2023?
A: SELECT p.playerID, pe.nameFirst, pe.nameLast, p.ERA FROM pitching p JOIN people pe ON p.playerID = pe.playerID WHERE p.yearID = 2023 AND p.GS >= 10 ORDER BY p.ERA ASC LIMIT 1;

Q: Show top 5 strikeout leaders for SEA in 2019
A: SELECT p.playerID, pe.nameFirst, pe.nameLast, p.SO FROM pitching p JOIN people pe ON p.playerID = pe.playerID WHERE p.teamID = 'SEA' AND p.yearID = 2019 ORDER BY p.SO DESC LIMIT 5;

Q: Summarize Jacob deGrom ERA by year
A: SELECT p.yearID, p.teamID, p.ERA, p.W, p.L FROM pitching p JOIN people pe ON p.playerID = pe.playerID WHERE pe.nameLast LIKE '%deGrom%' ORDER BY p.yearID;`;

interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}

		const url = new URL(request.url);

		if (url.pathname === '/api/chat' && request.method === 'POST') {
			try {
				const { message } = await request.json() as { message: string };

				if (!message || typeof message !== 'string') {
					return jsonResponse({ error: 'Invalid message' }, 400);
				}

				console.log('User query:', message);
				const sqlQuery = await generateSQL(env.AI, message);
				console.log('Generated SQL:', sqlQuery);

				const queryResults = await executeQuery(env.DB, sqlQuery);
				console.log('Query results:', queryResults);

				const response = await formatResponse(env.AI, message, queryResults, sqlQuery);

				return jsonResponse({
					success: true,
					message: response,
					sql: sqlQuery,
					results: queryResults,
				});
			} catch (error: any) {
				console.error('Error:', error);
				return jsonResponse(
					{
						success: false,
						error: error.message || 'An error occurred',
					},
					500
				);
			}
		}

		if (url.pathname === '/' || url.pathname === '/index.html') {
			return new Response(HTML_CONTENT, {
				headers: { 'Content-Type': 'text/html' },
			});
		}

		return new Response('Not found', { status: 404 });
	},
};

async function generateSQL(ai: Ai, userQuery: string): Promise<string> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: userQuery },
	];

	const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
		messages,
		temperature: 0.1,
		max_tokens: 500,
	}) as { response: string };

	let sql = response.response.trim();
	sql = sql.replace(/```sql\n?/g, '').replace(/```\n?/g, '');
	sql = sql.trim();

	if (!sql.endsWith(';')) {
		sql += ';';
	}

	return sql;
}

async function executeQuery(db: D1Database, sql: string): Promise<any[]> {
	try {
		const result = await db.prepare(sql).all();
		return result.results || [];
	} catch (error: any) {
		console.error('SQL execution error:', error);
		throw new Error(`Database query failed: ${error.message}`);
	}
}

async function formatResponse(
	ai: Ai,
	userQuery: string,
	results: any[],
	sql: string
): Promise<string> {
	if (!results || results.length === 0) {
		return `I couldn't find any data matching your question. This could be because:
- The player name might be spelled differently
- The year might not be in our dataset (we have data from 2018-2024)
- The team abbreviation might need adjustment (e.g., SEA for Seattle, NYA for Yankees, WAS for Nationals)

Would you like to try rephrasing your question?`;
	}

	const resultsString = JSON.stringify(results, null, 2);
	const prompt = `The user asked: "${userQuery}"

The SQL query executed was: ${sql}

The database returned these results:
${resultsString}

Please provide a natural, conversational answer in 1-3 clear sentences. Be specific with numbers, names, and statistics.`;

	const messages: ChatMessage[] = [
		{
			role: 'system',
			content: 'You are a helpful baseball statistics assistant. Answer questions clearly and concisely based on the data provided.'
		},
		{ role: 'user', content: prompt },
	];

	try {
		const response = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
			messages,
			temperature: 0.3,
			max_tokens: 300,
		}) as { response: string };

		const answer = response.response.trim();

		if (!answer || answer.length < 10) {
			return formatSimple(results, userQuery);
		}

		return answer;
	} catch (error) {
		console.error('AI formatting failed:', error);
		return formatSimple(results, userQuery);
	}
}

function formatSimple(results: any[], userQuery: string): string {
	if (results.length === 0) return 'No results found.';

	if (results.length === 1) {
		const row = results[0];
		const keys = Object.keys(row);

		if (keys.length === 1) {
			const key = keys[0];
			const value = row[key];

			if (value === null || value === undefined) {
				return 'No data available.';
			}

			if (key.includes('SUM(')) return `The total is ${value}.`;
			if (key.includes('AVG(')) return `The average is ${parseFloat(value).toFixed(2)}.`;
			if (key.includes('COUNT(')) return `The count is ${value}.`;

			return `Result: ${key} = ${value}`;
		}

		const parts: string[] = [];
		if (row.nameFirst && row.nameLast) parts.push(`${row.nameFirst} ${row.nameLast}`);
		if (row.ERA !== undefined) parts.push(`ERA: ${parseFloat(row.ERA).toFixed(2)}`);
		if (row.SO !== undefined) parts.push(`${row.SO} SO`);
		if (row.W !== undefined) parts.push(`${row.W} W`);
		if (row.yearID) parts.push(`(${row.yearID})`);

		return parts.length > 0 ? parts.join(' ') : JSON.stringify(row);
	}

	return formatTable(results);
}

function formatTable(results: any[]): string {
	if (results.length === 0) return 'No results found.';
	const keys = Object.keys(results[0]);
	const header = keys.join(' | ');
	const separator = keys.map(() => '---').join(' | ');
	const rows = results.map(row =>
		keys.map(key => {
			const val = row[key];
			return val === null ? '' : typeof val === 'number' ? val.toFixed(2) : String(val);
		}).join(' | ')
	);
	return [header, separator, ...rows].join('\n');
}

function jsonResponse(data: any, status: number = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*',
		},
	});
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StrikeZone AI | Professional Baseball Analytics</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    colors: {
                        slate: {
                            850: '#151e2e',
                            900: '#0f172a',
                            950: '#020617',
                        }
                    },
                    animation: {
                        'fade-in': 'fadeIn 0.5s ease-out',
                        'slide-up': 'slideUp 0.4s ease-out',
                    },
                    keyframes: {
                        fadeIn: {
                            '0%': { opacity: '0' },
                            '100%': { opacity: '1' },
                        },
                        slideUp: {
                            '0%': { opacity: '0', transform: 'translateY(10px)' },
                            '100%': { opacity: '1', transform: 'translateY(0)' },
                        }
                    }
                }
            }
        }
    </script>
    <style>
        body {
            background-color: #020617;
            background-image: radial-gradient(circle at 50% 0%, #172033 0%, #020617 60%);
        }
        /* Custom Scrollbar */
        ::-webkit-scrollbar {
            width: 10px;
        }
        ::-webkit-scrollbar-track {
            background: #020617;
        }
        ::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 5px;
            border: 2px solid #020617;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #475569;
        }
        .glass-panel {
            background: rgba(30, 41, 59, 0.4);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .typing-dot {
            animation: typing 1.4s infinite ease-in-out both;
        }
        .typing-dot:nth-child(1) { animation-delay: -0.32s; }
        .typing-dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes typing {
            0%, 80%, 100% { transform: scale(0); }
            40% { transform: scale(1); }
        }
        /* Dropdown transition */
        .dropdown-menu {
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .group:hover .dropdown-menu {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
    </style>
</head>
<body class="text-slate-200 h-screen flex flex-col font-sans overflow-hidden">

    <nav class="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" class="flex items-center gap-3 group">
                <div class="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/20 relative overflow-hidden group-hover:scale-105 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>
                        <path d="M18 12a6 6 0 0 0-6 6" stroke-linecap="round"></path>
                        <path d="M6 12a6 6 0 0 1 6-6" stroke-linecap="round"></path>
                        <path d="M14.5 5.5l1 1" stroke-linecap="round"></path>
                        <path d="M16.5 7.5l1 1" stroke-linecap="round"></path>
                        <path d="M5.5 14.5l1 1" stroke-linecap="round"></path>
                        <path d="M7.5 16.5l1 1" stroke-linecap="round"></path>
                    </svg>
                </div>
                <span class="font-bold text-lg tracking-tight text-white group-hover:text-blue-100 transition-colors">StrikeZone<span class="text-blue-500">AI</span></span>
            </a>

            <div class="flex items-center gap-6 text-sm font-medium text-slate-400">
                <a href="https://sabr.org/lahman-database/" target="_blank" class="hover:text-blue-400 transition-colors flex items-center gap-1">
                    Data Source
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
                        <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clip-rule="evenodd" />
                        <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clip-rule="evenodd" />
                    </svg>
                </a>

                <div class="relative group h-16 flex items-center">
                    <button class="flex items-center gap-1 hover:text-white transition-colors py-2 focus:outline-none">
                        Connect
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transition-transform group-hover:rotate-180">
                            <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                        </svg>
                    </button>

                    <div class="dropdown-menu absolute right-0 top-[90%] w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden py-1 z-50">
                        <a href="https://github.com/yulo-dev" target="_blank" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                            <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                            GitHub
                        </a>
                        <a href="https://www.linkedin.com/in/yu-lo/" target="_blank" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                            <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                            LinkedIn
                        </a>
                        <a href="https://yulo.im/" target="_blank" class="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8z"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            Portfolio
                        </a>
                        <button onclick="copyEmail(this)" class="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-left">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            <span class="email-text">Copy Email</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <main class="flex-1 flex flex-col w-full relative">

        <div id="chat-container" class="flex-1 overflow-y-auto w-full scroll-smooth">

            <div class="max-w-4xl mx-auto w-full px-4 md:px-6 py-6 pb-40">

                <div id="welcome-hero" class="flex flex-col items-center animate-fade-in pt-16">

                    <div class="text-center space-y-6 max-w-3xl mx-auto mb-16">
                        <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight text-white">
                            MLB Stats Analysis <br/>
                            <span class="text-blue-500">Reimagined</span>
                        </h1>

                        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel text-xs font-medium text-blue-200 border-blue-500/20">
                             <span class="relative flex h-2 w-2">
                              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            Cloudflare Workers AI + D1
                        </div>

                        <p class="text-lg text-slate-400 leading-relaxed max-w-xl mx-auto">
                            Query pitching statistics (2018-2024) using natural language. <br/>
                            Simply ask a question to generate SQL and get insights.
                        </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl text-left">
                        <button class="example-btn group p-5 rounded-xl glass-panel hover:bg-slate-800/80 hover:border-blue-500/50 transition-all duration-300 border border-slate-800">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-2 h-2 rounded-full bg-green-400"></span>
                                <span class="text-slate-400 text-xs font-mono uppercase tracking-wider">Analysis</span>
                            </div>
                            <div class="text-sm font-medium text-slate-200 group-hover:text-white">Who had the lowest ERA in 2023?</div>
                        </button>
                        <button class="example-btn group p-5 rounded-xl glass-panel hover:bg-slate-800/80 hover:border-blue-500/50 transition-all duration-300 border border-slate-800">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-2 h-2 rounded-full bg-blue-400"></span>
                                <span class="text-slate-400 text-xs font-mono uppercase tracking-wider">Team Stats</span>
                            </div>
                            <div class="text-sm font-medium text-slate-200 group-hover:text-white">Show top 5 strikeout leaders for SEA in 2019</div>
                        </button>
                        <button class="example-btn group p-5 rounded-xl glass-panel hover:bg-slate-800/80 hover:border-blue-500/50 transition-all duration-300 border border-slate-800">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                                <span class="text-slate-400 text-xs font-mono uppercase tracking-wider">Player History</span>
                            </div>
                            <div class="text-sm font-medium text-slate-200 group-hover:text-white">Summarize Jacob deGrom ERA by year</div>
                        </button>
                        <button class="example-btn group p-5 rounded-xl glass-panel hover:bg-slate-800/80 hover:border-blue-500/50 transition-all duration-300 border border-slate-800">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-2 h-2 rounded-full bg-orange-400"></span>
                                <span class="text-slate-400 text-xs font-mono uppercase tracking-wider">Deep Dive</span>
                            </div>
                            <div class="text-sm font-medium text-slate-200 group-hover:text-white">Nationals pitchers with ERA < 3.50 in 2023</div>
                        </button>
                    </div>
                </div>

                <div id="messages-list" class="space-y-6 hidden pt-4"></div>

                <div id="loading-indicator" class="hidden animate-slide-up mt-6">
                    <div class="flex gap-4 items-start">
                        <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 mt-1">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M18 12a6 6 0 0 0-6 6"></path>
                                <path d="M6 12a6 6 0 0 1 6-6"></path>
                            </svg>
                        </div>
                        <div class="glass-panel px-6 py-4 rounded-2xl rounded-tl-none">
                            <div class="flex gap-1 h-5 items-center">
                                <div class="w-2 h-2 bg-blue-400 rounded-full typing-dot"></div>
                                <div class="w-2 h-2 bg-blue-400 rounded-full typing-dot"></div>
                                <div class="w-2 h-2 bg-blue-400 rounded-full typing-dot"></div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <div class="absolute bottom-4 left-0 right-0 px-4">
            <div class="max-w-3xl mx-auto relative group">
                <div class="absolute -inset-0.5 bg-blue-500/20 rounded-2xl blur group-hover:bg-blue-500/30 transition duration-500"></div>

                <div class="relative flex items-center bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/50">
                    <input
                        type="text"
                        id="user-input"
                        placeholder="Ask a question about MLB stats..."
                        class="w-full bg-transparent text-white px-5 py-4 focus:outline-none placeholder-slate-500 text-base"
                        autocomplete="off"
                    />
                    <button
                        id="send-btn"
                        class="mr-2 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 transform rotate-90 text-blue-500">
                            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                        </svg>
                    </button>
                </div>

                <div class="text-center mt-3 text-xs text-slate-500 opacity-70">
                    Powered by Cloudflare Workers AI (Llama 3.3) + D1 Database
                </div>
            </div>
        </div>
    </main>

    <script>
        const chatContainer = document.getElementById('chat-container');
        const messagesList = document.getElementById('messages-list');
        const welcomeHero = document.getElementById('welcome-hero');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const loadingIndicator = document.getElementById('loading-indicator');
        const exampleBtns = document.querySelectorAll('.example-btn');

        // Email copy function
        function copyEmail(btn) {
            // Find the span inside the button to update text
            const textSpan = btn.querySelector('.email-text');
            const originalText = textSpan.textContent;

            navigator.clipboard.writeText('loyu.jobs@gmail.com').then(() => {
                textSpan.textContent = 'Copied!';
                textSpan.classList.add('text-green-400');
                setTimeout(() => {
                    textSpan.textContent = originalText;
                    textSpan.classList.remove('text-green-400');
                }, 2000);
            });
        }

        function appendUserMessage(text) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex gap-4 items-start flex-row-reverse animate-slide-up';
            msgDiv.innerHTML = \`
                <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300 shrink-0 mt-1 border border-slate-600">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                        <path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clip-rule="evenodd" />
                    </svg>
                </div>
                <div class="bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-none shadow-lg max-w-[85%] text-sm md:text-base leading-relaxed">
                    \${text}
                </div>
            \`;
            messagesList.appendChild(msgDiv);
        }

        function appendAIMessage(text) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'flex gap-4 items-start animate-slide-up';

            const formattedText = text.replace(/\\n/g, '<br>');

            msgDiv.innerHTML = \`
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white shrink-0 mt-1 shadow-lg shadow-blue-500/20">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M18 12a6 6 0 0 0-6 6"></path>
                        <path d="M6 12a6 6 0 0 1 6-6"></path>
                    </svg>
                </div>
                <div class="glass-panel px-5 py-3 rounded-2xl rounded-tl-none text-slate-200 max-w-[90%] text-sm md:text-base leading-relaxed shadow-sm border border-slate-700/50">
                    \${formattedText}
                </div>
            \`;
            messagesList.appendChild(msgDiv);
            scrollToBottom();
        }

        function scrollToBottom() {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }

        async function sendMessage(message = null) {
            const msg = message || userInput.value.trim();
            if (!msg) return;

            if (welcomeHero.style.display !== 'none') {
                welcomeHero.style.display = 'none';
                messagesList.classList.remove('hidden');
            }

            if (!message) userInput.value = '';
            userInput.disabled = true;
            sendBtn.disabled = true;

            appendUserMessage(msg);
            loadingIndicator.classList.remove('hidden');
            scrollToBottom();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });

                const data = await response.json();
                loadingIndicator.classList.add('hidden');

                if (data.success) {
                    appendAIMessage(data.message);
                } else {
                    appendAIMessage(\`Error: \${data.error}\`);
                }
            } catch (error) {
                loadingIndicator.classList.add('hidden');
                appendAIMessage(\`Sorry, something went wrong. (\${error.message})\`);
            } finally {
                userInput.disabled = false;
                sendBtn.disabled = false;
                userInput.focus();
                scrollToBottom();
            }
        }

        sendBtn.addEventListener('click', () => sendMessage());
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        exampleBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const queryText = this.querySelector('div:last-child').textContent;
                sendMessage(queryText);
            });
        });
    </script>
</body>
</html>`;