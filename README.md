# HFT Causal Platform

> **Discover what *causes* your portfolio to move — not just what correlates.**

A full-stack portfolio analytics platform combining rigorous causal inference, AI agents, and backtesting. Built entirely on a **free-forever** stack — no credit card, no paid tiers.

Live demo: `https://hft-causal-platform.vercel.app` · API: `https://hft-causal-platform.onrender.com/docs`

---

## What It Does

Enter any stock tickers and get:

| Feature | What You See |
|---------|-------------|
| **Causal Graph** | Interactive D3 DAG — which assets actually drive others |
| **Backtest** | Equal-weight portfolio vs SPY with Sharpe, MDD, Alpha, Sortino |
| **AI Insights** | Groq Llama-3.3-70b multi-agent narrative |
| **Sentiment** | News articles scored with VADER sentiment |
| **Live Prices** | WebSocket real-time price cards |

---

## Free Stack (100% — No Credit Card Ever)

| Layer | Tool | API Key? | Cost |
|-------|------|----------|------|
| Historical data | `yfinance` | None | Free |
| Real-time quotes | Finnhub REST | Free signup | Free |
| News / RSS | Finnhub + feedparser | Free signup | Free |
| Macro indicators | FRED API | Free signup | Free |
| Causal discovery | causal-learn (PC algorithm) | — | Open source |
| Treatment effects | EconML (Double ML) | — | Open source |
| AI agents | Groq Llama-3.3-70b + LangGraph | Free signup | Free |
| Backend | FastAPI + Uvicorn | — | Open source |
| Frontend | Next.js 14 + Tailwind + D3 + Recharts | — | Open source |
| Database | SQLite (zero-config) | None | Free |
| Backend deploy | Render free tier (no CC required) | Free account | Free |
| Frontend deploy | Vercel hobby tier | Free account | Free |

---

## Quick Start

### Prerequisites
- Python 3.9+  ·  Node.js 18+

### Backend

```bash
git clone https://github.com/ADITYATORNEKAR/hft-causal-platform
cd hft-causal-platform

pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # add free API keys (optional)

cd backend
uvicorn app.main:app --reload --port 8000
# API docs → http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local             # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
# App → http://localhost:3000
```

### Docker (both at once)

```bash
cp backend/.env.example backend/.env
docker-compose up --build
```

---

## Getting Free API Keys (< 2 min each, no CC)

| Key | Link | Limit |
|-----|------|-------|
| `FINNHUB_API_KEY` | [finnhub.io/register](https://finnhub.io/register) | 60 calls/min |
| `FRED_API_KEY` | [fred.stlouisfed.org/docs/api](https://fred.stlouisfed.org/docs/api/api_key.html) | Unlimited |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) | 500 req/day |

> **No keys needed to run the app.** yfinance handles all historical data with no key, and rule-based insights replace the LLM agents as a fallback.

---

## Architecture

```
Browser → Next.js (Vercel) → FastAPI (Render)
                                    │
              ┌─────────────────────┤
              │                     │
         Data Sources          Analytics Engine
         ─────────────         ────────────────
         yfinance (free)       PC Algorithm (causal-learn)
         Finnhub REST          Double ML (EconML)
         FRED API              LangGraph agents (Groq)
         RSS feedparser        SQLite cache
```

---

## API Reference

```
POST /api/v1/portfolio/analyze          → full analysis
GET  /api/v1/portfolio/{id}/causal-graph
GET  /api/v1/portfolio/{id}/backtest
GET  /api/v1/portfolio/{id}/sentiment
GET  /api/v1/portfolio/{id}/insights
WS   /api/v1/live/prices?tickers=AAPL,MSFT
```

---

## Deploy

### Backend → Render (free, no credit card)

1. Sign up at [render.com](https://render.com)
2. **New → Web Service** → connect this GitHub repo
3. Render auto-detects `render.yaml` — set environment variables in the dashboard:
   - `FINNHUB_API_KEY`, `FRED_API_KEY`, `GROQ_API_KEY`
4. Click **Deploy**

> **Keep it warm (optional):** Add a free [UptimeRobot](https://uptimerobot.com) monitor
> pinging `https://your-app.onrender.com/api/v1/health` every 5 min to avoid cold starts.

### Frontend → Vercel

```bash
cd frontend
npx vercel
# Set: NEXT_PUBLIC_API_URL=https://hft-causal-platform.onrender.com
```

---

## Tests

```bash
cd backend
PYTHONPATH=. pytest tests/test_causal_service.py -v   # pure unit tests
PYTHONPATH=. pytest tests/test_api.py -v -k "not analyze"
```

---

Built by **Aditya Tornekar** · [GitHub](https://github.com/ADITYATORNEKAR)

*Causal inference in financial markets · Multi-agent systems · HFT data pipelines*
