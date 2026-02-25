"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { X, ChevronDown, Key, Search, DollarSign } from "lucide-react";
import { searchTickers } from "@/lib/api";
import type { PositionInput, TickerSearchResult } from "@/lib/types";

interface Props {
  onAnalyze: (
    tickers: string[],
    period: "1y" | "2y" | "5y",
    benchmark: string,
    finnhubKey?: string,
    groqKey?: string,
    positions?: PositionInput[]
  ) => void;
  isLoading: boolean;
  defaultTickers?: string;
}

const PERIODS: { value: "1y" | "2y" | "5y"; label: string }[] = [
  { value: "1y", label: "1 Year" },
  { value: "2y", label: "2 Years" },
  { value: "5y", label: "5 Years" },
];

export default function PortfolioForm({ onAnalyze, isLoading, defaultTickers }: Props) {
  const [tickers, setTickers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [period, setPeriod] = useState<"1y" | "2y" | "5y">("2y");
  const [benchmark, setBenchmark] = useState("SPY");
  const [finnhubKey, setFinnhubKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  // Company name search state
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Position inputs state
  const [showPositions, setShowPositions] = useState(false);
  const [positions, setPositions] = useState<Record<string, { quantity: string; purchase_price: string }>>({});

  // Pre-fill from URL param
  useEffect(() => {
    if (defaultTickers) {
      const parsed = defaultTickers
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      setTickers(parsed);
    }
  }, [defaultTickers]);

  // Sync positions state when tickers change
  useEffect(() => {
    setPositions((prev) => {
      const next: typeof prev = {};
      for (const t of tickers) {
        next[t] = prev[t] ?? { quantity: "", purchase_price: "" };
      }
      return next;
    });
  }, [tickers]);

  const addTicker = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (ticker && !tickers.includes(ticker) && tickers.length < 20) {
      setTickers((prev) => [...prev, ticker]);
    }
    setInput("");
    setSearchResults([]);
  };

  const removeTicker = (ticker: string) => {
    setTickers((prev) => prev.filter((t) => t !== ticker));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      if (input.trim() && searchResults.length === 0) addTicker(input);
    }
    if (e.key === "Backspace" && !input && tickers.length > 0) {
      removeTicker(tickers[tickers.length - 1]);
    }
    if (e.key === "Escape") {
      setSearchResults([]);
    }
  };

  // Debounced company name search
  const handleInputChange = (val: string) => {
    setInput(val);
    setSearchResults([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    // If it looks like a plain ticker symbol (all caps, no spaces), don't search
    const isTickerPattern = /^[A-Z]{1,5}$/.test(val.trim().toUpperCase());
    if (isTickerPattern || val.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchTickers(val.trim(), finnhubKey || undefined);
        setSearchResults(results.slice(0, 8));
      } catch {
        // silently ignore search errors
      } finally {
        setSearchLoading(false);
      }
    }, 350);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && searchResults.length === 0) addTicker(input);
    if (tickers.length === 0) return;

    // Build positions array from position inputs
    const positionsPayload: PositionInput[] = [];
    if (showPositions) {
      for (const ticker of tickers) {
        const pos = positions[ticker];
        if (pos && pos.quantity && pos.purchase_price) {
          const qty = parseFloat(pos.quantity);
          const price = parseFloat(pos.purchase_price);
          if (qty > 0 && price > 0) {
            positionsPayload.push({ ticker, quantity: qty, purchase_price: price });
          }
        }
      }
    }

    onAnalyze(
      tickers,
      period,
      benchmark,
      finnhubKey || undefined,
      groqKey || undefined,
      positionsPayload.length > 0 ? positionsPayload : undefined
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-surface-border bg-surface-card p-6 space-y-5"
    >
      {/* Ticker chip input with company search */}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Stock Tickers
          <span className="ml-2 text-xs text-slate-500">
            (type symbol or company name)
          </span>
        </label>
        <div className="relative">
          <div
            className="flex min-h-[48px] flex-wrap gap-2 rounded-lg border border-surface-border bg-surface p-2 focus-within:border-brand-500 transition-colors cursor-text"
            onClick={() => document.getElementById("ticker-input")?.focus()}
          >
            {tickers.map((ticker) => (
              <span
                key={ticker}
                className="flex items-center gap-1.5 rounded-md bg-brand-500/20 px-2.5 py-1 text-sm font-mono font-medium text-brand-500"
              >
                {ticker}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTicker(ticker); }}
                  className="text-brand-500/60 hover:text-brand-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="relative flex flex-1 items-center gap-1 min-w-[180px]">
              {searchLoading ? (
                <Search className="h-3.5 w-3.5 text-slate-500 animate-pulse" />
              ) : (
                <Search className="h-3.5 w-3.5 text-slate-600" />
              )}
              <input
                id="ticker-input"
                type="text"
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  setTimeout(() => setSearchResults([]), 200);
                  if (input.trim() && searchResults.length === 0) addTicker(input);
                }}
                placeholder={tickers.length === 0 ? "AAPL or Apple Inc…" : "Add more…"}
                className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Company search dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-surface-border bg-[#1e293b] shadow-xl">
              {searchResults.map((result) => (
                <button
                  key={result.symbol}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTicker(result.symbol);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  <div>
                    <span className="font-mono font-bold text-white">{result.symbol}</span>
                    <span className="ml-2 text-slate-400 truncate">{result.description}</span>
                  </div>
                  <span className="ml-2 shrink-0 text-xs text-slate-600">{result.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {tickers.length === 0 && (
          <p className="mt-1 text-xs text-slate-600">Add 2–20 tickers for causal analysis</p>
        )}
      </div>

      {/* Period + Benchmark row */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="mb-2 block text-sm font-medium text-slate-300">Period</label>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  period === p.value
                    ? "border-brand-500 bg-brand-500/10 text-brand-500"
                    : "border-surface-border text-slate-400 hover:text-slate-200"
                }`}
                disabled={isLoading}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:w-32">
          <label className="mb-2 block text-sm font-medium text-slate-300">Benchmark</label>
          <input
            type="text"
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value.toUpperCase())}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors"
            placeholder="SPY"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Portfolio positions (optional) */}
      {tickers.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPositions(!showPositions)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <DollarSign className="h-3 w-3" />
            {showPositions ? "Hide" : "Enter"} position details (shares + buy price for P&L)
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showPositions ? "rotate-180" : ""}`}
            />
          </button>

          {showPositions && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 px-1">
                <span>Ticker</span>
                <span>Shares</span>
                <span>Avg Buy Price ($)</span>
              </div>
              {tickers.map((ticker) => (
                <div key={ticker} className="grid grid-cols-3 gap-2">
                  <div className="flex items-center">
                    <span className="font-mono text-sm font-bold text-white">{ticker}</span>
                  </div>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder="0"
                    value={positions[ticker]?.quantity ?? ""}
                    onChange={(e) =>
                      setPositions((prev) => ({
                        ...prev,
                        [ticker]: { ...prev[ticker], quantity: e.target.value },
                      }))
                    }
                    className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors"
                    disabled={isLoading}
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    placeholder="0.00"
                    value={positions[ticker]?.purchase_price ?? ""}
                    onChange={(e) =>
                      setPositions((prev) => ({
                        ...prev,
                        [ticker]: { ...prev[ticker], purchase_price: e.target.value },
                      }))
                    }
                    className="rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors"
                    disabled={isLoading}
                  />
                </div>
              ))}
              <p className="text-xs text-slate-600">Leave blank to skip P&L analysis for a ticker</p>
            </div>
          )}
        </div>
      )}

      {/* Optional API keys */}
      <div>
        <button
          type="button"
          onClick={() => setShowKeys(!showKeys)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Key className="h-3 w-3" />
          {showKeys ? "Hide" : "Add"} optional API keys (for live data & AI insights)
          <ChevronDown
            className={`h-3 w-3 transition-transform ${showKeys ? "rotate-180" : ""}`}
          />
        </button>

        {showKeys && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Finnhub API Key{" "}
                <span className="text-slate-600">
                  — free at{" "}
                  <a
                    href="https://finnhub.io/register"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:underline"
                  >
                    finnhub.io
                  </a>{" "}
                  (live prices + news + search)
                </span>
              </label>
              <input
                type="password"
                value={finnhubKey}
                onChange={(e) => setFinnhubKey(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors"
                placeholder="fh_xxxxxxxxxxxxxxxx"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Groq API Key{" "}
                <span className="text-slate-600">
                  — free at{" "}
                  <a
                    href="https://console.groq.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:underline"
                  >
                    console.groq.com
                  </a>{" "}
                  (AI insights via Llama-3.3-70b)
                </span>
              </label>
              <input
                type="password"
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors"
                placeholder="gsk_xxxxxxxxxxxxxxxx"
                disabled={isLoading}
              />
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || tickers.length < 1}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading
          ? "Analyzing…"
          : `Analyze Portfolio (${tickers.length} ticker${tickers.length !== 1 ? "s" : ""})`}
      </button>
    </form>
  );
}
