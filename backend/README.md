# PortfolioIQ — Backend

FastAPI backend for PortfolioIQ, an AI-powered portfolio intelligence platform.

## Tech Stack

| Layer | Tool |
|-------|------|
| API framework | FastAPI + Uvicorn |
| Causal discovery | causal-learn (PC algorithm) |
| Treatment effects | EconML (Double ML) |
| Price forecasting | FB Prophet |
| Portfolio optimization | scipy SLSQP (mean-variance) |
| AI agents | LangGraph + Groq Llama-3.3-70b |
| Sentiment analysis | VADER (nltk) |
| Data | yfinance, Finnhub REST, FRED REST |
| Cache / DB | SQLite (zero-config) |
| Language | Python 3.9+ |

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # add optional free API keys

cd backend
uvicorn app.main:app --reload --port 8000
# API docs → http://localhost:8000/docs
```

## Environment Variables

```env
GROQ_API_KEY=      # Groq console.groq.com — free, 500 req/day
FINNHUB_API_KEY=   # finnhub.io — free, 60 calls/min
FRED_API_KEY=      # fred.stlouisfed.org — free, unlimited
```

All keys are optional — the app falls back to rule-based insights and omits external data fetches.

## API Endpoints

```
POST /api/v1/portfolio/analyze
     Body: {tickers, period, benchmark, positions?, finnhub_api_key?, groq_api_key?}
     → Full analysis: causal graph, forecasts, backtest, optimizer, sentiment, AI insights

GET  /api/v1/portfolio/{id}/causal-graph   → PC algorithm DAG + Double ML edge strengths
GET  /api/v1/portfolio/{id}/backtest       → Sharpe, Sortino, Calmar, MDD, Alpha, Beta vs SPY
GET  /api/v1/portfolio/{id}/sentiment      → VADER scores per ticker + article headlines
GET  /api/v1/portfolio/{id}/insights       → LangGraph AI agent output (key findings, signals)
GET  /api/v1/portfolio/{id}/optimize       → Max Sharpe / Min Volatility / Equal Weight weights

WS   /api/v1/live/prices?tickers=AAPL,MSFT  → Real-time Finnhub price stream
```

## Service Architecture

```
app/services/
  forecast_service.py    — FB Prophet per-ticker 12-month forecasts; lag-aware window extension
  optimizer_service.py   — Mean-variance optimization; covariance matrix from daily returns
  agent_service.py       — LangGraph 4-node pipeline:
                             researcher → analyst → risk → synthesizer
                           Finnhub news + FRED macro tools; rule-based fallback
  causal_service.py      — PC algorithm causal discovery + Double ML treatment effects
  backtest_service.py    — Historical backtest vs benchmark
  sentiment_service.py   — VADER sentiment on news headlines; 30d forecast adjustment
```

## Tests

```bash
cd backend
PYTHONPATH=. pytest tests/test_causal_service.py -v   # unit tests, no network
PYTHONPATH=. pytest tests/test_api.py -v -k "not analyze"
```

## Deployment → Render (free)

1. Sign up at [render.com](https://render.com)
2. **New → Web Service** → connect the GitHub repo
3. Render reads `render.yaml` automatically
4. Set environment variables in the Render dashboard
5. Deploy

> The free Render tier spins down after inactivity. Use [UptimeRobot](https://uptimerobot.com) to ping `/api/v1/health` every 5 minutes.
