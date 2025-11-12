# Baseball Stats AI ⚾

**🔗 [Live Demo](https://cf-ai-baseball.loyu.workers.dev/)** - Try it now!

---

## ⚾ Project Overview

Baseball Stats AI is an intelligent AI agent I built to explore how natural language processing can simplify baseball statistics queries. It enables users to ask questions in plain English about MLB pitching statistics and receive intelligent, conversational responses powered by AI.

This project bridges the gap between complex SQL databases and casual baseball fans, making statistical analysis faster, more intuitive, and more accessible through the power of edge computing and AI.

---

## ⚾ Features

### Natural Language Queries
Ask questions in plain English like "Who had the lowest ERA in 2023?" and get instant answers.

### AI-Powered SQL Generation (via Llama 3.3)
Automatically converts natural language into accurate SQL queries using Workers AI.

### Real-Time Database Queries
Queries 56,000+ MLB pitching records (2018-2024) from D1 database with sub-second response times.

### Intelligent Response Formatting
AI formats raw database results into natural, conversational responses.

### Global Edge Deployment
Deployed on Cloudflare's global network with <50ms latency worldwide.

### Professional UI/UX
Clean and interactive interface built with Tailwind CSS and Inter font. Features auto-scroll, click-to-copy contact, and example queries.

### Privacy-First
No data collection, no authentication required. All queries are stateless.

---

## ⚾ Technologies Used

### Backend (Cloudflare Workers + TypeScript)

- **Cloudflare Workers** — Serverless edge computing platform
- **Workers AI (Llama 3.3-70B)** — Natural language processing and SQL generation
- **D1 Database** — SQLite-based database with 56,000+ records
- **TypeScript** — Type-safe development
- **Wrangler CLI** — Deployment and development tool

### Frontend (HTML + CSS + JavaScript)

- **HTML5** — Structure of the web application
- **TailwindCSS** — Utility-first CSS framework for clean and responsive UI
- **Vanilla JavaScript (ES6+)** — Frontend logic and user interactions
- **Inter Font** — Professional typography from Google Fonts

### Data Source

- **Lahman Baseball Database** — Historical MLB statistics (1871-2024)
- **License: CC BY-SA 4.0** — Open source baseball data
- **Coverage: 2018-2024** — Focused on recent pitching statistics

---

## ⚾ Architecture
```
User Query (Natural Language)
    ↓
Cloudflare Workers (TypeScript)
    ↓
Workers AI (Llama 3.3) → Generate SQL Query
    ↓
D1 Database (SQLite) → Execute Query
    ↓
Workers AI (Llama 3.3) → Format Response
    ↓
Natural Language Response
```

---

## ⚾ Folder Structure
```
cf-ai-baseball/
├── workers/
│   └── agent.ts         # Main application (backend + frontend)
├── data/
│   ├── People.csv       # Player information
│   ├── pitching.csv     # Pitching statistics
│   └── teams.csv        # Team data
├── scripts/
│   └── seed_d1.ts       # Database seeding script
├── wrangler.toml        # Cloudflare configuration
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript configuration
└── README.md
```

---

## ⚾ Example Queries

Try asking:

- "Who had the lowest ERA in 2023?"
- "Show me Washington Nationals pitchers with ERA under 3.50 in 2023"
- "Top 5 strikeout leaders for Seattle in 2019"
- "Summarize Justin Verlander's ERA by year"
- "How many wins did the Yankees have in 2024?"

---

## ⚾ Key Technical Achievements

-  Integrated 3 Cloudflare services (Workers, AI, D1) seamlessly  
-  Natural language to SQL conversion using LLM  
-  Real-time database queries on 56,000+ records  
-  Intelligent fallback mechanisms for error handling  
-  Global edge deployment with <50ms latency  
-  Professional UI/UX with modern design patterns  

---

## ⚾ Performance

- **Response Time:** ~1.5-2.5 seconds per query
- **Global Latency:** <50ms (North America), <100ms (Asia)
- **Database Size:** 56,000+ records
- **Free Tier:** 10,000 AI requests/day

---

## ⚾ Local Development
```bash
# Install dependencies
npm install

# Deploy to Cloudflare
npm run deploy

# View real-time logs
npx wrangler tail
```

---

## ⚾ License & Attribution

**Code:** © 2025 Yu Lo. All rights reserved.

**Data Source:**  
[Lahman Baseball Database](https://sabr.org/lahman-database/)  

---

## 🛠️ Maintained by Yulo L.

✨ Building full-stack tools that blend natural language AI with real-world use cases like sports analytics

---

**⚡ Powered by Cloudflare Workers | AI by Meta Llama 3.3 | Data by Lahman**
