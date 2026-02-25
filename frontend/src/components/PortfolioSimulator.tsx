"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ForecastResult } from "@/lib/types";

type Horizon = "30d" | "60d" | "90d" | "6m" | "1y";

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "30d", label: "30 Days" },
  { id: "60d", label: "60 Days" },
  { id: "90d", label: "90 Days" },
  { id: "6m", label: "6 Months" },
  { id: "1y", label: "1 Year" },
];

interface Props {
  tickers: string[];
  forecastResult: ForecastResult;
}

function getHorizonReturn(
  forecast: ForecastResult["ticker_forecasts"][string],
  horizon: Horizon
): number {
  const horizonKey = `forecast_${horizon}` as keyof typeof forecast;
  const point = forecast[horizonKey] as { yhat: number } | undefined;
  const current = forecast.historical.length > 0
    ? forecast.historical[forecast.historical.length - 1].yhat
    : null;
  if (!current || !point || current === 0) return 0;
  return ((point.yhat - current) / current) * 100;
}

export default function PortfolioSimulator({ tickers, forecastResult }: Props) {
  const [horizon, setHorizon] = useState<Horizon>("1y");

  // Only use tickers that have forecast data
  const validTickers = tickers.filter(
    (t) => forecastResult.ticker_forecasts[t]?.historical?.length > 0
  );

  // Initialize equal weights
  const initialWeight = validTickers.length > 0 ? Math.floor(100 / validTickers.length) : 0;
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(validTickers.map((t) => [t, initialWeight]))
  );

  // Normalize weights to sum to 100 whenever one changes
  const handleWeightChange = (ticker: string, newVal: number) => {
    setWeights((prev) => {
      const updated = { ...prev, [ticker]: newVal };
      // Distribute remainder to others proportionally
      const total = Object.values(updated).reduce((a, b) => a + b, 0);
      if (total === 0) return updated;
      // Normalize to 100
      const factor = 100 / total;
      return Object.fromEntries(
        Object.entries(updated).map(([k, v]) => [k, Math.round(v * factor)])
      );
    });
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  // Compute projected portfolio return
  const projectedReturn = useMemo(() => {
    let ret = 0;
    for (const ticker of validTickers) {
      const tickerForecast = forecastResult.ticker_forecasts[ticker];
      if (!tickerForecast) continue;
      const tickerReturn = getHorizonReturn(tickerForecast, horizon);
      const w = (weights[ticker] ?? 0) / 100;
      ret += w * tickerReturn;
    }
    return ret;
  }, [weights, horizon, validTickers, forecastResult]);

  // Per-ticker bar chart data
  const barData = validTickers.map((ticker) => {
    const tickerForecast = forecastResult.ticker_forecasts[ticker];
    const ret = tickerForecast ? getHorizonReturn(tickerForecast, horizon) : 0;
    return { ticker, return: ret, weight: weights[ticker] ?? 0 };
  });

  if (validTickers.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center text-sm text-slate-500">
        No forecast data available for simulation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Horizon Toggle */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-white">Portfolio Allocation Simulator</h3>
            <p className="text-xs text-slate-400">
              Adjust weights to see projected returns based on Prophet forecasts
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-dark p-1">
            {HORIZONS.map((h) => (
              <button
                key={h.id}
                onClick={() => setHorizon(h.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  horizon === h.id
                    ? "bg-brand-500 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* Projected Portfolio Return */}
        <div className="mb-6 rounded-xl border border-surface-border bg-surface-dark p-4 text-center">
          <p className="text-xs text-slate-400 uppercase tracking-wider">
            Projected Portfolio Return ({horizon})
          </p>
          <p
            className={`mt-1 text-4xl font-bold ${
              projectedReturn >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {projectedReturn >= 0 ? "+" : ""}
            {projectedReturn.toFixed(2)}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Based on equal-weight allocation at the current slider settings
          </p>
        </div>

        {/* Allocation Sliders */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Allocation Weights</p>
            <span className={`text-xs font-medium ${totalWeight === 100 ? "text-green-400" : "text-yellow-400"}`}>
              Total: {totalWeight}%
            </span>
          </div>

          {validTickers.map((ticker) => {
            const tickerForecast = forecastResult.ticker_forecasts[ticker];
            const tickerReturn = tickerForecast ? getHorizonReturn(tickerForecast, horizon) : 0;
            const w = weights[ticker] ?? 0;

            return (
              <div key={ticker} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white">{ticker}</span>
                    <span
                      className={`text-xs ${
                        tickerReturn >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      ({tickerReturn >= 0 ? "+" : ""}{tickerReturn.toFixed(1)}% in {horizon})
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-white">{w}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={w}
                  onChange={(e) => handleWeightChange(ticker, Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-brand-500"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Ticker Returns Bar Chart */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <h4 className="mb-4 text-sm font-semibold text-slate-300">
          Individual Ticker Projected Returns ({horizon})
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="ticker"
              tick={{ fill: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#f1f5f9",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => [
                `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                name === "return" ? "Projected Return" : "Weight",
              ]}
            />
            <Bar dataKey="return" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.return >= 0 ? "#22c55e" : "#ef4444"}
                  opacity={0.3 + (weights[entry.ticker] ?? 0) / 100 * 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-xs text-slate-500">
          Bar opacity reflects allocation weight — higher weight = more opaque
        </p>
      </div>
    </div>
  );
}
