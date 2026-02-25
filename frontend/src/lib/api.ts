import type {
  AgentInsights,
  BacktestResult,
  CausalGraph,
  ForecastResult,
  LivePrice,
  PortfolioRequest,
  PortfolioResponse,
  SentimentResult,
  TickerSearchResult,
} from "./types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Ticker Search ─────────────────────────────────────────────────────────────

export async function searchTickers(
  q: string,
  finnhubKey?: string
): Promise<TickerSearchResult[]> {
  if (!q || q.trim().length < 2) return [];
  const qs = new URLSearchParams({ q: q.trim() });
  if (finnhubKey) qs.set("finnhub_api_key", finnhubKey);
  return apiFetch<TickerSearchResult[]>(`/api/v1/portfolio/search?${qs}`);
}

// ── Portfolio Analysis ────────────────────────────────────────────────────────

export async function analyzePortfolio(
  req: PortfolioRequest
): Promise<PortfolioResponse> {
  return apiFetch<PortfolioResponse>("/api/v1/portfolio/analyze", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getCausalGraph(id: string): Promise<CausalGraph> {
  return apiFetch<CausalGraph>(`/api/v1/portfolio/${id}/causal-graph`);
}

export async function getBacktest(id: string): Promise<BacktestResult> {
  return apiFetch<BacktestResult>(`/api/v1/portfolio/${id}/backtest`);
}

export async function getSentiment(
  id: string,
  finnhubKey?: string
): Promise<SentimentResult> {
  const qs = finnhubKey ? `?finnhub_api_key=${finnhubKey}` : "";
  return apiFetch<SentimentResult>(`/api/v1/portfolio/${id}/sentiment${qs}`);
}

export async function getInsights(id: string): Promise<AgentInsights> {
  return apiFetch<AgentInsights>(`/api/v1/portfolio/${id}/insights`);
}

export async function getForecast(id: string): Promise<ForecastResult> {
  return apiFetch<ForecastResult>(`/api/v1/portfolio/${id}/forecast`);
}

// ── WebSocket live prices ─────────────────────────────────────────────────────

export function createLivePricesSocket(
  tickers: string[],
  finnhubKey: string | undefined,
  onMessage: (prices: LivePrice[]) => void,
  onError?: (err: Event) => void
): WebSocket {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  const qs = new URLSearchParams({
    tickers: tickers.join(","),
    ...(finnhubKey ? { finnhub_api_key: finnhubKey } : {}),
  });
  const ws = new WebSocket(`${wsBase}/api/v1/live/prices?${qs}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.prices) onMessage(data.prices);
    } catch {
      // ignore malformed
    }
  };

  if (onError) ws.onerror = onError;
  return ws;
}
