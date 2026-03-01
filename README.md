# PortfolioIQ

> **Smarter decisions driven by causation, not just correlation.**
> Have your portfolio optimized and unlock 12-month forecasts, advanced simulations and prescriptive AI insights.

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
git clone https://github.com/ADITYATORNEKAR/portfolioiq
cd portfolioiq

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

![PortfolioIQ Architecture](Architecture.png)

### System Overview

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
         Yahoo Finance RSS     scipy SLSQP (optimizer)
                               LangGraph agents (Groq)
                               VADER sentiment
                               SQLite cache
```

### AI Agent Pipeline (LangGraph)

```
researcher → [Finnhub news + FRED macro tools] → analyst → risk → synthesizer
```

| Agent | Role |
|-------|------|
| **Researcher** | Calls Finnhub `/company-news` and FRED `/series/observations` for live market context |
| **Portfolio Analyst** | Compares cost basis × 12m Prophet forecast × Max Sharpe optimal weights |
| **Risk Agent** | Prescriptive rebalancing from weight drift vs optimal allocation |
| **Synthesizer** | Emits BUY / HOLD / TRIM / REBALANCE signals per position with narrative |

---

## Sample AI Insights Output

### Signals & Recommendations

| Signal | Ticker | 1Y Forecast | vs Optimal Weight | Notes |
|--------|--------|------------|-------------------|-------|
| 🟢 **BUY** | MU | +80.7% → $763.69 | Underweight −12.4% | Positive sentiment score 0.39 |
| 🟢 **BUY** | TRGP | +18.0% → $266.78 | Underweight −14.4% | Positive news flow score 0.40 |
| 🟢 **HOLD/ADD** | AVGO | +39.4% → $454.41 | — | Cost basis $346.15 — strong upside |
| 🟢 **HOLD/ADD** | FANG | +13.8% → $191.66 | Near optimal | Cost basis $153.90 |
| 🟡 **HOLD** | ET | +7.6% → $20.05 | Near optimal | Cost $16.63 |
| 🟡 **HOLD** | LNG | +1.9% → $224.57 | Near optimal | Cost $200.00 |
| 🟡 **HOLD** | PSN | +9.5% → $70.12 | Near optimal | Cost $85.83; sentiment 0.42 |
| 🔴 **TRIM** | META | −10.5% | Overweight +6.6% | Negative forecast + overweight |
| 🔴 **TRIM** | NFLX | −26.8% | Overweight +10.5% | Strong downside — reduce exposure |
| 🔴 **REBALANCE** | AMZN | −3.0% | Overweight +10.1% | Trim to target despite forecast |
| 🔴 **REBALANCE** | MSFT | −0.2% | Overweight +30.4% | Largest weight drift — trim to target |
| 🔴 **MONITOR** | TRMB | −6.7% | — | Reduce if thesis doesn't hold; sentiment 0.38 |

### Full Analysis

**Rebalancing Summary**

| Action | Tickers | Rationale |
|--------|---------|-----------|
| ➕ Increase | MU, TRGP, FANG, ET, AVGO | Underweight with strong upside forecasts and positive sentiment |
| ➖ Reduce | META, NFLX, MSFT, AMZN, TRMB, PSN | Overweight and/or weak / negative 1-year forecast |
| ⭐ Best risk/reward | AVGO | Current $332.31 → 1y target $454.41 (+39.4%) |
| 🌐 Key macro catalyst | PSN border tech contract wins may be undervalued; broader risk from AVGO/AMZN weight in tech |

**Risk Assessment**

| Metric | Value | Interpretation |
|--------|-------|----------------|
| Overall Risk | **Medium** | Moderate risk-adjusted return profile |
| Sharpe Ratio | 0.85 | Acceptable return per unit of risk |
| Max Drawdown | −18.01% | Significant potential decline |
| Beta | 1.15 | Slightly more volatile than market |

**Suggested Trims** *(overweight positions)*

| Ticker | Current Weight | Target Weight | Trim By | Reason |
|--------|---------------|--------------|---------|--------|
| MSFT | ~30.4% excess | 0% optimal | −30.4% | Large overweight; −0.2% forecast |
| NFLX | ~10.5% excess | 0% optimal | −10.5% | −26.8% forecast |
| AMZN | ~10.1% excess | 0% optimal | −10.1% | −3.0% forecast; positive sentiment not sufficient |
| META | ~6.6% excess | 0% optimal | −6.6% | −10.5% forecast; neutral sentiment |
| AVGO | ~8.5% excess | 16.7% optimal | −8.5% | Strong forecast but reduce concentration risk |

**Suggested Adds** *(underweight positions with positive forecasts)*

| Ticker | Current Weight | Target Weight | Add By | Reason |
|--------|---------------|--------------|--------|--------|
| MU | ~4.3% | 16.7% | +12.4% | +80.7% forecast; sentiment 0.39 |
| TRGP | ~2.3% | 16.7% | +14.4% | +18.0% forecast; sentiment 0.40 |
| FANG | ~1.7% | 16.7% | +15.0% | +13.8% forecast; positive sentiment |
| ET | ~0.2% | 16.7% | +16.5% | +7.6% forecast; positive sentiment |
| PSN | ~4.1% | 16.7% | +12.6% | +9.5% forecast; sentiment 0.42 |

> **Hedge suggestion:** Allocate ~5% to a volatility index fund (VIX-linked) or inverse market ETF (e.g. SH) to buffer against broad market drawdown given Beta > 1.

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

## Future Roadmap

| Feature | Description |
|---------|-------------|
| **Sector Heatmap & Top Picks** | Heatmap and visual ranking of top 5 stocks per sector in the Simulation tab to guide decision-making and sector allocation |
| **Growth Signal Factors** | Explore additional forward-looking signals (earnings revisions, insider activity, options flow, factor exposures) to enrich portfolio forecasts |
| **10-K / 10-Q Integration** | Parse last 4 quarters of SEC filings to enrich forecast context and AI insights with forward-looking guidance |
| **Strategy Simulations** | Backtest user-defined buying strategies (DCA, momentum, value averaging) across historical data |
| **Uber Orbit Forecasting** | Add Uber Orbit and other forecasting-at-scale models alongside FB Prophet for ensemble predictions |
| **Extended Agentic Usecases** | Sector rotation agent, macro regime detection, automated rebalancing suggestions |

---

Built by **Aditya Tornekar** · [GitHub](https://github.com/ADITYATORNEKAR)

*Causal inference · Multi-agent AI · Time-series forecasting · Portfolio optimization*
