"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  analyzePortfolio,
  getCausalGraph,
  getBacktest,
  getSentiment,
  getInsights,
  getForecast,
} from "@/lib/api";
import type { PortfolioResponse, PositionInput, PortfolioPositionSummary } from "@/lib/types";
import PortfolioForm from "@/components/PortfolioForm";
import CausalGraph from "@/components/CausalGraph";
import BacktestChart from "@/components/BacktestChart";
import AgentInsights from "@/components/AgentInsights";
import LivePrices from "@/components/LivePrices";
import RiskMetrics from "@/components/RiskMetrics";
import ForecastChart from "@/components/ForecastChart";
import PortfolioForecastChart from "@/components/PortfolioForecastChart";
import PortfolioSimulator from "@/components/PortfolioSimulator";
import PortfolioOptimizer from "@/components/PortfolioOptimizer";
import {
  Loader2,
  BarChart2,
  GitBranch,
  Brain,
  Zap,
  TrendingUp,
  LineChart,
  SlidersHorizontal,
  Target,
} from "lucide-react";

type Tab = "causal" | "backtest" | "insights" | "sentiment" | "forecast" | "simulator" | "optimize" | "live";

function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-xl border border-surface-border bg-surface-card p-6">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-32 w-full" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}

function AnalyzePage() {
  const searchParams = useSearchParams();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PortfolioResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("causal");
  const [finnhubKey, setFinnhubKey] = useState<string>("");
  const [groqKey, setGroqKey] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill tickers from URL params
  const urlTickers = searchParams.get("tickers") || "";

  const handleAnalyze = async (
    tickers: string[],
    period: "1y" | "2y" | "5y",
    benchmark: string,
    fKey?: string,
    gKey?: string,
    positions?: PositionInput[]
  ) => {
    setIsAnalyzing(true);
    setError(null);
    setPortfolioId(null);
    setAnalysisResult(null);

    if (fKey) setFinnhubKey(fKey);
    if (gKey) setGroqKey(gKey);

    try {
      const result = await analyzePortfolio({
        tickers,
        period,
        benchmark,
        finnhub_api_key: fKey || undefined,
        groq_api_key: gKey || undefined,
        positions: positions && positions.length > 0 ? positions : undefined,
      });
      setAnalysisResult(result);
      setPortfolioId(result.portfolio_id);
      setActiveTab("causal");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "causal", label: "Causal Graph", icon: GitBranch },
    { id: "backtest", label: "Backtest", icon: BarChart2 },
    { id: "insights", label: "AI Insights", icon: Brain },
    { id: "sentiment", label: "Sentiment", icon: TrendingUp },
    { id: "forecast", label: "Forecast", icon: LineChart },
    { id: "simulator", label: "Simulator", icon: SlidersHorizontal },
    { id: "optimize", label: "Optimize", icon: Target },
    { id: "live", label: "Live Prices", icon: Zap },
  ];

  const pnlSummary: PortfolioPositionSummary | undefined =
    analysisResult?.pnl_summary ?? undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Portfolio Analyzer</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter ticker symbols to discover causal relationships, run backtests, Prophet forecasts, and get AI insights.
        </p>
      </div>

      {/* Input form */}
      <PortfolioForm
        onAnalyze={handleAnalyze}
        isLoading={isAnalyzing}
        defaultTickers={urlTickers}
      />

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isAnalyzing && (
        <div className="mt-8 flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-slate-300 font-medium">Running analysis…</p>
          <p className="text-sm text-slate-500">
            Fetching data → Causal discovery → Backtest → Prophet forecast → AI insights
          </p>
          <p className="text-xs text-slate-600">Prophet forecasting may take 1–2 minutes for large portfolios</p>
        </div>
      )}

      {/* Summary bar */}
      {analysisResult && !isAnalyzing && (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-surface-border bg-surface-card p-4">
          <Stat label="Tickers" value={analysisResult.tickers.join(", ")} />
          <Stat label="Period" value={`${analysisResult.period} vs ${analysisResult.benchmark}`} />
          <Stat
            label="Portfolio Return"
            value={`${analysisResult.summary.portfolio_total_return > 0 ? "+" : ""}${analysisResult.summary.portfolio_total_return.toFixed(1)}%`}
            positive={analysisResult.summary.portfolio_total_return > 0}
          />
          {pnlSummary ? (
            <Stat
              label="Portfolio P&L"
              value={`${pnlSummary.total_pnl >= 0 ? "+" : ""}$${Math.abs(pnlSummary.total_pnl).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} (${pnlSummary.total_pnl_pct >= 0 ? "+" : ""}${pnlSummary.total_pnl_pct.toFixed(1)}%)`}
              positive={pnlSummary.total_pnl >= 0}
            />
          ) : (
            <Stat
              label="Top Performer"
              value={`${analysisResult.summary.top_performer} +${analysisResult.summary.top_performer_return.toFixed(1)}%`}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      {portfolioId && !isAnalyzing && (
        <div className="mt-8">
          <div className="flex overflow-x-auto border-b border-surface-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-b-2 border-brand-500 text-brand-500"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            <Suspense fallback={<SkeletonCard />}>
              {activeTab === "causal" && <CausalGraphTab portfolioId={portfolioId} />}
              {activeTab === "backtest" && <BacktestTab portfolioId={portfolioId} />}
              {activeTab === "insights" && (
                <InsightsTab portfolioId={portfolioId} pnlSummary={pnlSummary} />
              )}
              {activeTab === "sentiment" && (
                <SentimentTab portfolioId={portfolioId} finnhubKey={finnhubKey} />
              )}
              {activeTab === "forecast" && (
                <ForecastTab portfolioId={portfolioId} pnlSummary={pnlSummary} />
              )}
              {activeTab === "simulator" && (
                <SimulatorTab
                  portfolioId={portfolioId}
                  tickers={analysisResult?.tickers || []}
                />
              )}
              {activeTab === "optimize" && (
                <PortfolioOptimizer
                  portfolioId={portfolioId}
                  tickers={analysisResult?.tickers || []}
                />
              )}
              {activeTab === "live" && (
                <LiveTab
                  tickers={analysisResult?.tickers || []}
                  finnhubKey={finnhubKey}
                  portfolioId={portfolioId}
                />
              )}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold truncate ${
          positive === true ? "text-green-400" : positive === false ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function CausalGraphTab({ portfolioId }: { portfolioId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["causal", portfolioId],
    queryFn: () => getCausalGraph(portfolioId),
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  return data ? <CausalGraph data={data} /> : null;
}

function BacktestTab({ portfolioId }: { portfolioId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["backtest", portfolioId],
    queryFn: () => getBacktest(portfolioId),
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  return data ? (
    <>
      <RiskMetrics metrics={data.metrics} />
      <div className="mt-6">
        <BacktestChart data={data} />
      </div>
    </>
  ) : null;
}

function InsightsTab({
  portfolioId,
  pnlSummary,
}: {
  portfolioId: string;
  pnlSummary?: PortfolioPositionSummary;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["insights", portfolioId],
    queryFn: () => getInsights(portfolioId),
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  return data ? <AgentInsights data={data} pnlSummary={pnlSummary} /> : null;
}

function SentimentTab({
  portfolioId,
  finnhubKey,
}: {
  portfolioId: string;
  finnhubKey: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sentiment", portfolioId],
    queryFn: () => getSentiment(portfolioId, finnhubKey || undefined),
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {Object.entries(data.ticker_sentiment).map(([ticker, sentiment]) => (
        <div
          key={ticker}
          className="rounded-xl border border-surface-border bg-surface-card p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono font-bold text-white">{ticker}</span>
            <SentimentBadge label={sentiment.overall_label} score={sentiment.overall_score} />
          </div>
          <div className="space-y-2">
            {sentiment.articles.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <SentimentDot label={a.sentiment_label} />
                <div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-300 hover:text-white hover:underline"
                  >
                    {a.headline}
                  </a>
                  <span className="ml-2 text-slate-600">{a.source}</span>
                </div>
              </div>
            ))}
            {sentiment.articles.length === 0 && (
              <p className="text-xs text-slate-500">No recent news articles found.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ForecastTab({
  portfolioId,
  pnlSummary,
}: {
  portfolioId: string;
  pnlSummary?: PortfolioPositionSummary;
}) {
  const [view, setView] = useState<"combined" | "individual">("combined");

  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", portfolioId],
    queryFn: () => getForecast(portfolioId),
    staleTime: 30 * 60 * 1000,
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  if (!data) return null;

  const tickerEntries = Object.entries(data.ticker_forecasts);
  if (tickerEntries.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center text-sm text-slate-500">
        No forecast data available. Run analysis to generate Prophet forecasts.
      </div>
    );
  }

  const hasCombined = !!data.portfolio_forecast;
  const costBasis = pnlSummary?.total_cost;

  return (
    <div className="space-y-4">
      {/* View toggle — only shown when a combined portfolio forecast exists */}
      {hasCombined && (
        <div className="flex items-center gap-1 rounded-lg bg-surface-dark p-1 w-fit">
          <button
            onClick={() => setView("combined")}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              view === "combined"
                ? "bg-indigo-500 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Combined Portfolio
          </button>
          <button
            onClick={() => setView("individual")}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              view === "individual"
                ? "bg-brand-500 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Individual Stocks
          </button>
        </div>
      )}

      {/* Combined 12-month portfolio forecast */}
      {(view === "combined" || !hasCombined) && data.portfolio_forecast && (
        <PortfolioForecastChart
          forecast={data.portfolio_forecast}
          costBasis={costBasis}
        />
      )}

      {/* When combined view is active but no portfolio forecast exists, explain why */}
      {view === "combined" && !hasCombined && (
        <div className="rounded-xl border border-surface-border bg-surface-card p-8 text-center text-sm text-slate-500">
          Enter shares and average buy price in the portfolio form to enable the combined
          12-month projection.
        </div>
      )}

      {/* Individual 12-month stock forecasts */}
      {(view === "individual" || !hasCombined) &&
        tickerEntries.map(([ticker, tickerForecast]) => {
          if (!tickerForecast || tickerForecast.historical.length === 0) return null;
          return <ForecastChart key={ticker} forecast={tickerForecast} />;
        })}
    </div>
  );
}

function SimulatorTab({
  portfolioId,
  tickers,
}: {
  portfolioId: string;
  tickers: string[];
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["forecast", portfolioId],
    queryFn: () => getForecast(portfolioId),
    staleTime: 30 * 60 * 1000,
  });
  if (isLoading) return <SkeletonCard />;
  if (error) return <ErrorCard message={(error as Error).message} />;
  if (!data) return null;

  return <PortfolioSimulator tickers={tickers} forecastResult={data} />;
}

function LiveTab({
  tickers,
  finnhubKey,
  portfolioId,
}: {
  tickers: string[];
  finnhubKey: string;
  portfolioId?: string;
}) {
  return (
    <LivePrices tickers={tickers} finnhubKey={finnhubKey} portfolioId={portfolioId} />
  );
}

function SentimentBadge({ label, score }: { label: string; score: number }) {
  const cls =
    label === "positive"
      ? "badge-green"
      : label === "negative"
      ? "badge-red"
      : "badge-yellow";
  return (
    <span className={cls}>
      {label} ({score > 0 ? "+" : ""}
      {score.toFixed(2)})
    </span>
  );
}

function SentimentDot({ label }: { label: string }) {
  const color =
    label === "positive"
      ? "bg-green-400"
      : label === "negative"
      ? "bg-red-400"
      : "bg-yellow-400";
  return <span className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${color}`} />;
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-400">
      {message}
    </div>
  );
}

export default function AnalyzePageWrapper() {
  return (
    <Suspense fallback={null}>
      <AnalyzePage />
    </Suspense>
  );
}
