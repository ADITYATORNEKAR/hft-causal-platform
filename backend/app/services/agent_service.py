"""
AI Agent Service — multi-agent portfolio analysis using LangGraph + Groq.

Architecture (LangGraph StateGraph):
  1. ResearcherAgent       — calls Finnhub news + FRED macro tools to gather context
  2. PortfolioAnalystAgent — compares actual holdings/cost-basis vs 12m forecasts & optimal weights
  3. RiskAgent             — prescriptive rebalancing based on weight drift vs Max Sharpe
  4. SynthesizerAgent      — emits BUY / HOLD / TRIM signals and a cohesive narrative

LLM: Groq Llama-3.3-70b-versatile (free tier, no credit card required)
     → console.groq.com — 6,000 tokens/min, 500 req/day

External tools (both free, no credit card):
  - fetch_news_headlines(ticker)        — Finnhub free REST API (/company-news)
  - fetch_macro_indicators(series_ids)  — FRED free REST API (FEDFUNDS, CPI, etc.)

Falls back to deterministic rule-based insights if no GROQ_API_KEY is set.
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Annotated, Optional, TypedDict

import httpx

logger = logging.getLogger(__name__)


# ── External Tool Definitions ─────────────────────────────────────────────────

def _make_tools():
    """Create LangChain tool objects. Returns (tools, ok) tuple."""
    try:
        from langchain_core.tools import tool

        @tool
        def fetch_news_headlines(ticker: str) -> str:
            """
            Fetch recent news headlines for a stock ticker from Finnhub to identify
            near-term catalysts (earnings, product launches, regulatory events, etc.).

            Args:
                ticker: Stock ticker symbol (e.g. 'AAPL', 'MSFT', 'NVDA')

            Returns:
                Formatted list of recent headlines with dates and sources.
            """
            api_key = os.getenv("FINNHUB_API_KEY", "")
            if not api_key:
                return f"[{ticker}] No FINNHUB_API_KEY in environment — skipping news fetch."

            today = datetime.now()
            from_date = (today - timedelta(days=14)).strftime("%Y-%m-%d")
            to_date = today.strftime("%Y-%m-%d")

            try:
                resp = httpx.get(
                    "https://finnhub.io/api/v1/company-news",
                    params={"symbol": ticker, "from": from_date, "to": to_date, "token": api_key},
                    timeout=10.0,
                )
                resp.raise_for_status()
                articles = resp.json()[:8]

                if not articles:
                    return f"[{ticker}] No news found in the past 14 days."

                lines = []
                for art in articles:
                    ts = art.get("datetime", 0)
                    dt = datetime.fromtimestamp(ts).strftime("%Y-%m-%d") if ts else "unknown"
                    lines.append(
                        f"  [{dt}] {art.get('headline', 'N/A')} "
                        f"(source: {art.get('source', 'unknown')})"
                    )
                return f"Recent news for {ticker} (past 14 days):\n" + "\n".join(lines)

            except Exception as e:
                return f"[{ticker}] Error fetching Finnhub news: {e}"

        @tool
        def fetch_macro_indicators(series_ids: str) -> str:
            """
            Fetch macro-economic indicators from the Federal Reserve (FRED) to understand
            the interest-rate, inflation, and labour market backdrop.

            Recommended series IDs:
              FEDFUNDS   — Federal Funds Rate (monetary policy)
              CPIAUCSL   — Consumer Price Index (inflation)
              UNRATE     — Unemployment Rate
              DGS10      — 10-Year Treasury Yield
              T10YIE     — 10-Year Breakeven Inflation Rate

            Args:
                series_ids: Comma-separated FRED series IDs
                            e.g. 'FEDFUNDS,CPIAUCSL,UNRATE,DGS10'

            Returns:
                Latest values with month-over-month change for each series.
            """
            api_key = os.getenv("FRED_API_KEY", "")
            if not api_key:
                return "No FRED_API_KEY in environment — skipping macro data fetch."

            series_names = {
                "FEDFUNDS": "Federal Funds Rate",
                "CPIAUCSL": "CPI (Inflation Index)",
                "UNRATE": "Unemployment Rate",
                "DGS10": "10-Year Treasury Yield",
                "T10YIE": "10-Year Breakeven Inflation",
                "GDPC1": "Real GDP (Quarterly)",
                "MORTGAGE30US": "30-Year Mortgage Rate",
            }

            ids = [s.strip() for s in series_ids.split(",") if s.strip()][:5]
            results = []

            for sid in ids:
                try:
                    resp = httpx.get(
                        "https://api.stlouisfed.org/fred/series/observations",
                        params={
                            "series_id": sid,
                            "api_key": api_key,
                            "limit": 3,
                            "sort_order": "desc",
                            "file_type": "json",
                        },
                        timeout=10.0,
                    )
                    resp.raise_for_status()
                    obs = resp.json().get("observations", [])

                    if not obs:
                        results.append(f"{sid}: No data available")
                        continue

                    latest = obs[0]
                    prev = obs[1] if len(obs) > 1 else None
                    name = series_names.get(sid, sid)
                    val = latest.get("value", "N/A")

                    trend = ""
                    if prev and prev.get("value", ".") != "." and val != ".":
                        try:
                            delta = float(val) - float(prev["value"])
                            trend = f" (Δ {delta:+.2f} vs prior period)"
                        except (ValueError, TypeError):
                            pass

                    results.append(f"  {name} ({sid}): {val}% as of {latest['date']}{trend}")

                except Exception as e:
                    results.append(f"  {sid}: Error — {e}")

            return "Macro indicators (FRED):\n" + "\n".join(results)

        return [fetch_news_headlines, fetch_macro_indicators], True

    except ImportError:
        logger.warning("langchain_core not available — tools disabled")
        return [], False


# ── Rule-based fallback (no LLM required) ────────────────────────────────────

def _rule_based_insights(
    causal_graph: dict,
    backtest_metrics: dict,
    sentiment: dict,
    pnl_summary: Optional[dict] = None,
    forecast_summary: Optional[dict] = None,
    optimization_result: Optional[dict] = None,
) -> dict:
    """Generate structured insights without an LLM."""
    nodes = causal_graph.get("nodes", [])
    edges = causal_graph.get("edges", [])
    metrics = backtest_metrics

    findings = []

    # P&L insight
    if pnl_summary and pnl_summary.get("total_pnl") is not None:
        total_pnl = pnl_summary["total_pnl"]
        total_pnl_pct = pnl_summary["total_pnl_pct"]
        direction = "gain" if total_pnl >= 0 else "loss"
        findings.append(
            f"Portfolio P&L: ${abs(total_pnl):,.2f} {direction} "
            f"({'+' if total_pnl_pct >= 0 else ''}{total_pnl_pct:.2f}%) from purchase prices."
        )
        positions = pnl_summary.get("positions", [])
        if positions:
            best = max(positions, key=lambda p: p.get("pnl_pct", 0))
            worst = min(positions, key=lambda p: p.get("pnl_pct", 0))
            findings.append(
                f"Best position: {best['ticker']} (+{best['pnl_pct']:.1f}%). "
                f"Weakest position: {worst['ticker']} ({worst['pnl_pct']:.1f}%)."
            )

    # Causal driver
    if nodes:
        top_node = max(nodes, key=lambda n: n.get("centrality", 0))
        findings.append(
            f"{top_node['label']} is the most central asset in the causal network "
            f"(centrality score: {top_node['centrality']:.2f}), suggesting it drives "
            "returns in other portfolio assets."
        )

    if edges:
        strongest = max(edges, key=lambda e: e.get("weight", 0))
        findings.append(
            f"Strongest causal link: {strongest['source']} → {strongest['target']} "
            f"(effect size: {strongest['weight']:.4f}, direction: {strongest['direction']})"
        )
    else:
        findings.append(
            "No statistically significant causal links detected — "
            "assets appear to move independently (good diversification)."
        )

    # Backtest
    sharpe = metrics.get("sharpe_ratio", 0)
    mdd = metrics.get("max_drawdown", 0)
    alpha = metrics.get("alpha", 0)

    if sharpe > 1.5:
        findings.append(f"Strong risk-adjusted performance (Sharpe: {sharpe:.2f}).")
    elif sharpe > 1.0:
        findings.append(f"Solid risk-adjusted performance (Sharpe: {sharpe:.2f}).")
    else:
        findings.append(f"Below-average risk-adjusted returns (Sharpe: {sharpe:.2f}) — consider rebalancing.")

    if alpha > 0:
        findings.append(f"Portfolio generates positive alpha ({alpha:.2f}%) vs benchmark.")

    # Forecast-based signals — compare vs cost basis
    signals = []
    if forecast_summary:
        positions = (pnl_summary or {}).get("positions", [])
        total_value = (pnl_summary or {}).get("total_value", 0)
        opt_weights = (
            (optimization_result or {}).get("max_sharpe", {}).get("weights", {})
        )

        cost_map = {p["ticker"]: p for p in positions}

        for ticker, fc in forecast_summary.items():
            ret = fc.get("expected_return_pct", 0)
            price = fc.get("forecast_1y_price", 0)
            pos = cost_map.get(ticker, {})
            curr_value = pos.get("current_value", 0)
            current_weight = (curr_value / total_value * 100) if total_value > 0 else 0
            optimal_weight = opt_weights.get(ticker, 0)
            drift = current_weight - optimal_weight

            if ret > 15 and drift < -3:
                signals.append(
                    f"BUY {ticker}: 1y forecast +{ret:.1f}% to ${price:.2f} "
                    f"and underweight by {abs(drift):.1f}% vs Max Sharpe"
                )
            elif ret > 10:
                signals.append(
                    f"HOLD/ADD {ticker}: 1y forecast +{ret:.1f}% to ${price:.2f}"
                )
            elif ret < -5 or drift > 10:
                signals.append(
                    f"TRIM {ticker}: 1y forecast {ret:.1f}%, "
                    f"overweight by {max(drift, 0):.1f}% vs optimal"
                )
            else:
                signals.append(
                    f"HOLD {ticker}: 1y forecast {ret:+.1f}% to ${price:.2f}"
                )

    # Sentiment signals
    if sentiment:
        ticker_sent = sentiment.get("ticker_sentiment", {})
        for t, s in ticker_sent.items():
            label = s.get("overall_label", "neutral")
            score = s.get("overall_score", 0)
            if label == "positive" and score > 0.3:
                signals.append(f"POSITIVE CATALYST: {t} — strong positive news flow ({score:.2f})")
            elif label == "negative" and score < -0.3:
                signals.append(f"RISK ALERT: {t} — negative news flow ({score:.2f}), review position")

    # Risk
    if mdd < -30:
        risk_level = "high"
        risk_text = f"High risk: Max drawdown {mdd:.1f}% indicates significant tail risk."
    elif mdd < -15:
        risk_level = "medium"
        risk_text = f"Moderate risk: Max drawdown {mdd:.1f}% is within acceptable range."
    else:
        risk_level = "low"
        risk_text = f"Low risk: Max drawdown {mdd:.1f}% shows strong capital preservation."

    narrative = (
        f"This portfolio analysis reveals a {'connected' if edges else 'decoupled'} causal structure "
        f"among {len(nodes)} assets. "
        f"Backtesting shows Sharpe {sharpe:.2f}, max drawdown {mdd:.1f}%. "
        f"{risk_text} "
    )
    if pnl_summary and pnl_summary.get("total_pnl") is not None:
        narrative += (
            f"Current portfolio P&L is ${pnl_summary['total_pnl']:+,.2f} "
            f"({pnl_summary['total_pnl_pct']:+.2f}%). "
        )

    return {
        "key_findings": findings,
        "risk_assessment": risk_text,
        "risk_level": risk_level,
        "trade_signals": signals,
        "agent_narrative": narrative,
        "model_used": "Rule-based (no API key)",
        "note": "Set GROQ_API_KEY for AI-powered insights with Llama-3.3-70b.",
    }


# ── LangGraph + Groq agent ────────────────────────────────────────────────────

class AgentState(TypedDict):
    # Input data
    causal_graph: dict
    backtest_metrics: dict
    sentiment: dict
    pnl_summary: Optional[dict]
    forecast_summary: Optional[dict]
    optimization_result: Optional[dict]   # Max Sharpe / Min Vol weights
    positions: Optional[list]             # raw position dicts with purchase price
    tickers: list                         # portfolio ticker list
    # Tool-calling message history (researcher node)
    messages: Annotated[list, lambda x, y: x + y]
    # Node outputs
    analyst_output: str
    risk_output: str
    final_insights: dict


def _extract_research_text(messages: list) -> str:
    """Pull tool results and researcher summary out of message history."""
    parts = []
    for msg in messages:
        content = getattr(msg, "content", "")
        if not isinstance(content, str) or len(content) < 40:
            continue
        # ToolMessage content = raw tool output
        if type(msg).__name__ in ("ToolMessage",):
            parts.append(content)
        # Final AI summary: AI message with no tool calls
        elif type(msg).__name__ in ("AIMessage",):
            tool_calls = getattr(msg, "tool_calls", None)
            if not tool_calls and len(content) > 80:
                parts.append(content)
    return "\n\n".join(parts[-6:])  # most recent 6 content blocks


def _build_agent_graph():
    """Build the LangGraph state machine (lazy import to keep startup fast)."""
    try:
        from langchain_groq import ChatGroq
        from langchain_core.messages import HumanMessage, SystemMessage
        from langgraph.graph import END, StateGraph
        from langgraph.prebuilt import ToolNode
    except ImportError:
        return None

    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None

    tools, tools_ok = _make_tools()

    llm = ChatGroq(
        model="llama-3.3-70b-versatile",
        api_key=api_key,
        temperature=0.3,
        max_tokens=1500,
    )

    llm_with_tools = llm.bind_tools(tools) if tools_ok and tools else llm

    # ── Node: Researcher ──────────────────────────────────────────────────────
    def researcher(state: AgentState) -> dict:
        """Calls Finnhub news + FRED macro tools to build a research context."""
        tickers = state.get("tickers") or []
        ticker_list = ", ".join(tickers) if tickers else "unknown tickers"
        existing = state.get("messages") or []

        if not existing:
            # First pass — instruct LLM to call ALL tools in one round
            system_content = (
                "You are a financial researcher supporting a portfolio analysis system. "
                "Your task is to gather current information about a portfolio using your tools.\n\n"
                "Please call your tools now to:\n"
                f"1. Fetch recent news headlines for EACH of these tickers: {ticker_list}\n"
                "2. Fetch key macro indicators using series IDs: FEDFUNDS,CPIAUCSL,UNRATE,DGS10\n\n"
                "Call all the news tools and the macro tool in a single batch. "
                "After the tool results come back, summarise the key catalysts and macro headwinds/"
                "tailwinds relevant to this portfolio in the next 12 months."
            )
            messages_to_send = [
                SystemMessage(content=system_content),
                HumanMessage(content=f"Portfolio to research: {ticker_list}"),
            ]
            response = llm_with_tools.invoke(messages_to_send)
            return {"messages": messages_to_send + [response]}
        else:
            # Second pass — tool results are in history; ask for summary
            response = llm_with_tools.invoke(existing)
            return {"messages": [response]}

    def route_after_researcher(state: AgentState) -> str:
        """If the last AI message has tool calls → execute tools; else → analyst."""
        messages = state.get("messages") or []
        if not messages:
            return "analyst"
        last = messages[-1]
        tool_calls = getattr(last, "tool_calls", None)
        if tool_calls:
            # Limit to one round of tool use to avoid infinite loop
            ai_msgs_with_tools = [
                m for m in messages
                if type(m).__name__ == "AIMessage" and getattr(m, "tool_calls", None)
            ]
            if len(ai_msgs_with_tools) <= 1:
                return "tools"
        return "analyst"

    # ── Node: Portfolio Analyst ───────────────────────────────────────────────
    def portfolio_analyst(state: AgentState) -> dict:
        """Compares actual holdings and cost basis against 12-month forecasts
        and optimal allocations to generate prescriptive buy/reduce signals."""

        research_text = _extract_research_text(state.get("messages") or [])
        positions = state.get("positions") or []
        forecast_summary = state.get("forecast_summary") or {}
        optimization_result = state.get("optimization_result") or {}
        pnl = state.get("pnl_summary") or {}
        graph = state["causal_graph"]
        edges = graph.get("edges", [])
        nodes = graph.get("nodes", [])

        # Build per-position table: cost vs current vs 1y forecast
        if positions:
            rows = []
            for pos in positions:
                ticker = pos.get("ticker", "?")
                qty = pos.get("quantity", 0)
                cost = pos.get("purchase_price", 0)
                curr = pos.get("current_price", 0)
                pnl_usd = pos.get("pnl", 0)
                pnl_pct = pos.get("pnl_pct", 0)
                fc = forecast_summary.get(ticker, {})
                fc_1y = fc.get("forecast_1y_price", 0)
                fc_ret = fc.get("expected_return_pct", 0)
                rows.append(
                    f"  {ticker}: {qty:.0f} shares | cost ${cost:.2f} | "
                    f"current ${curr:.2f} | P&L ${pnl_usd:+.2f} ({pnl_pct:+.1f}%) | "
                    f"1y forecast ${fc_1y:.2f} ({fc_ret:+.1f}%)"
                )
            positions_text = "\n".join(rows)
        else:
            positions_text = "No position details provided."

        # Optimization context
        max_sharpe = optimization_result.get("max_sharpe", {})
        if max_sharpe and max_sharpe.get("weights"):
            w = max_sharpe["weights"]
            opt_text = (
                f"Max Sharpe allocation — expected return {max_sharpe.get('expected_return', 0):.1f}%, "
                f"volatility {max_sharpe.get('expected_volatility', 0):.1f}%, "
                f"Sharpe {max_sharpe.get('sharpe_ratio', 0):.2f}:\n"
                + "\n".join(
                    f"  {t}: {wt:.1f}%"
                    for t, wt in sorted(w.items(), key=lambda x: -x[1])
                )
            )
        else:
            opt_text = "Optimization data unavailable."

        # Causal context
        edge_lines = (
            "\n".join(
                f"  {e['source']} → {e['target']} "
                f"(effect {e['weight']:.4f}, {e['direction']})"
                for e in edges[:8]
            )
            or "  No significant causal edges — assets move independently."
        )

        prompt = (
            "You are a senior quantitative portfolio analyst. Provide SPECIFIC, ACTIONABLE "
            "recommendations by comparing the user's actual holdings and cost basis against "
            "12-month forecasts and mean-variance optimal allocations.\n\n"
            f"=== HOLDINGS vs 12-MONTH FORECASTS ===\n{positions_text}\n\n"
            f"Total cost basis: ${pnl.get('total_cost', 0):,.2f} | "
            f"Current value: ${pnl.get('total_value', 0):,.2f} | "
            f"Total P&L: ${pnl.get('total_pnl', 0):+,.2f} ({pnl.get('total_pnl_pct', 0):+.2f}%)\n\n"
            f"=== OPTIMAL ALLOCATION (Max Sharpe) ===\n{opt_text}\n\n"
            f"=== CAUSAL RELATIONSHIPS ===\n{edge_lines}\n\n"
            f"=== NEWS & MACRO CONTEXT ===\n{research_text[:2000] if research_text else 'Not available.'}\n\n"
            "Based on the above data, answer concisely:\n"
            "1. Which positions should be INCREASED (strong upside forecast + underweight)? Name tickers.\n"
            "2. Which positions should be REDUCED (weak/negative forecast or overweight)? Name tickers.\n"
            "3. Which position has the best risk/reward from current cost basis?\n"
            "4. What is the single most important macro or news catalyst affecting this portfolio?\n\n"
            "Be direct and specific — use ticker names and approximate numbers."
        )

        response = llm.invoke(prompt)
        return {"analyst_output": response.content}

    # ── Node: Risk Agent ──────────────────────────────────────────────────────
    def risk_agent(state: AgentState) -> dict:
        """Assesses risk and generates concrete rebalancing instructions."""
        m = state["backtest_metrics"]
        positions = state.get("positions") or []
        forecast_summary = state.get("forecast_summary") or {}
        optimization_result = state.get("optimization_result") or {}
        pnl = state.get("pnl_summary") or {}
        sent = state["sentiment"].get("ticker_sentiment", {})

        total_value = pnl.get("total_value", 0)
        max_sharpe_weights = (
            (optimization_result.get("max_sharpe") or {}).get("weights", {})
        )

        # Per-position weight drift vs optimal
        drift_rows = []
        for pos in positions:
            ticker = pos.get("ticker", "?")
            curr_val = pos.get("current_value", 0)
            curr_w = (curr_val / total_value * 100) if total_value > 0 else 0
            opt_w = max_sharpe_weights.get(ticker, 0)
            drift = curr_w - opt_w
            fc_ret = (forecast_summary.get(ticker) or {}).get("expected_return_pct", 0)
            status = (
                f"OVERWEIGHT +{drift:.1f}%" if drift > 5
                else (f"UNDERWEIGHT {drift:.1f}%" if drift < -5 else "near-target")
            )
            drift_rows.append(
                f"  {ticker}: current {curr_w:.1f}% | optimal {opt_w:.1f}% | "
                f"{status} | 1y forecast {fc_ret:+.1f}%"
            )

        position_risk_text = (
            "\n".join(drift_rows) if drift_rows
            else "No position data for weight analysis."
        )

        sent_summary = (
            ", ".join(
                f"{t}: {s.get('overall_label','neutral')} ({s.get('overall_score',0):.2f})"
                for t, s in sent.items()
            )
            or "No sentiment data"
        )

        prompt = (
            "You are a portfolio risk manager. Give SPECIFIC, ACTIONABLE rebalancing instructions.\n\n"
            f"=== BACKTEST METRICS ===\n"
            f"Annual Return: {m.get('annual_return', 0):.2f}% | "
            f"Sharpe: {m.get('sharpe_ratio', 0):.2f} | "
            f"Max Drawdown: {m.get('max_drawdown', 0):.2f}%\n"
            f"Sortino: {m.get('sortino_ratio', 0):.2f} | "
            f"Calmar: {m.get('calmar_ratio', 0):.2f} | "
            f"Alpha: {m.get('alpha', 0):.2f}% | Beta: {m.get('beta', 0):.2f}\n"
            f"Win Rate: {m.get('win_rate', 0):.2f}%\n\n"
            f"=== POSITION DRIFT vs OPTIMAL WEIGHTS ===\n{position_risk_text}\n\n"
            f"=== SENTIMENT ===\n{sent_summary}\n\n"
            "Provide:\n"
            "1. Overall risk level (low / medium / high) with justification from the metrics.\n"
            "2. For each OVERWEIGHT position: trim or hold? If trim, by approximately how much?\n"
            "3. For each UNDERWEIGHT position with positive forecast: add exposure or hold?\n"
            "4. The single biggest macro risk factor affecting this portfolio right now.\n"
            "5. One specific hedge suggestion if risk level is medium or high.\n\n"
            "Use specific ticker names and approximate percentages."
        )

        response = llm.invoke(prompt)
        return {"risk_output": response.content}

    # ── Node: Synthesizer ─────────────────────────────────────────────────────
    def synthesizer(state: AgentState) -> dict:
        """Combines all agent outputs into structured prescriptive insights."""
        m = state["backtest_metrics"]
        mdd = m.get("max_drawdown", 0)
        sharpe = m.get("sharpe_ratio", 0)
        risk_level = "high" if mdd < -30 else ("medium" if mdd < -15 else "low")

        analyst_text = state.get("analyst_output", "")
        risk_text = state.get("risk_output", "")

        positions = state.get("positions") or []
        forecast_summary = state.get("forecast_summary") or {}
        optimization_result = state.get("optimization_result") or {}
        pnl = state.get("pnl_summary") or {}
        sent = state["sentiment"].get("ticker_sentiment", {})

        total_value = pnl.get("total_value", 0)
        max_sharpe_weights = (
            (optimization_result.get("max_sharpe") or {}).get("weights", {})
        )

        # Generate data-driven trade signals from positions × forecasts × optimal weights
        signals = []
        for pos in positions:
            ticker = pos.get("ticker", "?")
            curr_val = pos.get("current_value", 0)
            curr_w = (curr_val / total_value * 100) if total_value > 0 else 0
            opt_w = max_sharpe_weights.get(ticker, 0)
            drift = curr_w - opt_w
            fc = forecast_summary.get(ticker) or {}
            fc_ret = fc.get("expected_return_pct", 0)
            fc_price = fc.get("forecast_1y_price", 0)
            cost = pos.get("purchase_price", 0)
            curr_price = pos.get("current_price", 0)

            if fc_ret > 15 and drift < -3:
                signals.append(
                    f"BUY {ticker}: 1y forecast +{fc_ret:.1f}% to ${fc_price:.2f} "
                    f"(from ${curr_price:.2f}) — underweight {abs(drift):.1f}% vs Max Sharpe"
                )
            elif fc_ret > 10:
                signals.append(
                    f"HOLD/ADD {ticker}: 1y forecast +{fc_ret:.1f}% to ${fc_price:.2f} "
                    f"(cost basis ${cost:.2f})"
                )
            elif fc_ret < -5 and drift > 5:
                signals.append(
                    f"TRIM {ticker}: 1y forecast {fc_ret:.1f}% + "
                    f"overweight {drift:.1f}% vs optimal — reduce exposure"
                )
            elif fc_ret < -5:
                signals.append(
                    f"MONITOR {ticker}: 1y forecast {fc_ret:.1f}% — "
                    f"consider reducing if thesis doesn't hold"
                )
            elif drift > 10:
                signals.append(
                    f"REBALANCE {ticker}: overweight {drift:.1f}% vs optimal "
                    f"— trim to target even with {fc_ret:+.1f}% forecast"
                )
            else:
                signals.append(
                    f"HOLD {ticker}: 1y forecast {fc_ret:+.1f}% to ${fc_price:.2f} "
                    f"(cost ${cost:.2f}) — near-optimal weight"
                )

        # Sentiment-driven signals
        for ticker, s in sent.items():
            label = s.get("overall_label", "neutral")
            score = s.get("overall_score", 0)
            if label == "positive" and score > 0.3:
                signals.append(
                    f"POSITIVE CATALYST {ticker}: strong positive news flow (score {score:.2f})"
                )
            elif label == "negative" and score < -0.3:
                signals.append(
                    f"RISK ALERT {ticker}: negative news flow (score {score:.2f}) "
                    f"— review position sizing"
                )

        # Key findings from agent narratives
        analyst_sentences = [s.strip() for s in analyst_text.split(".") if len(s.strip()) > 30][:3]
        risk_sentences = [s.strip() for s in risk_text.split(".") if len(s.strip()) > 30][:2]
        findings = [f"{s}." for s in analyst_sentences + risk_sentences if s]

        narrative = (
            f"{analyst_text}\n\n"
            f"─── Risk Assessment & Rebalancing ───\n{risk_text}"
        )

        return {
            "final_insights": {
                "key_findings": findings,
                "risk_assessment": risk_text[:500] if risk_text else "No risk data",
                "risk_level": risk_level,
                "trade_signals": signals,
                "agent_narrative": narrative,
                "model_used": "llama-3.3-70b-versatile (Groq) + Finnhub News + FRED Macro",
                "note": "",
            }
        }

    # ── Build graph ───────────────────────────────────────────────────────────
    tool_node = ToolNode(tools) if tools_ok and tools else None

    graph = StateGraph(AgentState)
    graph.add_node("researcher", researcher)
    graph.add_node("analyst", portfolio_analyst)
    graph.add_node("risk", risk_agent)
    graph.add_node("synthesizer", synthesizer)

    if tool_node is not None:
        graph.add_node("tools", tool_node)
        graph.set_entry_point("researcher")
        graph.add_conditional_edges(
            "researcher",
            route_after_researcher,
            {"tools": "tools", "analyst": "analyst"},
        )
        graph.add_edge("tools", "researcher")
    else:
        # No tools available — skip researcher entirely
        graph.set_entry_point("analyst")

    graph.add_edge("analyst", "risk")
    graph.add_edge("risk", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_insights(
    causal_graph: dict,
    backtest_metrics: dict,
    sentiment: dict,
    pnl_summary: Optional[dict] = None,
    forecast_summary: Optional[dict] = None,
    optimization_result: Optional[dict] = None,
    positions: Optional[list] = None,
    groq_api_key: Optional[str] = None,
    finnhub_api_key: Optional[str] = None,
    fred_api_key: Optional[str] = None,
) -> dict:
    """
    Generate AI-powered portfolio insights.

    Uses Groq LangGraph agents (researcher → analyst → risk → synthesizer)
    if GROQ_API_KEY is available, otherwise falls back to rule-based insights.

    Args:
        causal_graph:        Output from causal discovery pipeline.
        backtest_metrics:    Backtest performance metrics dict.
        sentiment:           Sentiment analysis output dict.
        pnl_summary:         Portfolio P&L summary keyed by positions.
        forecast_summary:    Prophet 12-month forecast summary per ticker.
        optimization_result: Mean-variance optimization result (max_sharpe, etc.).
        positions:           Raw list of position dicts with purchase_price, quantity, etc.
        groq_api_key:        Groq API key (falls back to GROQ_API_KEY env var).
        finnhub_api_key:     Finnhub API key (falls back to FINNHUB_API_KEY env var).
        fred_api_key:        FRED API key (falls back to FRED_API_KEY env var).
    """
    # Inject API keys into environment so tools can pick them up
    if groq_api_key:
        os.environ["GROQ_API_KEY"] = groq_api_key
    if finnhub_api_key:
        os.environ["FINNHUB_API_KEY"] = finnhub_api_key
    if fred_api_key:
        os.environ["FRED_API_KEY"] = fred_api_key

    api_key = os.getenv("GROQ_API_KEY", "")

    if not api_key:
        logger.info("No GROQ_API_KEY — using rule-based insights fallback")
        return _rule_based_insights(
            causal_graph, backtest_metrics, sentiment,
            pnl_summary, forecast_summary, optimization_result,
        )

    try:
        import asyncio

        agent_graph = _build_agent_graph()
        if agent_graph is None:
            return _rule_based_insights(
                causal_graph, backtest_metrics, sentiment,
                pnl_summary, forecast_summary, optimization_result,
            )

        # Build tickers list from available sources
        tickers: list = []
        if positions:
            tickers = [p.get("ticker", "") for p in positions if p.get("ticker")]
        if not tickers and forecast_summary:
            tickers = list(forecast_summary.keys())
        if not tickers and causal_graph.get("nodes"):
            tickers = [n["id"] for n in causal_graph["nodes"]]

        initial_state: AgentState = {
            "causal_graph": causal_graph,
            "backtest_metrics": backtest_metrics,
            "sentiment": sentiment,
            "pnl_summary": pnl_summary,
            "forecast_summary": forecast_summary,
            "optimization_result": optimization_result,
            "positions": positions or [],
            "tickers": tickers,
            "messages": [],
            "analyst_output": "",
            "risk_output": "",
            "final_insights": {},
        }

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, agent_graph.invoke, initial_state)
        insights = result.get("final_insights", {})

        if not insights:
            return _rule_based_insights(
                causal_graph, backtest_metrics, sentiment,
                pnl_summary, forecast_summary, optimization_result,
            )

        return insights

    except Exception as e:
        logger.error(f"Agent pipeline failed: {e}. Falling back to rule-based insights.")
        return _rule_based_insights(
            causal_graph, backtest_metrics, sentiment,
            pnl_summary, forecast_summary, optimization_result,
        )
