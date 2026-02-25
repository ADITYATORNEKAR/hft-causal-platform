"""
Portfolio API Routes

POST /api/v1/portfolio/analyze              → run full analysis, store in SQLite
GET  /api/v1/portfolio/search?q=Microsoft  → ticker search via Finnhub
GET  /api/v1/portfolio/{id}/causal-graph
GET  /api/v1/portfolio/{id}/backtest
GET  /api/v1/portfolio/{id}/sentiment
GET  /api/v1/portfolio/{id}/insights
GET  /api/v1/portfolio/{id}/forecast
"""

import hashlib
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AgentInsights,
    BacktestResult,
    CausalGraph,
    ForecastResult,
    OptimizationResult,
    PortfolioAllocation,
    PortfolioPositionSummary,
    PortfolioRequest,
    PortfolioResponse,
    SentimentResult,
    TickerPnL,
    TickerSearchResult,
)
from app.services.agent_service import generate_insights
from app.services.backtest_service import run_backtest
from app.services.causal_service import run_full_causal_pipeline
from app.services.data_service import fetch_portfolio_data, search_ticker
from app.services.forecast_service import (
    apply_sentiment_adjustment,
    build_forecast_summary,
    build_portfolio_forecast,
    run_portfolio_forecast,
)
from app.services.optimizer_service import build_covariance_matrix, optimize_portfolio
from app.services.sentiment_service import fetch_portfolio_sentiment

router = APIRouter()
DB_PATH = Path("/tmp/hft_causal.db")


def _get_db():
    return sqlite3.connect(DB_PATH)


def _portfolio_id(tickers: list[str], period: str, benchmark: str) -> str:
    key = f"{'_'.join(sorted(tickers))}_{period}_{benchmark}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


# ── Ticker Search ─────────────────────────────────────────────────────────────

@router.get("/search", response_model=list[TickerSearchResult])
async def search_tickers(q: str, finnhub_api_key: Optional[str] = None):
    """Search for tickers by company name (e.g. 'Microsoft' → MSFT)."""
    if not q or len(q.strip()) < 2:
        return []
    results = await search_ticker(q.strip(), finnhub_api_key)
    return results


# ── Full Analysis ─────────────────────────────────────────────────────────────

