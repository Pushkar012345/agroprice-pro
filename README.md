# 🌾 AgroPrice Pro

> Real-time Maharashtra agricultural market price tracker with AI-powered insights

[![Live Demo](https://img.shields.io/badge/Live%20Demo-agroprice--pro.vercel.app-10b981?style=for-the-badge)](https://agroprice-pro.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Pushkar012345-181717?style=for-the-badge&logo=github)](https://github.com/Pushkar012345)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Pushkar%20Pawar-0077B5?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/pushkarpawar314/)

---

## 📌 About

AgroPrice Pro is a full-stack web application that provides live agricultural commodity prices across Maharashtra's mandi (market) network. Built for farmers, traders, and agri-businesses to make data-driven decisions using real government data and AI-powered insights.

---

## ✨ Features

- 📊 **Live Price Dashboard** — 255+ markets across 12 Maharashtra districts
- 📈 **Price History Charts** — Track commodity price trends over time
- 🤖 **AgroBot AI Agent** — A tool-calling agent (Groq `openai/gpt-oss-120b`) that looks up live prices, ranks markets, summarises trends, compares districts and checks price targets before it answers
- 🔔 **Price Alert Simulator** — Simulate price alerts with AI confidence scoring
- ⚖️ **Crop Comparison** — Compare up to 3 commodities side-by-side with historical data
- 🔄 **Live Data Sync** — Fetch real-time data from data.gov.in Government API
- 📤 **Export to CSV** — Download price data for offline analysis
- 🌙 **Dark / Light Mode** — Full theme support with persistent preference
- 📱 **Mobile Responsive** — Works seamlessly on all screen sizes

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI Framework |
| Vite | Build Tool |
| Tailwind CSS 4 | Styling |
| Framer Motion | Animations |
| Recharts | Price Charts |
| TanStack Query | Data Fetching & Caching |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express 5 | REST API Server |
| Prisma ORM | Database Access |
| PostgreSQL (Supabase) | Cloud Database |
| Groq SDK — gpt-oss-120b | AI Agent Engine |
| pgvector + Postgres full-text + Gemini embeddings | Hybrid RAG knowledge search (RRF fusion) |
| Jina / Cohere reranker (optional) | Second-stage reranking |
| Langfuse | LLM tracing, token / latency / cost monitoring |
| Model Context Protocol SDK | MCP server for Claude Desktop / Claude Code |
| LangChain.js (core, google-genai, langgraph) | Retriever + embeddings, graph agent engine |
| express-rate-limit | API Security & Rate Limiting |

### Deployment
| Service | Purpose |
|---------|---------|
| Vercel | Frontend Hosting |
| Render | Backend Hosting |
| Supabase | PostgreSQL Database |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prices` | Get all market prices |
| GET | `/api/prices/:district` | Filter prices by district |
| GET | `/api/prices/:id/history` | Price history for a commodity |
| GET | `/api/prices/:id/alert-simulate` | Simulate price alert with confidence score |
| GET | `/api/sync` | Sync live data from data.gov.in |
| POST | `/api/chat` | AgroBot AI chat endpoint |

---

## 📁 Project Structure

```
agroprice-pro/
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main application (dashboard, chatbot, modals)
│   │   ├── ErrorBoundary.jsx
│   │   └── main.jsx
│   └── package.json
│
└── server/                  # Node.js backend
    ├── index.js             # Express server & all API routes
    ├── agent/               # tool-calling agent loop + tools
    ├── rag/                 # chunking, embeddings, pgvector search
    ├── mcp/                 # MCP server exposing the tools over stdio
    ├── observability/       # Langfuse tracing (no-op without keys)
    ├── prisma/
    │   ├── schema.prisma    # Database schema
    │   ├── seed.js          # Initial market data
    │   └── migrations/
    └── package.json
```

---

## 🤖 AgroBot Agent

AgroBot is a read-only tool-calling agent, not a prompt-stuffed chatbot.

```
question -> model picks tool(s) -> server validates args + runs them on the DB -> results back to model -> answer
```

| Tool | Purpose |
|------|---------|
| `search_prices` | Current prices for a crop, optionally per district |
| `best_markets` | Rank markets to sell (highest) or buy (lowest) |
| `price_trend` | First/last/avg/min/max and % change over a window |
| `compare_districts` | Side-by-side district comparison |
| `simulate_alert` | How often a target price was crossed |
| `search_knowledge` | RAG lookup over MSP, APMC/e-NAM, price-reading and storage notes, with source citations |

### RAG (knowledge search)

```
knowledge/*.md -> heading-aware chunks -> Gemini embeddings (768-d) -> pgvector (HNSW, cosine)
                                       \-> generated tsvector column (GIN)      <- keyword search

question -> embed query -> vector search (top 15) ----\
                        -> keyword search (top 15) ----+-> RRF fusion -> relevance gate -> [rerank] -> passages + [source]
```

- Chunking (`rag/chunk.js`): split at headings, pack whole paragraphs up to 900 chars, prefix each chunk with its heading.
- **Hybrid retrieval** (`rag/knowledge.js`): vector search understands meaning, keyword search (Postgres full-text, `ts_rank_cd`) catches exact terms like "e-NAM" or "CACP". The two ranked lists are merged with **Reciprocal Rank Fusion** (`rag/fusion.js`), which needs no score calibration between the two.
- **Relevance gate:** every candidate keeps its cosine similarity, and hits below `RAG_MIN_SCORE` are dropped, so the bot says "I don't know" instead of answering from an irrelevant passage. Keyword matches can improve ranking but can never push an off-topic chunk past the gate.
- **Reranking (optional):** a cross-encoder (Jina or Cohere) reads query and passage together and reorders the surviving candidates. Without `RERANK_API_KEY` this stage is skipped.
- **Fails soft:** if keyword search is unavailable (migration not applied) it falls back to vector-only; if the reranker errors it keeps the fused order. Each case logs once.
- The agent answers only from returned passages and cites them like `[msp-basics]`.
- Optional: without `GEMINI_API_KEY` the agent runs without this tool.

```bash
cd server
npx prisma migrate deploy   # pgvector table + the keyword-search column/index (existing rows are backfilled, no re-ingest needed)
npm run ingest              # embed knowledge/*.md into the database
npm run ingest -- --query "does onion have MSP" --mode vector    # inspect scores; try vector | keyword | hybrid
```

Settings (`server/.env`): `RAG_MODE` (`hybrid` default, `vector`, `keyword`), `RAG_MIN_SCORE`, `RAG_CANDIDATES`, and for reranking `RERANK_API_KEY`, `RERANK_PROVIDER` (`jina` or `cohere`), `RERANK_MODEL`.

**LangChain.js version of retrieval:** `rag/langchain-retriever.js` implements the same vector retrieval with LangChain's own building blocks: `GoogleGenerativeAIEmbeddings`, a custom `BaseRetriever` (so `retriever.invoke(query)` returns `Document[]` and composes with LangChain chains), and the same relevance threshold. It runs on the existing pgvector table. Select it with `RAG_ENGINE=langchain`; the default stays the native engine, which also has hybrid search and reranking. Ingestion always uses the native embedder, and the eval below compares both on the same questions.

**Retrieval eval:** 21 answerable questions (exact-term and paraphrased) plus 6 out-of-scope ones, each answerable question naming the chunk that holds the answer.

```bash
npm run eval:retrieval      # vector vs LangChain vector vs keyword vs hybrid vs hybrid+rerank on your real DB (needs GEMINI_API_KEY)
```

It prints Hit@1, Hit@3, MRR, "usable after threshold" and correct-refusal rate per setup. Results are not tabulated here yet: run it against your own data and paste the table.

> The files in `server/knowledge/` are starter notes. Verify them against official sources and add your own `.md` files (first `# Title`, optional `Source: <url>` line), then re-run `npm run ingest`.

Guardrails: system prompt lives on the server (clients cannot override it), tool arguments are validated, max 5 tool rounds, malformed tool calls are retried once, tool results are treated as data (not instructions), and out-of-scope questions are declined.

```bash
cd server
npm test        # unit tests with a mocked model, no DB or API key needed
npm run eval    # live eval: 21 questions through the real model + DB (needs GROQ_API_KEY, DATABASE_URL)
```

> Price history in the demo database is generated by `prisma/seed.js`, so trend answers are illustrative. Set `HISTORY_SOURCE=live` once you record real history.

### MCP server (use the tools from Claude Desktop / Claude Code)

The same tools the chat agent uses are also exposed as an [MCP](https://modelcontextprotocol.io) server over stdio, so any MCP client can ask "best market to sell onion?" against your live database. It wraps `agent/tools.js` and the agent's own tool runner, so validation, the read-only guarantee and error handling are identical and there is no duplicated tool logic.

```bash
cd server
npm run mcp      # starts on stdio; normally the MCP client launches it for you
```

It reads `server/.env` itself (`DATABASE_URL`, optionally `GEMINI_API_KEY` for `search_knowledge`), so no secrets go into the client config.

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows), then fully quit and reopen Claude Desktop:

```json
{
  "mcpServers": {
    "agroprice": {
      "command": "node",
      "args": ["D:\\path\\to\\agroprice-pro\\server\\mcp\\server.js"]
    }
  }
}
```

**Claude Code:** `claude mcp add agroprice -- node "D:\path\to\agroprice-pro\server\mcp\server.js"`

**Debug with the MCP Inspector:** `npx @modelcontextprotocol/inspector node mcp/server.js`

- Tools are annotated `readOnlyHint: true`; `search_knowledge` is only listed when `GEMINI_API_KEY` is set.
- Bad arguments return `isError` with a fixable message; internal failures return a generic message and never leak details.
- stdout is the protocol channel, so the server logs only to stderr (tests assert nothing else is ever written to stdout).
- Set `DATABASE_SSL=false` for a local Postgres without SSL.

### Observability (Langfuse)

Every chat question becomes one trace you can open in [Langfuse](https://cloud.langfuse.com) (free tier):

```
agrobot-chat                      <- the question, final answer, steps, tools used
├─ llm-step-1   (generation)      <- messages in, tool calls out, tokens, latency, cost
├─ tool:search_knowledge (span)   <- validated args, result, ok / WARNING
│  ├─ rag.embed_query
│  ├─ rag.vector_search           <- which chunks came back + similarity scores
│  ├─ rag.keyword_search          <- keyword matches
│  ├─ rag.fuse                    <- RRF order, with each chunk's rank in both lists
│  ├─ rag.threshold_filter        <- retrieved vs kept after RAG_MIN_SCORE
│  └─ rag.rerank                  <- reranker scores (when enabled)
└─ llm-step-2   (generation)      <- final answer
```

- Optional: set `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` (see `server/.env.example`). Without them tracing is a no-op.
- Tracing can never break a chat: errors in the tracing layer are swallowed and logged once.
- Set `AGENT_COST_IN_PER_M` / `AGENT_COST_OUT_PER_M` to get cost per trace for models Langfuse has no price list for.
- Retried malformed tool calls show up as WARNING generations; failed tools as WARNING spans; model errors as ERROR.
- Traces contain user questions and answers. Do not point this at a shared project if that matters for your users.

---

## 🌐 Live Demo

**Frontend:** [https://agroprice-pro.vercel.app](https://agroprice-pro.vercel.app)

**Backend API:** [https://agroprice-server.onrender.com](https://agroprice-server.onrender.com)

> ⚠️ Backend is on Render free tier — first request may take 30–50 seconds to wake up.

---

## 👨‍💻 Author

**Pushkar Pawar**

- 📧 [pushkarpawaroff@gmail.com](mailto:pushkarpawaroff@gmail.com)
- 💼 [linkedin.com/in/pushkarpawar314](https://www.linkedin.com/in/pushkarpawar314/)
- 🐙 [github.com/Pushkar012345](https://github.com/Pushkar012345)

---

## 📄 License

© 2026 Pushkar Pawar. This project is proprietary. Viewing the source code is permitted for reference and learning purposes only. Copying, redistributing, or deploying this project in whole or in part without explicit written permission from the author is strictly prohibited.