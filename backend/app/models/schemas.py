"""
Pydantic schemas for all API request/response models.
"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Portfolio Positions ────────────────────────────────────────────────────────

class PositionInput(BaseModel):
    ticker: str
    quantity: float = Field(gt=0, description="Number of shares held")
    purchase_price: float = Field(gt=0, description="Average purchase price per share")


class TickerPnL(BaseModel):
    ticker: str
    quantity: float
    purchase_price: float
    current_price: float
    total_cost: float
    current_value: float
    pnl: float
    pnl_pct: float


class PortfolioPositionSummary(BaseModel):
    positions: list[TickerPnL]
    total_cost: float
    total_value: float
    total_pnl: float
    total_pnl_pct: float


# ── Portfolio Analysis ────────────────────────────────────────────────────────

class PortfolioRequest(BaseModel):
    tickers: list[str] = Field(
        ...,
        min_length=1,
        max_length=20,
        description="List of stock ticker symbols (e.g. ['AAPL', 'MSFT'])",
        examples=[["AAPL", "MSFT", "GOOGL", "NVDA"]],
    )
    period: str = Field(
        default="2y",
        description="Historical data period: 1y, 2y, 5y",
        examples=["2y"],
    )
    benchmark: str = Field(
        default="SPY",
        description="Benchmark ticker for comparison",
        examples=["SPY"],
    )
    finnhub_api_key: Optional[str] = Field(
        default=None,
        description="Optional Finnhub API key for live prices and news (free at finnhub.io)",
    )
    groq_api_key: Optional[str] = Field(
        default=None,
        description="Optional Groq API key for AI insights (free at console.groq.com)",
    )
    positions: Optional[list[PositionInput]] = Field(
        default=None,
        description="Optional position details for P&L analysis",
    )

    @field_validator("tickers")
    @classmethod
    def uppercase_tickers(cls, v: list[str]) -> list[str]:
        return [t.strip().upper() for t in v if t.strip()]

    @field_validator("period")
    @classmethod
    def validate_period(cls, v: str) -> str:
        allowed = {"1y", "2y", "5y"}
        if v not in allowed:
            raise ValueError(f"period must be one of {allowed}")
        return v


class PortfolioSummary(BaseModel):
    ticker_count: int
    date_range: str
    trading_days: int
    top_performer: str
    top_performer_return: float
    portfolio_total_return: float
    benchmark_total_return: float


class PortfolioResponse(BaseModel):
    portfolio_id: str
    tickers: list[str]
    period: str
    benchmark: str
    status: str
    summary: PortfolioSummary
    pnl_summary: Optional[PortfolioPositionSummary] = None


# ── Ticker Search ──────────────────────────────────────────────────────────────

class TickerSearchResult(BaseModel):
    symbol: str
    description: str
    type: str


# ── Causal Graph ──────────────────────────────────────────────────────────────

class CausalNode(BaseModel):
    id: str
    label: str
    centrality: float = Field(description="Betweenness centrality (0–1)")
    avg_return: float = Field(description="Annualised average return")
    volatility: float = Field(description="Annualised volatility")


class CausalEdge(BaseModel):
    source: str
    target: str
    weight: float = Field(description="Estimated treatment effect size")
    p_value: float = Field(description="Statistical significance")
    direction: str = Field(description="positive or negative effect")


class CausalGraph(BaseModel):
    portfolio_id: str
    nodes: list[CausalNode]
    edges: list[CausalEdge]
    algorithm: str = "PC (Peter-Clark)"
    significance_threshold: float = 0.1
    message: str = ""
    correlation_matrix: Optional[dict] = None


# ── Backtesting ───────────────────────────────────────────────────────────────

class BacktestMetrics(BaseModel):
    annual_return: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    win_rate: float = 0.0
    total_return: float = 0.0
    benchmark_total_return: float = 0.0
    alpha: float = 0.0
    beta: float = 1.0


class BacktestDataPoint(BaseModel):
    date: str
    portfolio: float
    benchmark: float


class BacktestResult(BaseModel):
    portfolio_id: str
    timeseries: list[BacktestDataPoint]
    metrics: BacktestMetrics
    rebalance_frequency: str = "monthly"
    transaction_cost_pct: float = 0.1


# ── Sentiment ─────────────────────────────────────────────────────────────────

class SentimentArticle(BaseModel):
    headline: str
    url: str
    source: str
    published_at: str
    sentiment_score: float = Field(description="VADER compound score: -1 to +1")
    sentiment_label: str = Field(description="positive, negative, or neutral")


class TickerSentiment(BaseModel):
    ticker: str
    overall_score: float
    overall_label: str
    headline_count: int
    articles: list[SentimentArticle]


class SentimentResult(BaseModel):
    portfolio_id: str
    ticker_sentiment: dict[str, TickerSentiment]
    note: str = ""


# ── AI Agent Insights ─────────────────────────────────────────────────────────

class AgentInsights(BaseModel):
    portfolio_id: str
    key_findings: list[str]
    risk_assessment: str
    risk_level: str = Field(description="low, medium, high")
    trade_signals: list[str]
    agent_narrative: str
    model_used: str = "llama-3.3-70b-versatile (Groq)"
    note: str = ""


# ── Live Prices ───────────────────────────────────────────────────────────────

class LivePrice(BaseModel):
    ticker: str
    price: float
    change: float
    change_pct: float
    high: float
    low: float
    open: float
    prev_close: float
    timestamp: str


# ── Forecasting ───────────────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    date: str
    yhat: float
    yhat_lower: float
    yhat_upper: float


class TickerForecast(BaseModel):
    ticker: str
    historical: list[ForecastPoint]   # last 90 days of actuals
    forecast_30d: ForecastPoint
    forecast_60d: ForecastPoint
    forecast_90d: ForecastPoint
    forecast_6m: ForecastPoint
    forecast_1y: ForecastPoint
    future_series: list[ForecastPoint]  # daily forecasts out to 365 days


class ForecastResult(BaseModel):
    portfolio_id: str
    ticker_forecasts: dict[str, TickerForecast]
