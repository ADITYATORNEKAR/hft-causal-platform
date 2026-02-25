"use client";

import type { AgentInsights as AgentInsightsType, PortfolioPositionSummary } from "@/lib/types";
import { Lightbulb, AlertTriangle, TrendingUp, Cpu, DollarSign } from "lucide-react";

interface Props {
  data: AgentInsightsType;
  pnlSummary?: PortfolioPositionSummary;
}

function RiskBadge({ level }: { level: string }) {
  const config = {
    low: { cls: "badge-green", label: "Low Risk" },
    medium: { cls: "badge-yellow", label: "Medium Risk" },
    high: { cls: "badge-red", label: "High Risk" },
  };
  const c = config[level as keyof typeof config] ?? config.medium;
  return <span className={c.cls}>{c.label}</span>;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function AgentInsights({ data, pnlSummary }: Props) {
  return (
    <div className="space-y-5">
      {/* P&L Summary (if positions were provided) */}
      {pnlSummary && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            <h3 className="font-semibold text-white">Portfolio P&L</h3>
            <span
              className={`ml-auto text-sm font-bold ${
                pnlSummary.total_pnl >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              {pnlSummary.total_pnl >= 0 ? "+" : ""}
              {fmt(pnlSummary.total_pnl)}{" "}
              ({pnlSummary.total_pnl_pct >= 0 ? "+" : ""}
              {pnlSummary.total_pnl_pct.toFixed(2)}%)
            </span>
          </div>

          {/* Summary totals */}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Total Cost</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{fmt(pnlSummary.total_cost)}</p>
            </div>
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Current Value</p>
              <p className="mt-0.5 text-sm font-semibold text-white">{fmt(pnlSummary.total_value)}</p>
            </div>
            <div className="rounded-lg bg-surface-dark p-3">
              <p className="text-xs text-slate-500">Unrealized P&L</p>
              <p
                className={`mt-0.5 text-sm font-semibold ${
                  pnlSummary.total_pnl >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {pnlSummary.total_pnl >= 0 ? "+" : ""}
                {fmt(pnlSummary.total_pnl)}
              </p>
            </div>
          </div>

          {/* Per-ticker P&L table */}
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left pb-2">Ticker</th>
                <th className="text-right pb-2">Shares</th>
                <th className="text-right pb-2">Buy Price</th>
                <th className="text-right pb-2">Current</th>
                <th className="text-right pb-2">P&L</th>
                <th className="text-right pb-2">Return</th>
              </tr>
            </thead>
            <tbody>
              {pnlSummary.positions.map((pos) => (
                <tr key={pos.ticker} className="border-t border-surface-border">
                  <td className="py-2 font-mono font-bold text-white">{pos.ticker}</td>
                  <td className="py-2 text-right text-slate-300">{pos.quantity}</td>
                  <td className="py-2 text-right text-slate-300">{fmt(pos.purchase_price)}</td>
                  <td className="py-2 text-right text-slate-300">{fmt(pos.current_price)}</td>
                  <td
                    className={`py-2 text-right font-medium ${
                      pos.pnl >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {pos.pnl >= 0 ? "+" : ""}
                    {fmt(pos.pnl)}
                  </td>
                  <td
                    className={`py-2 text-right font-medium ${
                      pos.pnl_pct >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {pos.pnl_pct >= 0 ? "+" : ""}
                    {pos.pnl_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between rounded-xl border border-surface-border bg-surface-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
            <Cpu className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <p className="font-semibold text-white">AI Agent Analysis</p>
            <p className="text-xs text-slate-500">{data.model_used}</p>
          </div>
        </div>
        <RiskBadge level={data.risk_level} />
      </div>

      {/* Key Findings */}
      {data.key_findings.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-yellow-400" />
            <h3 className="font-semibold text-white">Key Findings</h3>
          </div>
          <ul className="space-y-3">
            {data.key_findings.map((finding, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-medium text-brand-500">
                  {i + 1}
                </span>
                <p className="text-sm text-slate-300">{finding}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk Assessment */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-400" />
          <h3 className="font-semibold text-white">Risk Assessment</h3>
        </div>
        <p className="text-sm text-slate-300">{data.risk_assessment}</p>
      </div>

      {/* Trade Signals */}
      {data.trade_signals.length > 0 && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <h3 className="font-semibold text-white">Signals & Recommendations</h3>
          </div>
          <ul className="space-y-2">
            {data.trade_signals.map((signal, i) => (
              <li key={i} className="text-sm text-slate-300">
                • {signal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full narrative */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <h3 className="mb-3 font-semibold text-white">Full Analysis</h3>
        <div className="space-y-3 text-sm text-slate-400 leading-relaxed">
          {data.agent_narrative.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>

      {/* Note (if rule-based fallback) */}
      {data.note && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 px-4 py-3 text-xs text-slate-500">
          {data.note}
        </div>
      )}
    </div>
  );
}
