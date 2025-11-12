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
    <title>Baseball Stats AI - Cloudflare Workers</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .message-bubble {
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .example-btn:hover {
            transform: translateX(4px);
        }
        .example-btn {
            transition: all 0.2s ease;
        }
    </style>
</head>
<body class="bg-gray-900 text-white min-h-screen">
    <div class="container mx-auto max-w-5xl p-6">
        <header class="mb-8 text-center">
            <div class="text-7xl mb-4">&#9918;</div>
            <h1 class="text-6xl font-extrabold mb-4 text-blue-400 tracking-tight">
                Baseball Stats AI
            </h1>
            <p class="text-2xl font-medium text-gray-300 mb-3">Ask questions about MLB pitching statistics (2018-2024)</p>
            <p class="text-base text-gray-400 font-medium">
                Powered by Cloudflare Workers AI (Llama 3.3) + D1 Database
            </p>
            <p class="text-sm text-gray-500 mt-3">
                Edge Computing | Deployed Globally on 175+ Locations
            </p>
        </header>

        <div class="bg-gray-800 rounded-2xl shadow-xl p-6 mb-6 h-[500px] overflow-y-auto border border-gray-700" id="chat-container">
            <div id="messages"></div>
        </div>

        <div class="bg-gray-800 rounded-2xl shadow-xl p-4 mb-6 border border-gray-700">
            <div class="flex gap-3">
                <input
                    type="text"
                    id="user-input"
                    placeholder="Ask a question..."
                    class="flex-1 bg-gray-700 text-white px-6 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-400"
                />
                <button
                    id="send-btn"
                    class="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-xl font-semibold transition-all shadow-lg"
                >
                    Send
                </button>
            </div>
        </div>

        <div class="bg-gray-800 rounded-2xl shadow-xl p-6 mb-6 border border-gray-700">
            <p class="font-semibold mb-3 text-gray-300">Example questions:</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button class="example-btn text-left bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg text-sm text-gray-200">
                    Who had the lowest ERA in 2023?
                </button>
                <button class="example-btn text-left bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg text-sm text-gray-200">
                    Show top 5 strikeout leaders for SEA in 2019
                </button>
                <button class="example-btn text-left bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg text-sm text-gray-200">
                    Summarize Justin Verlander ERA by year
                </button>
                <button class="example-btn text-left bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg text-sm text-gray-200">
                    Show me Washington Nationals pitchers with ERA under 3.50 in 2023
                </button>
            </div>
        </div>

        <footer class="space-y-3">
            <div class="text-center text-sm text-gray-400">
                <p>
                    Data source: <a href="https://sabr.org/lahman-database/" target="_blank" class="text-blue-400 hover:text-blue-300 underline">Lahman Baseball Database</a>
                </p>
            </div>

            <div class="text-center text-sm text-gray-400">
                <p class="mb-2 font-medium">Built by Yu Lo &mdash; Software Engineer | M.S. Computer Engineering, University of Washington</p>
                <p class="text-xs text-gray-500">
                    &copy; 2025 Yu Lo. All rights reserved. &nbsp;&middot;&nbsp;
                    <a href="https://github.com/yulo-dev" target="_blank" class="text-blue-400 hover:text-blue-300 underline">GitHub</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://www.linkedin.com/in/yu-lo/" target="_blank" class="text-blue-400 hover:text-blue-300 underline">LinkedIn</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://yulo.im/" target="_blank" class="text-blue-400 hover:text-blue-300 underline">Portfolio</a>
                    &nbsp;&middot;&nbsp;
                    <button id="contact-btn" class="text-blue-400 hover:text-blue-300 underline cursor-pointer bg-transparent border-none p-0 font-inherit">Contact</button>
                </p>
            </div>
        </footer>
    </div>

    <script>
        function copyEmail() {
            const contactBtn = document.getElementById('contact-btn');
            const originalText = contactBtn.textContent;

            navigator.clipboard.writeText('loyu.jobs@gmail.com').then(() => {
                contactBtn.textContent = 'Copied!';
                contactBtn.classList.add('text-green-400');
                contactBtn.classList.remove('text-blue-400');

                setTimeout(() => {
                    contactBtn.textContent = originalText;
                    contactBtn.classList.remove('text-green-400');
                    contactBtn.classList.add('text-blue-400');
                }, 2000);
            }).catch(err => {
                alert('Email: loyu.jobs@gmail.com');
            });
        }

        document.getElementById('contact-btn').addEventListener('click', copyEmail);

        const messagesDiv = document.getElementById('messages');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const exampleBtns = document.querySelectorAll('.example-btn');

        function addMessage(text, isUser = false) {
            const msgDiv = document.createElement('div');
            msgDiv.className = \`message-bubble mb-4 \${isUser ? 'text-right' : 'text-left'}\`;
            const bubble = document.createElement('div');
            bubble.className = \`inline-block px-5 py-3 rounded-2xl max-w-[80%] \${
                isUser ? 'bg-blue-600 text-white shadow-lg' :
                'bg-gray-700 text-gray-100 shadow-lg'
            }\`;
            bubble.style.whiteSpace = 'pre-wrap';
            bubble.textContent = text;
            msgDiv.appendChild(bubble);
            messagesDiv.appendChild(msgDiv);

            setTimeout(() => {
                msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 50);
        }

        async function sendMessage(message = null) {
            const msg = message || userInput.value.trim();
            if (!msg) return;

            addMessage(msg, true);
            if (!message) userInput.value = '';
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<span class="animate-pulse">Thinking...</span>';

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });

                const data = await response.json();

                if (data.success) {
                    addMessage(data.message);
                    console.log('SQL:', data.sql);
                    console.log('Results:', data.results);
                } else {
                    addMessage(\`Error: \${data.error}\`);
                }
            } catch (error) {
                addMessage(\`Error: \${error.message}\`);
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send';
            }
        }

        sendBtn.addEventListener('click', () => sendMessage());
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        exampleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                sendMessage(btn.textContent.trim());
            });
        });

        addMessage('Welcome! Ask me anything about MLB pitching statistics from 2018-2024.');
    </script>
</body>
</html>`;