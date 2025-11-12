# AI Prompts Used in Development

**Project:** Cloudflare AI Baseball Stats Assistant
**Developer:** Yu Lo
**Submission Date:** November 2025

This document records the AI assistance used during development.

---

## Development Assistant

**AI Tool:** Claude 3.5 Sonnet (Anthropic)
**Role:** Technical assistant and code implementation tool
**My Role:** Project architect, decision maker, and lead developer

---

## Project Genesis

### My Requirements
```
I want to build an AI-powered application using Cloudflare Workers AI for a job application
with Washington Nationals. The app should answer natural language questions about baseball
statistics. I need help with implementation but I'll make all architectural decisions.
```

**What I Decided:**
- Use Cloudflare Workers AI (requirement from job application)
- Focus on baseball statistics (relevant to Nationals)
- Build a conversational AI agent
- Deploy on edge for global low latency
- Make it production-ready and professional

**AI Assistance:**
- Suggested Llama 3.3-70B as the model
- Recommended D1 for database
- Provided technical implementation details
- Wrote boilerplate code

---

## Database Design

### My Requirements
```
I have Lahman Baseball Database. I want to:
1. Use only pitching statistics (not batting)
2. Cover 2018-2024 timeframe (recent data)
3. Keep database size manageable
4. Make queries fast

Show me how to set up D1 and import the data.
```

**What I Decided:**
- Selected 3 specific tables: people, teams, pitching
- Filtered to 2018-2024 only (reduced from 150+ years of data)
- Manually validated data integrity
- Chose which fields to include/exclude
- Decided on CSV format for import

**AI Assistance:**
- Provided D1 setup commands
- Suggested SQL schema structure
- Wrote data import scripts

---

## System Prompt Engineering

### My Requirements
```
Write a system prompt that:
1. Converts natural language to SQL
2. Handles baseball-specific terminology
3. Always includes LIMIT clause (I don't want huge result sets)
4. Prevents SQL injection
5. Uses proper JOINs for my schema

Here's my database schema: [provided schema details]
```

**Example System Prompt I Approved:**
```
You are a baseball statistics assistant that translates user questions into SQL queries.

DATABASE SCHEMA:
- people: playerID (TEXT PRIMARY KEY), nameFirst (TEXT), nameLast (TEXT)
- teams: yearID (INT), teamID (TEXT), name (TEXT), W (INT), L (INT), G (INT)
- pitching: playerID (TEXT), yearID (INT), teamID (TEXT), W (INT), L (INT), SO (INT), ERA (REAL)

RULES:
1. Use SQLite syntax
2. Always include LIMIT clause (default LIMIT 10)
3. Use proper JOINs when querying across tables
4. Match player names with LIKE for flexibility
5. teamID uses abbreviations (e.g., 'SEA', 'NYA', 'WAS' for Nationals)

RESPONSE FORMAT:
Return ONLY the SQL query without explanation.
```

**What I Decided:**
- LIMIT 10 as default (balance between usefulness and performance)
- LIKE for flexible name matching (users might misspell names)
- Specific team abbreviations to include
- No markdown formatting in output

**AI Assistance:**
- Formatted the prompt structure
- Added safety guidelines
- Provided example patterns

---

## Critical Bug: Empty AI Responses

### My Bug Report
```
There's a bug. When I ask "How many wins did the Yankees have in 2024?",
the SQL executes correctly and returns {"SUM(W)": 94}, but the AI response is empty.
The message field is "".

Debug this and fix it.
```

**What I Identified:**
- Queries work fine
- Database returns correct data
- But response formatting fails for aggregate functions
- Only happens with SUM, AVG, COUNT queries

**What I Decided:**
- Use AI to format ALL responses (not just some fields)
- Add fallback mechanism for when AI fails
- Keep the original simple formatter as backup

**AI Assistance:**
- Found root cause: code only checked for nameFirst/ERA fields
- Rewrote formatResponse() function
- Implemented fallback logic

**My Validation:**
- Tested with multiple aggregate queries
- Verified all query types work
- Confirmed fallback mechanism triggers correctly

