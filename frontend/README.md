# PortfolioIQ — Frontend

Next.js 14 frontend for PortfolioIQ, an AI-powered portfolio intelligence platform.

## Tech Stack

| Layer | Tool |
|-------|------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Charts | Recharts (area, line, bar) |
| Causal graph | D3.js (force-directed DAG) |
| State / data fetching | TanStack Query (React Query) |
| Icons | Lucide React |
| Language | TypeScript |

## Setup

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000 for local dev
npm run dev
# → http://localhost:3000
```

## Key Components

| Component | Description |
|-----------|-------------|
| `PortfolioForm` | Stock search with autocomplete, manual holdings entry, and CSV drag-and-drop upload |
| `ForecastChart` | FB Prophet 12-month forecast per ticker with 30d/60d/90d/6m/1y horizon toggle, sentiment-adjusted 30d card |
| `PortfolioForecastChart` | Combined portfolio-level dollar forecast weighted by holdings |
| `AgentInsights` | LangGraph AI agent output — key findings, risk assessment, BUY/HOLD/TRIM signals |
| `CausalGraph` | Interactive D3 force-directed graph of causal relationships |
| `BacktestChart` | Cumulative returns vs SPY, performance metrics table |
| `SentimentPanel` | VADER sentiment scores per ticker with article headlines |
| `OptimizerPanel` | Max Sharpe / Min Volatility / Equal Weight allocation cards |
| `LivePriceCard` | WebSocket real-time price with change % and signal indicator |

## Directory Structure

```
src/
  app/
    layout.tsx          # Nav, footer, QueryClientProvider
    page.tsx            # Landing page
    analyze/page.tsx    # Main analysis page
  components/           # All UI components (see above)
  lib/
    api.ts              # API client (fetch wrappers)
    types.ts            # TypeScript interfaces matching backend schemas
  styles/
    globals.css         # Tailwind base + custom dark theme tokens
```

## CSV Upload Format

The portfolio form accepts CSV files with the following columns:

```csv
ticker,quantity,purchase_price
AAPL,10,150.00
MSFT,5,320.00
NVDA,8,220.00
```

Column aliases supported:
- Ticker: `ticker` / `symbol` / `stock`
- Quantity: `quantity` / `qty` / `shares` / `units`
- Price: `purchase_price` / `avg_price` / `price` / `cost` / `cost_basis`

## Deployment

```bash
npx vercel --prod
# Set NEXT_PUBLIC_API_URL to the Render backend URL in Vercel project settings
```
