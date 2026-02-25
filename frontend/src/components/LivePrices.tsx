"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LivePrice, ForecastResult } from "@/lib/types";
import { createLivePricesSocket, getForecast } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus, Wifi, WifiOff } from "lucide-react";
import ForecastChart from "./ForecastChart";

interface Props {
  tickers: string[];
  finnhubKey?: string;
  portfolioId?: string;
}

export default function LivePrices({ tickers, finnhubKey, portfolioId }: Props) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch Prophet forecasts if we have a portfolioId
  const { data: forecastData } = useQuery<ForecastResult>({
    queryKey: ["forecast", portfolioId],
    queryFn: () => getForecast(portfolioId!),
    enabled: !!portfolioId,
    staleTime: 30 * 60 * 1000, // 30 min — forecasts don't change often
  });

  useEffect(() => {
    if (!tickers.length) return;

    const ws = createLivePricesSocket(
      tickers,
      finnhubKey,
      (newPrices) => {
        setConnected(true);
        setPrevPrices((prev) => {
          const updated: Record<string, number> = { ...prev };
          newPrices.forEach((p) => {
            if (prices[p.ticker]) updated[p.ticker] = prices[p.ticker].price;
          });
          return updated;
        });
        setPrices((prev) => {
          const updated = { ...prev };
          newPrices.forEach((p) => {
            updated[p.ticker] = p;
          });
          return updated;
        });
      },
      () => setConnected(false)
    );

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [tickers.join(","), finnhubKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPriceAnimation = (ticker: string, currentPrice: number) => {
    const prev = prevPrices[ticker];
    if (!prev || prev === currentPrice) return "";
    return currentPrice > prev ? "price-up" : "price-down";
  };

  return (
    <div className="space-y-8">
      {/* Live Price Cards */}
      <div>
        <div className="mb-3 flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <Wifi className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Live — updating every 5s</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-slate-500" />
              <span className="text-slate-500">Connecting…</span>
            </>
          )}
          {!finnhubKey && (
            <span className="text-slate-600">
              · Add Finnhub key for real-time data (yfinance 15-min delay active)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tickers.map((ticker) => {
            const p = prices[ticker];
            if (!p) {
              return (
                <div
                  key={ticker}
                  className="rounded-xl border border-surface-border bg-surface-card p-5 animate-pulse"
                >
                  <div className="h-4 w-16 skeleton mb-3" />
                  <div className="h-8 w-28 skeleton mb-2" />
                  <div className="h-3 w-24 skeleton" />
                </div>
              );
            }

            const isUp = p.change_pct >= 0;
            const animClass = getPriceAnimation(ticker, p.price);

            return (
              <div
                key={ticker}
                className={`rounded-xl border border-surface-border bg-surface-card p-5 transition-colors ${animClass}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono font-bold text-white">{ticker}</span>
                  {isUp ? (
                    <TrendingUp className="h-4 w-4 text-green-400" />
                  ) : p.change_pct === 0 ? (
                    <Minus className="h-4 w-4 text-slate-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-400" />
                  )}
                </div>

                <p className="text-3xl font-bold font-mono text-white">
                  ${p.price.toFixed(2)}
                </p>

                <p
                  className={`mt-1 text-sm font-medium ${
                    isUp
                      ? "text-green-400"
                      : p.change_pct === 0
                      ? "text-slate-500"
                      : "text-red-400"
                  }`}
                >
                  {isUp ? "+" : ""}
                  {p.change.toFixed(2)} ({isUp ? "+" : ""}
                  {p.change_pct.toFixed(2)}%)
                </p>

                <div className="mt-3 grid grid-cols-3 gap-1 text-xs text-slate-500">
                  <div>
                    <p className="text-slate-600">Open</p>
                    <p className="text-slate-400">{p.open.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">High</p>
                    <p className="text-green-400/70">{p.high.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Low</p>
                    <p className="text-red-400/70">{p.low.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Prophet Forecast Section */}
      {forecastData && Object.keys(forecastData.ticker_forecasts).length > 0 && (
        <div>
          <div className="mb-4 border-t border-surface-border pt-6">
            <h3 className="text-base font-semibold text-white">Prophet Price Forecasts</h3>
            <p className="text-xs text-slate-400">
              FB Prophet model per ticker — historical actuals + 365-day forecast with confidence intervals
            </p>
          </div>
          <div className="space-y-4">
            {tickers.map((ticker) => {
              const tickerForecast = forecastData.ticker_forecasts[ticker];
              if (!tickerForecast || tickerForecast.historical.length === 0) return null;
              return (
                <ForecastChart key={ticker} forecast={tickerForecast} />
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state for forecasts */}
      {portfolioId && !forecastData && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center text-sm text-slate-500">
          Loading Prophet forecasts…
        </div>
      )}
    </div>
  );
}
