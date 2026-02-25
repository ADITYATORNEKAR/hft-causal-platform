# PortfolioIQ

> **AI-powered portfolio intelligence — discover what *causes* your portfolio to move, not just what correlates.**

A full-stack portfolio analytics platform combining causal inference, 12-month AI forecasting, portfolio optimization, and multi-agent AI insights. Built entirely on a **100% free** stack — no credit card, no paid tiers.

Live demo: `https://hft-causal-platform.vercel.app` · API docs: `https://hft-causal-platform.onrender.com/docs`

---

## What It Does

Upload a CSV or enter your holdings and get:

| Feature | Description |
|---------|-------------|
| **Causal Graph** | Interactive D3 DAG — which assets actually drive others (PC algorithm + Double ML) |
| **12-Month Forecasts** | Per-ticker FB Prophet forecasts with 80% confidence bands across 30d / 60d / 90d / 6m / 1y |
| **Portfolio Optimizer** | Max Sharpe, Min Volatility, Equal Weight allocations (mean-variance, scipy SLSQP) |
| **AI Agent Insights** | LangGraph 4-node pipeline (Groq Llama-3.3-70b) fetches live Finnhub news + FRED macro to produce prescriptive BUY/HOLD/TRIM signals |
| **Backtest** | Equal-weight portfolio vs SPY — Sharpe, Sortino, Calmar, Max Drawdown, Alpha, Beta |
| **Sentiment** | VADER sentiment on Finnhub news, overlaid on 30-day forecasts |
| **Live Prices** | WebSocket real-time price cards with change % and sentiment signal |
| **CSV Upload** | Upload portfolio holdings (ticker, quantity, purchase_price) via drag-and-drop or file picker |

---

## Free Stack — No Credit Card Ever

| Layer | Tool | API Key? | Cost |
|-------|------|----------|------|
| Historical prices | `yfinance` | None | Free |
| Real-time quotes | Finnhub REST | Free signup | Free |
| News headlines | Finnhub REST | Free signup | Free |
| Macro indicators | FRED API | Free signup | Free |
| Causal discovery | causal-learn (PC algorithm) | — | Open source |
| Treatment effects | EconML (Double ML) | — | Open source |
| Price forecasting | FB Prophet | — | Open source |
| Portfolio optimization | scipy SLSQP | — | Open source |
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

> **No keys needed to run the app.** yfinance handles all historical data with no key. Rule-based insights replace the LLM agents as a fallback when `GROQ_API_KEY` is not set.

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
         FRED API              FB Prophet (forecasting)
                               scipy SLSQP (optimizer)
                               LangGraph agents (Groq)
                               VADER sentiment
                               SQLite cache
```

### AI Agent Pipeline (LangGraph)

```
researcher → [Finnhub news + FRED macro tools] → analyst → risk → synthesizer
```

1. **Researcher** — calls Finnhub `/company-news` and FRED `/series/observations` for live context
2. **Portfolio Analyst** — compares cost basis × 12m Prophet forecast × Max Sharpe weights
3. **Risk Agent** — prescriptive rebalancing from weight drift vs optimal allocation
4. **Synthesizer** — emits BUY / HOLD / TRIM / REBALANCE signals per position

---

## API Reference

```
POST /api/v1/portfolio/analyze          → full analysis (causal + forecast + backtest + insights)
GET  /api/v1/portfolio/{id}/causal-graph
GET  /api/v1/portfolio/{id}/backtest
GET  /api/v1/portfolio/{id}/sentiment
GET  /api/v1/portfolio/{id}/insights
GET  /api/v1/portfolio/{id}/optimize    → Max Sharpe / Min Vol / Equal Weight allocations
WS   /api/v1/live/prices?tickers=AAPL,MSFT
```

---

## Deployment

### Backend → Render (free, no credit card)

1. Sign up at [render.com](https://render.com)
2. **New → Web Service** → connect the GitHub repo
3. Render auto-detects `render.yaml` — set environment variables in the dashboard:
   - `FINNHUB_API_KEY`, `FRED_API_KEY`, `GROQ_API_KEY`
4. Click **Deploy**

> **Keep it warm (optional):** Add a free [UptimeRobot](https://uptimerobot.com) monitor pinging `https://your-app.onrender.com/api/v1/health` every 5 min to avoid cold starts.

### Frontend → Vercel

```bash
cd frontend
npx vercel --prod
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

## Roadmap

| Feature | Description |
|---------|-------------|
| **10-K / 10-Q Integration** | Parse last 4 quarters of SEC filings to enrich forecast context and AI insights with forward-looking guidance |
| **Strategy Simulations** | Backtest user-defined buying strategies (DCA, momentum, value averaging) across historical data |
| **Uber Orbit Forecasting** | Add Uber Orbit and other forecasting-at-scale models alongside FB Prophet for ensemble predictions |
| **Extended Agentic Usecases** | Sector rotation agent, macro regime detection, automated rebalancing suggestions |

---

Built by **Aditya Tornekar** · [GitHub](https://github.com/ADITYATORNEKAR)

*Causal inference · Multi-agent AI · Time-series forecasting · Portfolio optimization*
