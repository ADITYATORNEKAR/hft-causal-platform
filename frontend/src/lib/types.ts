// ── Portfolio Positions ────────────────────────────────────────────────────────

export interface PositionInput {
  ticker: string;
  quantity: number;
  purchase_price: number;
}

export interface TickerPnL {
  ticker: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  total_cost: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
}

export interface PortfolioPositionSummary {
  positions: TickerPnL[];
  total_cost: number;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export interface PortfolioRequest {
  tickers: string[];
  period: "1y" | "2y" | "5y";
  benchmark: string;
  finnhub_api_key?: string;
  groq_api_key?: string;
  positions?: PositionInput[];
}

export interface PortfolioSummary {
  ticker_count: number;
  date_range: string;
  trading_days: number;
  top_performer: string;
  top_performer_return: number;
  portfolio_total_return: number;
  benchmark_total_return: number;
}

export interface PortfolioResponse {
  portfolio_id: string;
  tickers: string[];
  period: string;
  benchmark: string;
  status: string;
  summary: PortfolioSummary;
  pnl_summary?: PortfolioPositionSummary;
}

// ── Ticker Search ──────────────────────────────────────────────────────────────

export interface TickerSearchResult {
  symbol: string;
  description: string;
  type: string;
}

// ── Causal Graph ──────────────────────────────────────────────────────────────

export interface CausalNode {
  id: string;
  label: string;
  centrality: number;
  avg_return: number;
  volatility: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  weight: number;
  p_value: number;
  direction: "positive" | "negative";
}

export interface CausalGraph {
  portfolio_id: string;
  nodes: CausalNode[];
  edges: CausalEdge[];
  algorithm: string;
  significance_threshold: number;
  message: string;
  correlation_matrix?: Record<string, Record<string, number>>;
}

// ── Backtest ──────────────────────────────────────────────────────────────────

export interface BacktestMetrics {
  annual_return: number;
  sharpe_ratio: number;
  max_drawdown: number;
  sortino_ratio: number;
  calmar_ratio: number;
  win_rate: number;
  total_return: number;
  benchmark_total_return: number;
  alpha: number;
  beta: number;
}

export interface BacktestDataPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}

export interface BacktestResult {
  portfolio_id: string;
  timeseries: BacktestDataPoint[];
  metrics: BacktestMetrics;
  rebalance_frequency: string;
  transaction_cost_pct: number;
}

// ── Sentiment ─────────────────────────────────────────────────────────────────

export interface SentimentArticle {
  headline: string;
  url: string;
  source: string;
  published_at: string;
  sentiment_score: number;
  sentiment_label: "positive" | "negative" | "neutral";
}

export interface TickerSentiment {
  ticker: string;
  overall_score: number;
  overall_label: "positive" | "negative" | "neutral";
  headline_count: number;
  articles: SentimentArticle[];
}

export interface SentimentResult {
  portfolio_id: string;
  ticker_sentiment: Record<string, TickerSentiment>;
}

// ── AI Insights ───────────────────────────────────────────────────────────────

export interface AgentInsights {
  portfolio_id: string;
  key_findings: string[];
  risk_assessment: string;
  risk_level: "low" | "medium" | "high";
  trade_signals: string[];
  agent_narrative: string;
  model_used: string;
  note: string;
}

// ── Live Prices ───────────────────────────────────────────────────────────────

export interface LivePrice {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  high: number;
  low: number;
  open: number;
  prev_close: number;
  timestamp: string;
}

// ── Forecasting ───────────────────────────────────────────────────────────────

export interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface TickerForecast {
  ticker: string;
  historical: ForecastPoint[];
  forecast_30d: ForecastPoint;
  forecast_60d: ForecastPoint;
  forecast_90d: ForecastPoint;
  forecast_6m: ForecastPoint;
  forecast_1y: ForecastPoint;
  future_series: ForecastPoint[];
}

export interface ForecastResult {
  portfolio_id: string;
  ticker_forecasts: Record<string, TickerForecast>;
}
