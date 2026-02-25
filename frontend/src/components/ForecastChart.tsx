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
import type { TickerForecast } from "@/lib/types";

type Horizon = "30d" | "60d" | "90d" | "6m" | "1y";

const HORIZONS: { id: Horizon; label: string }[] = [
  { id: "30d", label: "30d" },
  { id: "60d", label: "60d" },
  { id: "90d", label: "90d" },
  { id: "6m", label: "6m" },
  { id: "1y", label: "12m" },
];

const HORIZON_DAYS: Record<Horizon, number> = {
  "30d": 30,
  "60d": 60,
  "90d": 90,
  "6m": 182,
  "1y": 365,
};

interface Props {
  forecast: TickerForecast;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default function ForecastChart({ forecast }: Props) {
  const [horizon, setHorizon] = useState<Horizon>("1y");

  const horizonDays = HORIZON_DAYS[horizon];
  const futureSlice = forecast.future_series.slice(0, horizonDays);

  const lastHistDate =
    forecast.historical.length > 0
      ? forecast.historical[forecast.historical.length - 1].date
      : null;

  const chartData = [
    ...forecast.historical.map((p) => ({
      date: p.date,
      actual: p.yhat,
      forecast: null as number | null,
      lower: null as number | null,
      upper: null as number | null,
    })),
    ...futureSlice.map((p) => ({
      date: p.date,
      actual: null as number | null,
      forecast: p.yhat,
      lower: p.yhat_lower,
      upper: p.yhat_upper,
    })),
  ];

  const horizonKey = `forecast_${horizon}` as keyof TickerForecast;
  const horizonPoint = forecast[horizonKey] as {
    date: string;
    yhat: number;
    yhat_lower: number;
    yhat_upper: number;
  } | undefined;

  const currentPrice =
    forecast.historical.length > 0
      ? forecast.historical[forecast.historical.length - 1].yhat
      : null;

  const expectedReturn =
    currentPrice && horizonPoint && currentPrice > 0
      ? ((horizonPoint.yhat - currentPrice) / currentPrice) * 100
      : null;

  // 12-month target — always computed regardless of selected horizon
  const target1y = forecast.forecast_1y;
  const target1yReturn =
    currentPrice && target1y && currentPrice > 0
      ? ((target1y.yhat - currentPrice) / currentPrice) * 100
      : null;

  // Base y-axis on forecast/actual prices only — confidence bands (yhat_upper) can be
  // very wide due to Prophet weekly seasonality, which would skew the axis to 2× price.
  const allPrices = chartData.flatMap((d) =>
    [d.actual, d.forecast].filter((v): v is number => v !== null)
  );
  // Extend domain to include the 12-month target price even on shorter horizons
  if (target1y?.yhat) allPrices.push(target1y.yhat);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) * 0.95 : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) * 1.05 : 100;

  const tickFormatter = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };

  const show12mCard = horizon !== "1y" && target1y && target1yReturn !== null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-mono text-lg font-bold text-white">{forecast.ticker}</h3>
          <p className="text-xs text-slate-400">Prophet model · 12-month forecast</p>
        </div>

        {/* Horizon toggle */}
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

      {/* Stats */}
      {horizonPoint && (
        <div className="mb-4 space-y-3">
          <div className={`grid gap-3 ${show12mCard ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Current Price</p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {currentPrice ? fmt(currentPrice) : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Forecast ({horizon === "1y" ? "12m" : horizon})</p>
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  expectedReturn !== null && expectedReturn >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {fmt(horizonPoint.yhat)}
              </p>
            </div>
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Expected Return</p>
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  expectedReturn !== null && expectedReturn >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {expectedReturn !== null ? fmtPct(expectedReturn) : "—"}
              </p>
            </div>

            {/* 12-Month Target card — shown only on horizons shorter than 1y */}
            {show12mCard && (
              <div className="rounded-lg bg-surface-dark p-3 border border-indigo-500/25">
                <p className="text-xs text-indigo-400">12-Month Target</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    target1yReturn >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {fmt(target1y.yhat)}
                </p>
                <p
                  className={`text-xs font-medium ${
                    target1yReturn >= 0 ? "text-green-400/70" : "text-red-400/70"
                  }`}
                >
                  {fmtPct(target1yReturn)}
                </p>
              </div>
            )}
          </div>

          {/* Sentiment-adjusted 30d card */}
          {horizon === "30d" && forecast.sentiment_adjusted_30d && (
            <div className="rounded-lg border border-surface-border bg-surface-dark p-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <SentimentDot score={forecast.sentiment_score ?? 0} />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-medium">Sentiment-adjusted 30d</p>
                  <p className="text-xs text-slate-500">
                    VADER score{" "}
                    {forecast.sentiment_score !== undefined
                      ? `${forecast.sentiment_score >= 0 ? "+" : ""}${forecast.sentiment_score.toFixed(3)}`
                      : "n/a"}{" "}
                    · ±5% max adjustment
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-bold ${
                    forecast.sentiment_adjusted_30d.yhat >= horizonPoint.yhat
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {fmt(forecast.sentiment_adjusted_30d.yhat)}
                </p>
                {currentPrice && currentPrice > 0 && (
                  <p
                    className={`text-xs font-medium ${
                      forecast.sentiment_adjusted_30d.yhat >= currentPrice
                        ? "text-green-400/70"
                        : "text-red-400/70"
                    }`}
                  >
                    {fmtPct(
                      ((forecast.sentiment_adjusted_30d.yhat - currentPrice) / currentPrice) * 100
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id={`gradForecast_${forecast.ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`gradBand_${forecast.ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
              domain={[minPrice, maxPrice]}
              tickFormatter={(v) => `$${v.toFixed(0)}`}
              width={55}
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
                fmt(value),
                name === "actual"
                  ? "Actual"
                  : name === "forecast"
                  ? "Forecast"
                  : name === "upper"
                  ? "Upper bound"
                  : "Lower bound",
              ]}
            />
            {/* Today marker */}
            {lastHistDate && (
              <ReferenceLine
                x={lastHistDate}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="4 4"
                label={{ value: "Today", fill: "#94a3b8", fontSize: 10 }}
              />
            )}
            {/* 12-month target price line — always visible so shorter horizons
                show where the stock is expected to be in a year */}
            {target1y && target1y.yhat > 0 && (
              <ReferenceLine
                y={target1y.yhat}
                stroke="#6366f1"
                strokeOpacity={0.5}
                strokeDasharray="3 3"
                label={{
                  value: `12m ${fmt(target1y.yhat)}`,
                  fill: "#6366f1",
                  fontSize: 9,
                  position: "insideBottomRight",
                }}
              />
            )}
            {/* Confidence band */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill={`url(#gradBand_${forecast.ticker})`}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            {/* Historical actuals */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke="#94a3b8"
              strokeWidth={2}
              fill="transparent"
              dot={false}
              isAnimationActive={false}
            />
            {/* Forecast line */}
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#gradForecast_${forecast.ticker})`}
              strokeDasharray="5 3"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          No forecast data available for {forecast.ticker}
        </div>
      )}

      {/* Confidence range note */}
      {horizonPoint && (
        <p className="mt-2 text-center text-xs text-slate-500">
          80% confidence interval: {fmt(horizonPoint.yhat_lower)} – {fmt(horizonPoint.yhat_upper)}
        </p>
      )}
    </div>
  );
}

function SentimentDot({ score }: { score: number }) {
  const color =
    score > 0.05 ? "bg-green-400" : score < -0.05 ? "bg-red-400" : "bg-yellow-400";
  const title =
    score > 0.05
      ? "Positive sentiment"
      : score < -0.05
      ? "Negative sentiment"
      : "Neutral sentiment";
  return (
    <span className={`flex-shrink-0 h-2.5 w-2.5 rounded-full ${color}`} title={title} />
  );
}