@router.post("/analyze", response_model=PortfolioResponse)
async def analyze_portfolio(req: PortfolioRequest):
    """
    Kick off a full portfolio analysis:
      1. Fetch historical data (yfinance — free)
      2. Causal discovery (PC algorithm, α=0.1 + correlation matrix)
      3. Backtest (equal-weight vs benchmark)
      4. Sentiment (Finnhub/RSS + VADER)
      5. Prophet forecasting (per-ticker, 365 days)
      6. AI insights (Groq Llama-3.3-70b, if key provided)

    All results are cached in SQLite for fast subsequent reads.
    """
    portfolio_id = _portfolio_id(req.tickers, req.period, req.benchmark)

    # --- Fetch price data ---
    try:
        data = await fetch_portfolio_data(req.tickers, req.period, req.benchmark)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch market data: {e}")

    prices = data["prices"]
    returns = data["returns"]
    info = data["info"]

    # Validate tickers were actually downloaded
    available_tickers = [t for t in req.tickers if t in prices.columns]
    if not available_tickers:
        raise HTTPException(
            status_code=422,
            detail=f"No valid ticker data found. Check symbols: {req.tickers}",
        )

    # --- Compute P&L if positions provided ---
    pnl_summary = None
    pnl_summary_dict = None
    if req.positions:
        positions_list = []
        total_cost = 0.0
        total_value = 0.0
        for pos in req.positions:
            ticker = pos.ticker.upper()
            if ticker not in prices.columns:
                continue
            current_price = float(prices[ticker].dropna().iloc[-1])
            total_cost_pos = pos.quantity * pos.purchase_price
            current_value_pos = pos.quantity * current_price
            pnl = current_value_pos - total_cost_pos
            pnl_pct = (pnl / total_cost_pos) * 100 if total_cost_pos > 0 else 0.0
            positions_list.append(TickerPnL(
                ticker=ticker,
                quantity=pos.quantity,
                purchase_price=round(pos.purchase_price, 2),
                current_price=round(current_price, 2),
                total_cost=round(total_cost_pos, 2),
                current_value=round(current_value_pos, 2),
                pnl=round(pnl, 2),
                pnl_pct=round(pnl_pct, 2),
            ))
            total_cost += total_cost_pos
            total_value += current_value_pos

        if positions_list:
            total_pnl = total_value - total_cost
            total_pnl_pct = (total_pnl / total_cost) * 100 if total_cost > 0 else 0.0
            pnl_summary = PortfolioPositionSummary(
                positions=positions_list,
                total_cost=round(total_cost, 2),
                total_value=round(total_value, 2),
                total_pnl=round(total_pnl, 2),
                total_pnl_pct=round(total_pnl_pct, 2),
            )
            pnl_summary_dict = pnl_summary.model_dump()

    # --- Causal discovery ---
    try:
        causal_graph = run_full_causal_pipeline(returns[available_tickers].dropna())
    except Exception as e:
        causal_graph = {"nodes": [], "edges": [], "correlation_matrix": {}, "error": str(e)}

    # --- Backtest ---
    try:
        backtest = run_backtest(prices, available_tickers, benchmark=req.benchmark)
    except Exception as e:
        backtest = {"timeseries": [], "metrics": {}, "error": str(e)}

    # --- Sentiment ---
    try:
        sentiment = await fetch_portfolio_sentiment(
            available_tickers, finnhub_api_key=req.finnhub_api_key
        )
    except Exception as e:
        sentiment = {"ticker_sentiment": {}, "error": str(e)}

    # --- Prophet Forecasting ---
    portfolio_forecast_dict = None
    try:
        ticker_forecasts = await run_portfolio_forecast(prices, available_tickers)
        # Apply sentiment adjustment to 30d forecasts (±5% cap)
        ticker_forecasts = apply_sentiment_adjustment(ticker_forecasts, sentiment)
        forecast_summary = build_forecast_summary(ticker_forecasts)

        # Build combined 12-month portfolio forecast if positions provided
        if req.positions:
            pos_for_pf = [
                {
                    "ticker": pos.ticker.upper(),
                    "quantity": pos.quantity,
                    "current_price": float(prices[pos.ticker.upper()].dropna().iloc[-1])
                    if pos.ticker.upper() in prices.columns else pos.purchase_price,
                }
                for pos in req.positions
            ]
            portfolio_forecast_dict = build_portfolio_forecast(ticker_forecasts, pos_for_pf)
    except Exception as e:
        ticker_forecasts = {}
        forecast_summary = {}

    # --- Build & cache covariance matrix for optimizer ---
    cov_matrix_json = "[]"
    try:
        port_returns_only = returns[[t for t in available_tickers if t in returns.columns]].dropna()
        returns_dict = {col: port_returns_only[col].tolist() for col in port_returns_only.columns}
        cov = build_covariance_matrix(returns_dict, available_tickers)
        if cov is not None:
            cov_matrix_json = json.dumps(cov)
    except Exception:
        pass

    # --- Portfolio Optimization (inline, so agent has access to optimal weights) ---
    optimization_result = None
    try:
        if cov_matrix_json and cov_matrix_json != "[]":
            cov = json.loads(cov_matrix_json)
            exp_returns: dict[str, float] = {}
            for ticker in available_tickers:
                tf = ticker_forecasts.get(ticker, {})
                hist = tf.get("historical", [])
                fc_1y = tf.get("forecast_1y", {})
                if hist and fc_1y and hist[-1].get("yhat", 0) > 0:
                    current = hist[-1]["yhat"]
                    future = fc_1y.get("yhat", current)
                    exp_returns[ticker] = ((future - current) / current) * 100
                else:
                    exp_returns[ticker] = 0.0
            if len(available_tickers) >= 2:
                optimization_result = optimize_portfolio(available_tickers, exp_returns, cov)
    except Exception:
        pass

    # Build raw positions list for the agent (includes purchase_price + current_price)
    positions_for_agent = []
    if pnl_summary_dict:
        for pos_data in pnl_summary_dict.get("positions", []):
            positions_for_agent.append(pos_data)

    # --- AI Insights ---
    try:
        insights = await generate_insights(
            causal_graph=causal_graph,
            backtest_metrics=backtest.get("metrics", {}),
            sentiment=sentiment,
            pnl_summary=pnl_summary_dict,
            forecast_summary=forecast_summary,
            optimization_result=optimization_result,
            positions=positions_for_agent,
            groq_api_key=req.groq_api_key,
            finnhub_api_key=req.finnhub_api_key,
        )
    except Exception as e:
        insights = {"key_findings": [], "agent_narrative": str(e), "error": str(e)}

    # --- Cache in SQLite ---
    now = time.time()
    conn = _get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT OR REPLACE INTO portfolios VALUES (?,?,?,?,?)",
            (portfolio_id, json.dumps(available_tickers), req.period, req.benchmark, now),
        )
        cur.execute(
            "INSERT OR REPLACE INTO causal_graphs VALUES (?,?,?,?)",
            (
                portfolio_id,
                json.dumps(causal_graph.get("nodes", [])),
                json.dumps(causal_graph.get("edges", [])),
                now,
            ),
        )
        # Store enriched causal data (with correlation matrix)
        cur.execute(
            "INSERT OR REPLACE INTO causal_graphs_v2 VALUES (?,?,?,?,?)",
            (
                portfolio_id,
                json.dumps(causal_graph.get("nodes", [])),
                json.dumps(causal_graph.get("edges", [])),
                json.dumps(causal_graph.get("correlation_matrix", {})),
                now,
            ),
        )
        cur.execute(
            "INSERT OR REPLACE INTO backtest_results VALUES (?,?,?,?)",
            (
                portfolio_id,
                json.dumps(backtest.get("timeseries", [])),
                json.dumps(backtest.get("metrics", {})),
                now,
            ),
        )
        cur.execute(
            "INSERT OR REPLACE INTO agent_insights VALUES (?,?,?)",
            (portfolio_id, json.dumps(insights), now),
        )
        # Cache forecasts (ticker + combined portfolio forecast)
        forecast_cache = {
            "ticker_forecasts": ticker_forecasts,
            "portfolio_forecast": portfolio_forecast_dict,
        }
        cur.execute(
            "INSERT OR REPLACE INTO forecasts VALUES (?,?,?)",
            (portfolio_id, json.dumps(forecast_cache), now),
        )
        # Cache returns + covariance for optimizer
        cur.execute(
            "INSERT OR REPLACE INTO portfolio_returns VALUES (?,?,?,?,?)",
            (
                portfolio_id,
                json.dumps(available_tickers),
                "{}",  # raw returns not stored (large); cov is enough
                cov_matrix_json,
                now,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    # --- Summary ---
    port_metrics = backtest.get("metrics", {})
    ticker_returns = {}
    for ticker in available_tickers:
        if ticker in prices.columns:
            series = prices[ticker].dropna()
            if len(series) >= 2:
                ticker_returns[ticker] = float((series.iloc[-1] / series.iloc[0]) - 1) * 100

    top_ticker = max(ticker_returns, key=ticker_returns.get) if ticker_returns else available_tickers[0]

    date_range = ""
    if len(prices) > 0:
        first = prices.index[0].strftime("%Y-%m-%d")
        last = prices.index[-1].strftime("%Y-%m-%d")
        date_range = f"{first} to {last}"

    return PortfolioResponse(
        portfolio_id=portfolio_id,
        tickers=available_tickers,
        period=req.period,
        benchmark=req.benchmark,
        status="complete",
        summary={
            "ticker_count": len(available_tickers),
            "date_range": date_range,
            "trading_days": len(prices),
            "top_performer": top_ticker,
            "top_performer_return": round(ticker_returns.get(top_ticker, 0), 2),
            "portfolio_total_return": port_metrics.get("total_return", 0),
            "benchmark_total_return": port_metrics.get("benchmark_total_return", 0),
        },
        pnl_summary=pnl_summary,
    )


# ── Cached Result Endpoints ───────────────────────────────────────────────────

@router.get("/{portfolio_id}/causal-graph", response_model=CausalGraph)
def get_causal_graph(portfolio_id: str):
    conn = _get_db()
    try:
        cur = conn.cursor()
        # Try v2 table first (has correlation matrix)
        row = cur.execute(
            "SELECT nodes_json, edges_json, correlation_json FROM causal_graphs_v2 WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
        if not row:
            # Fall back to original table
            row2 = cur.execute(
                "SELECT nodes_json, edges_json FROM causal_graphs WHERE portfolio_id = ?",
                (portfolio_id,),
            ).fetchone()
            if not row2:
                raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")
            nodes = json.loads(row2[0])
            edges = json.loads(row2[1])
            correlation_matrix = None
        else:
            nodes = json.loads(row[0])
            edges = json.loads(row[1])
            correlation_matrix = json.loads(row[2]) if row[2] else None
    finally:
        conn.close()

    message = (
        "No causal links detected — assets move independently (good diversification)."
        if not edges
        else f"Found {len(edges)} directed causal relationships."
    )

    return CausalGraph(
        portfolio_id=portfolio_id,
        nodes=nodes,
        edges=edges,
        message=message,
        correlation_matrix=correlation_matrix,
    )


@router.get("/{portfolio_id}/backtest", response_model=BacktestResult)
def get_backtest(portfolio_id: str):
    conn = _get_db()
    try:
        cur = conn.cursor()
        row = cur.execute(
            "SELECT timeseries_json, metrics_json FROM backtest_results WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")

    return BacktestResult(
        portfolio_id=portfolio_id,
        timeseries=json.loads(row[0]),
        metrics=json.loads(row[1]),
    )


@router.get("/{portfolio_id}/sentiment", response_model=SentimentResult)
async def get_sentiment(
    portfolio_id: str,
    finnhub_api_key: Optional[str] = None,
):
    """Re-fetch live sentiment (not cached — news changes frequently)."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT tickers FROM portfolios WHERE id = ?", (portfolio_id,)
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")

    tickers = json.loads(row[0])
    sentiment = await fetch_portfolio_sentiment(tickers, finnhub_api_key=finnhub_api_key)

    return SentimentResult(
        portfolio_id=portfolio_id,
        ticker_sentiment=sentiment["ticker_sentiment"],
    )


@router.get("/{portfolio_id}/insights", response_model=AgentInsights)
def get_insights(portfolio_id: str):
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT insights_json FROM agent_insights WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")

    data = json.loads(row[0])
    return AgentInsights(portfolio_id=portfolio_id, **data)


@router.get("/{portfolio_id}/forecast", response_model=ForecastResult)
def get_forecast(portfolio_id: str):
    """Return Prophet forecasts for all tickers in the portfolio."""
    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT forecast_json FROM forecasts WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
    finally:
        conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")

    cached = json.loads(row[0])
    # Support both old format (plain dict of ticker_forecasts) and new format
    if isinstance(cached, dict) and "ticker_forecasts" in cached:
        ticker_forecasts = cached["ticker_forecasts"]
        portfolio_forecast = cached.get("portfolio_forecast")
    else:
        ticker_forecasts = cached  # legacy: was stored as plain ticker dict
        portfolio_forecast = None

    return ForecastResult(
        portfolio_id=portfolio_id,
        ticker_forecasts=ticker_forecasts,
        portfolio_forecast=portfolio_forecast,
    )


@router.get("/{portfolio_id}/optimize", response_model=OptimizationResult)
def get_optimization(portfolio_id: str):
    """
    Return mean-variance optimised portfolio allocations.

    Uses Prophet 1-year expected returns as mu and historical daily return
    covariance (annualised) as the risk model.
    Three strategies: Max Sharpe, Min Volatility, Equal Weight.
    """
    conn = _get_db()
    try:
        cur = conn.cursor()
        # Load tickers + covariance
        ret_row = cur.execute(
            "SELECT tickers_json, cov_matrix_json FROM portfolio_returns WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
        # Load forecast for expected returns
        fc_row = cur.execute(
            "SELECT forecast_json FROM forecasts WHERE portfolio_id = ?",
            (portfolio_id,),
        ).fetchone()
    finally:
        conn.close()

    if not ret_row or not fc_row:
        raise HTTPException(status_code=404, detail="Portfolio not found. Run /analyze first.")

    tickers = json.loads(ret_row[0])
    cov_matrix = json.loads(ret_row[1])
    cached_fc = json.loads(fc_row[0])
    # Handle both new {ticker_forecasts, portfolio_forecast} and legacy plain dict format
    ticker_forecasts = cached_fc.get("ticker_forecasts", cached_fc) if isinstance(cached_fc, dict) and "ticker_forecasts" in cached_fc else cached_fc

    if not cov_matrix:
        raise HTTPException(
            status_code=422,
            detail="Covariance matrix unavailable — not enough historical data.",
        )

    # Build expected returns dict from Prophet 1y forecast
    expected_returns: dict[str, float] = {}
    for ticker in tickers:
        tf = ticker_forecasts.get(ticker, {})
        hist = tf.get("historical", [])
        fc_1y = tf.get("forecast_1y", {})
        if hist and fc_1y and hist[-1].get("yhat", 0) > 0:
            current = hist[-1]["yhat"]
            future = fc_1y.get("yhat", current)
            expected_returns[ticker] = ((future - current) / current) * 100
        else:
            expected_returns[ticker] = 0.0

    result = optimize_portfolio(tickers, expected_returns, cov_matrix)

    return OptimizationResult(
        portfolio_id=portfolio_id,
        max_sharpe=PortfolioAllocation(**result["max_sharpe"]),
        min_volatility=PortfolioAllocation(**result["min_volatility"]),
        equal_weight=PortfolioAllocation(**result["equal_weight"]),
    )
