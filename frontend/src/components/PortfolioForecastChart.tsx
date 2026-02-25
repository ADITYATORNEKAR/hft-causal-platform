"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PortfolioForecast } from "@/lib/types";

type Horizon = "30d" | "60d" | "90d" | "6m" | "1y";

const HORIZONS: { id: Horizon; label: string; days: number }[] = [
  { id: "30d", label: "30d", days: 30 },
  { id: "60d", label: "60d", days: 60 },
  { id: "90d", label: "90d", days: 90 },
  { id: "6m", label: "6m", days: 182 },
  { id: "1y", label: "12m", days: 365 },
];

const HORIZON_KEY: Record<Horizon, keyof PortfolioForecast> = {
  "30d": "forecast_30d",
  "60d": "forecast_60d",
  "90d": "forecast_90d",
  "6m": "forecast_6m",
  "1y": "forecast_1y",
};

function fmtDollar(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

interface Props {
  forecast: PortfolioForecast;
  /** Total cost basis (Σ qty × purchase_price) from position P&L summary. */
  costBasis?: number;
}

export default function PortfolioForecastChart({ forecast, costBasis }: Props) {
  const [horizon, setHorizon] = useState<Horizon>("1y");

  const horizonMeta = HORIZONS.find((h) => h.id === horizon)!;
  const horizonPoint = forecast[HORIZON_KEY[horizon]] as {
    date: string;
    yhat: number;
    yhat_lower: number;
    yhat_upper: number;
  };

  const futureSlice = forecast.future_series.slice(0, horizonMeta.days);

  const chartData = futureSlice.map((pt) => ({
    date: pt.date,
    value: pt.yhat,
    lower: pt.yhat_lower,
    upper: pt.yhat_upper,
  }));

  const allValues = chartData.flatMap((d) => [d.value, d.lower, d.upper]);
  if (costBasis && costBasis > 0) allValues.push(costBasis);
  const minVal = allValues.length ? Math.min(...allValues) * 0.97 : 0;
  const maxVal = allValues.length ? Math.max(...allValues) * 1.03 : 100;

  const returnAtHorizon =
    forecast.current_portfolio_value > 0
      ? ((horizonPoint.yhat - forecast.current_portfolio_value) /
          forecast.current_portfolio_value) *
        100
      : 0;

  const returnVsCostBasis =
    costBasis && costBasis > 0 && forecast.forecast_1y
      ? ((forecast.forecast_1y.yhat - costBasis) / costBasis) * 100
      : null;

  const tickFormatter = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  // Top holdings sorted by weight
  const topHoldings = Object.entries(forecast.weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-surface-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-white text-base">Combined Portfolio Forecast</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Prophet 12-month projection · weighted by current market value
          </p>
        </div>
        {/* Horizon toggle */}
        <div className="flex gap-1 rounded-lg bg-surface-dark p-1">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              onClick={() => setHorizon(h.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                horizon === h.id
                  ? "bg-indigo-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key metric cards */}
      <div className={`mb-4 grid gap-3 ${costBasis ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}>
        <div className="rounded-lg bg-surface-dark p-3">
          <p className="text-xs text-slate-500">Current Value</p>
          <p className="mt-0.5 text-sm font-bold text-white">
            {fmtDollar(forecast.current_portfolio_value)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-dark p-3">
          <p className="text-xs text-slate-500">
            Forecast ({horizon === "1y" ? "12m" : horizon})
          </p>
          <p
            className={`mt-0.5 text-sm font-bold ${
              returnAtHorizon >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtDollar(horizonPoint.yhat)}
          </p>
        </div>
        <div className="rounded-lg bg-surface-dark p-3">
          <p className="text-xs text-slate-500">vs Today</p>
          <p
            className={`mt-0.5 text-sm font-bold ${
              returnAtHorizon >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {fmtPct(returnAtHorizon)}
          </p>
        </div>

        {/* 12-month vs cost basis — shown when positions were entered */}
        {returnVsCostBasis !== null ? (
          <div className="rounded-lg bg-surface-dark p-3 border border-amber-500/25">
            <p className="text-xs text-amber-400">12m vs Cost Basis</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                returnVsCostBasis >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {fmtPct(returnVsCostBasis)}
            </p>
            <p className="text-xs text-slate-600">{fmtDollar(costBasis!)}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-surface-dark p-3">
            <p className="text-xs text-slate-500">12-Month Return</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                forecast.expected_return_pct >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {fmtPct(forecast.expected_return_pct)}
            </p>
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 15 }}>
            <defs>
              <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.08} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={false}
              tickFormatter={tickFormatter}
              interval={Math.floor(chartData.length / 5)}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              domain={[minVal, maxVal]}
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? `$${(v / 1_000_000).toFixed(1)}M`
                  : `$${(v / 1_000).toFixed(0)}K`
              }
              width={65}
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
                fmtDollar(value),
                name === "value"
                  ? "Portfolio value"
                  : name === "upper"
                  ? "Upper bound"
                  : "Lower bound",
              ]}
            />
            {/* Today / current value baseline */}
            <ReferenceLine
              y={forecast.current_portfolio_value}
              stroke="rgba(255,255,255,0.15)"
              strokeDasharray="4 4"
              label={{
                value: "Today",
                fill: "#64748b",
                fontSize: 10,
                position: "insideBottomLeft",
              }}
            />
            {/* Cost basis reference — amber dashed line */}
            {costBasis && costBasis > 0 && (
              <ReferenceLine
                y={costBasis}
                stroke="#f59e0b"
                strokeOpacity={0.55}
                strokeDasharray="3 3"
                label={{
                  value: `Cost ${fmtDollar(costBasis)}`,
                  fill: "#f59e0b",
                  fontSize: 9,
                  position: "insideTopLeft",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#gradBand)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#gradPortfolio)"
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          No forecast data available
        </div>
      )}

      {/* Footer: confidence range + holdings breakdown */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <p className="text-xs text-slate-500">
          80% confidence:{" "}
          {fmtDollar(horizonPoint.yhat_lower)} – {fmtDollar(horizonPoint.yhat_upper)}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {topHoldings.map(([ticker, weight]) => (
            <span key={ticker} className="text-xs text-slate-400">
              <span className="font-mono font-bold text-white">{ticker}</span>{" "}
              {weight.toFixed(1)}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