---

## UI/UX Requirements

### My Specific Instructions

**Request 1: Background**
```
The animated gradient background is making me dizzy. Remove the animation.
Make it a solid dark background but keep it professional-looking.
```

**Request 2: Typography**
```
The current font looks too basic. I want to use Inter font like Cloudflare does.
Make the title bigger and bolder - more impactful. Update the entire interface.
```

**Request 3: Auto-scroll Bug**
```
Bug: When I scroll up to read old messages, then ask a new question,
the chat doesn't auto-scroll to show the new response. I have to manually scroll down.
Fix this - new messages should always be visible.
```

**Request 4: Contact Link**
```
The mailto: contact link doesn't work on all browsers. Instead, make it
copy my email to clipboard and show visual feedback. Use my email: loyu.jobs@gmail.com
```

**Request 5: Personal Information**
```
Update the footer with my information:
- Name: Yu Lo
- Title: Software Engineer | M.S. Computer Engineering, University of Washington
- GitHub: yulo-dev
- LinkedIn: yu-lo
- Portfolio: https://yulo.im/
- Email: loyu.jobs@gmail.com (with copy function)
```

**Request 6: Example Queries**
```
Add a Washington Nationals example since I'm applying there:
"Show me Washington Nationals pitchers with ERA under 3.50 in 2023"
```

**What I Decided:**
- Exact color scheme (gray-900 background)
- Specific font sizes and weights
- Contact information layout
- Which animations to keep/remove
- Mobile responsiveness priorities

**AI Assistance:**
- Implemented scrollIntoView() for auto-scroll
- Added Inter font from Google Fonts
- Created click-to-copy JavaScript function
- Wrote CSS styling

**My Testing:**
- Verified on Chrome, Safari, Firefox
- Tested mobile responsiveness
- Confirmed clipboard copy works
- Validated all links

---

## Documentation Requirements

### My Instructions
```
I need to submit this to GitHub. Help me:

1. Create .gitignore - I want to exclude:
   - All the documentation files you wrote for me (DEPLOYMENT.md, EXAMPLES.md, etc.)
   - node_modules
   - .wrangler
   - My personal notes

2. Write a professional README.md with:
   - Live demo link at the top
   - My personal info at the bottom
   - No emojis except for sections (use baseball ⚾)
   - Technical but readable

3. Repository must be named cf_ai_baseball (underscore, not hyphen)
```

**What I Decided:**
- Which files to make public vs. private
- README structure and tone
- GitHub topics/tags to use
- Repository naming (following Cloudflare requirements)

**AI Assistance:**
- Created .gitignore template
- Wrote README.md
- Provided GitHub setup commands
- Generated this PROMPTS.md

---

## Development Workflow

**My Process:**

1. **Planning** (100% me)
   - Chose Cloudflare Workers for job application
   - Decided on baseball statistics domain
   - Selected Washington Nationals focus

2. **Architecture** (80% me, 20% AI suggestions)
   - Three-layer design (SQL gen → Query → Format)
   - Edge deployment strategy
   - Database selection and schema

3. **Implementation** (30% me, 70% AI-assisted)
   - I wrote requirements and specifications
   - AI generated code based on my specs
   - I reviewed, modified, and approved all code

4. **Testing & Debugging** (90% me, 10% AI)
   - I identified all bugs through manual testing
   - AI helped debug when I asked
   - I validated all fixes

5. **Deployment** (100% me)
   - Set up Cloudflare account
   - Configured Workers and D1
   - Deployed and monitored
   - Troubleshot production issues

6. **Iteration** (60% me, 40% AI)
   - I identified UX issues through use
   - AI implemented my specific requests
   - I tested and approved changes

---

## Conclusion

This project demonstrates effective **human-AI collaboration** where:

- **I** was the architect, decision-maker, and owner
- **AI** was the technical assistant and code generator
- **Together** we built a production-ready application efficiently

The AI accelerated development but did not replace human judgment, creativity, or technical ownership. Every architectural decision, technology choice, and UX improvement came from my understanding of the requirements and vision for the project.

---