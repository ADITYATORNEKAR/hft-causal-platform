"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { X, Search, DollarSign, Upload, FileText, AlertCircle } from "lucide-react";
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

interface StockRow {
  ticker: string;
  companyName: string;
  quantity: string;
  purchase_price: string;
}

export default function PortfolioForm({ onAnalyze, isLoading, defaultTickers }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [input, setInput] = useState("");
  const [period, setPeriod] = useState<"1y" | "2y" | "5y">("2y");
  const [benchmark, setBenchmark] = useState("SPY");

  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from URL param
  useEffect(() => {
    if (defaultTickers) {
      const parsed = defaultTickers
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      setRows(parsed.map((ticker) => ({ ticker, companyName: "", quantity: "", purchase_price: "" })));
    }
  }, [defaultTickers]);

  const addedTickers = rows.map((r) => r.ticker);

  const addStock = (ticker: string, companyName = "") => {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized || addedTickers.includes(normalized) || rows.length >= 20) return;
    setRows((prev) => [...prev, { ticker: normalized, companyName, quantity: "", purchase_price: "" }]);
    setInput("");
    setSearchResults([]);
  };

  const removeStock = (ticker: string) => {
    setRows((prev) => prev.filter((r) => r.ticker !== ticker));
  };

  const updateRow = (ticker: string, field: "quantity" | "purchase_price", value: string) => {
    setRows((prev) => prev.map((r) => (r.ticker === ticker ? { ...r, [field]: value } : r)));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      if (input.trim() && searchResults.length === 0) addStock(input);
    }
    if (e.key === "Backspace" && !input && rows.length > 0) {
      removeStock(addedTickers[addedTickers.length - 1]);
    }
    if (e.key === "Escape") {
      setSearchResults([]);
    }
  };

  // Debounced search — always search for any input >= 2 chars
  const handleInputChange = (val: string) => {
    setInput(val);
    setSearchResults([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length < 2) return;

    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchTickers(val.trim());
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
    if (input.trim() && searchResults.length === 0) addStock(input);
    if (rows.length === 0) return;

    const tickers = rows.map((r) => r.ticker);

    const positionsPayload: PositionInput[] = rows
      .filter((r) => {
        const qty = parseFloat(r.quantity);
        const price = parseFloat(r.purchase_price);
        return qty > 0 && price > 0;
      })
      .map((r) => ({
        ticker: r.ticker,
        quantity: parseFloat(r.quantity),
        purchase_price: parseFloat(r.purchase_price),
      }));

    onAnalyze(
      tickers,
      period,
      benchmark,
      undefined,
      undefined,
      positionsPayload.length > 0 ? positionsPayload : undefined
    );
  };

  const anyPositionsFilled = rows.some((r) => r.quantity || r.purchase_price);

  const parseCSV = (text: string) => {
    setCsvError(null);
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setCsvError("CSV must have a header row and at least one data row.");
      return;
    }

    // Normalise header names
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const tickerIdx = headers.findIndex((h) => ["ticker", "symbol", "stock"].includes(h));
    const qtyIdx = headers.findIndex((h) => ["quantity", "qty", "shares", "units"].includes(h));
    const priceIdx = headers.findIndex((h) =>
      ["purchase_price", "avg_price", "avg_buy_price", "price", "cost", "cost_basis"].includes(h)
    );

    if (tickerIdx === -1) {
      setCsvError("CSV must have a 'ticker' column (or 'symbol' / 'stock').");
      return;
    }

    const parsed: StockRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const ticker = cols[tickerIdx]?.toUpperCase();
      if (!ticker) continue;
      if (parsed.length + rows.length >= 20) {
        errors.push(`Row ${i + 1}: skipped — 20-stock limit reached.`);
        break;
      }
      if (rows.some((r) => r.ticker === ticker) || parsed.some((r) => r.ticker === ticker)) {
        errors.push(`Row ${i + 1}: ${ticker} already in portfolio — skipped.`);
        continue;
      }
      const qty = qtyIdx !== -1 ? cols[qtyIdx] ?? "" : "";
      const price = priceIdx !== -1 ? cols[priceIdx] ?? "" : "";
      parsed.push({ ticker, companyName: "", quantity: qty, purchase_price: price });
    }

    if (parsed.length === 0) {
      setCsvError(errors.length > 0 ? errors[0] : "No valid rows found in CSV.");
      return;
    }

    setRows((prev) => [...prev, ...parsed]);
    if (errors.length > 0) setCsvError(errors.join(" "));
  };

  const handleCSVFile = (file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setCsvError("Please upload a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => parseCSV(e.target?.result as string);
    reader.readAsText(file);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-surface-border bg-surface-card p-6 space-y-5"
    >
      {/* Hidden CSV file input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleCSVFile(file);
          e.target.value = "";
        }}
      />

      {/* Search input */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">
            Search Stocks
            <span className="ml-2 text-xs text-slate-500">(ticker symbol or company name)</span>
          </label>
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={isLoading || rows.length >= 20}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-600 px-3 py-1 text-xs text-slate-400 hover:border-brand-500 hover:text-brand-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload className="h-3 w-3" />
            Upload CSV
          </button>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2.5 focus-within:border-brand-500 transition-colors">
            {searchLoading ? (
              <Search className="h-4 w-4 text-slate-500 animate-pulse shrink-0" />
            ) : (
              <Search className="h-4 w-4 text-slate-600 shrink-0" />
            )}
            <input
              id="ticker-input"
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                setTimeout(() => setSearchResults([]), 200);
                if (input.trim() && searchResults.length === 0) addStock(input);
              }}
              placeholder={rows.length === 0 ? "AAPL, Apple Inc, Tesla…" : "Add more stocks…"}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none"
              disabled={isLoading || rows.length >= 20}
              autoComplete="off"
            />
            {rows.length > 0 && (
              <span className="shrink-0 text-xs text-slate-600 font-mono">{rows.length}/20</span>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-surface-border bg-[#1e293b] shadow-xl">
              {searchResults.map((result) => {
                const alreadyAdded = addedTickers.includes(result.symbol);
                return (
                  <button
                    key={result.symbol}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!alreadyAdded) addStock(result.symbol, result.description);
                    }}
                    disabled={alreadyAdded}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-700/50 transition-colors first:rounded-t-lg last:rounded-b-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-white shrink-0">{result.symbol}</span>
                      <span className="text-slate-400 truncate">{result.description}</span>
                    </div>
                    <div className="ml-2 shrink-0 flex items-center gap-2">
                      {alreadyAdded && <span className="text-xs text-brand-500">Added</span>}
                      <span className="text-xs text-slate-600">{result.type}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {rows.length === 0 && (
          <p className="mt-1 text-xs text-slate-600">Add 2–20 stocks for causal analysis</p>
        )}
      </div>

      {/* CSV drag-and-drop zone — shown when no stocks added yet */}
      {rows.length === 0 && !isLoading && (
        <div
          onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
          onDragLeave={() => setCsvDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setCsvDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleCSVFile(file);
          }}
          onClick={() => csvInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed py-6 transition-colors ${
            csvDragOver
              ? "border-brand-500 bg-brand-500/5"
              : "border-slate-700 hover:border-slate-500"
          }`}
        >
          <FileText className={`h-7 w-7 ${csvDragOver ? "text-brand-400" : "text-slate-600"}`} />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-400">
              Drop a CSV file here, or{" "}
              <span className="text-brand-400 underline underline-offset-2">click to upload</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Required column: <span className="font-mono text-slate-500">ticker</span> · Optional:{" "}
              <span className="font-mono text-slate-500">quantity</span>,{" "}
              <span className="font-mono text-slate-500">purchase_price</span>
            </p>
          </div>
        </div>
      )}

      {/* CSV parse error */}
      {csvError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-xs text-red-400">{csvError}</p>
          <button
            type="button"
            onClick={() => setCsvError(null)}
            className="ml-auto shrink-0 text-red-400/60 hover:text-red-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Holdings rows */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_90px_110px_28px] gap-3 px-1 text-xs text-slate-500">
            <span>Stock</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Avg Buy Price ($)</span>
            <span />
          </div>

          {rows.map((row) => (
            <div
              key={row.ticker}
              className="grid grid-cols-[minmax(0,1fr)_90px_110px_28px] gap-3 items-center rounded-lg border border-surface-border bg-surface px-3 py-2"
            >
              {/* Ticker + company name */}
              <div className="min-w-0">
                <span className="font-mono text-sm font-bold text-white">{row.ticker}</span>
                {row.companyName && (
                  <span className="ml-2 text-xs text-slate-500 truncate hidden sm:inline">
                    {row.companyName}
                  </span>
                )}
              </div>

              {/* Shares */}
              <input
                type="number"
                min="0.001"
                step="any"
                placeholder="Shares"
                value={row.quantity}
                onChange={(e) => updateRow(row.ticker, "quantity", e.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface-card px-2.5 py-1.5 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors text-right"
                disabled={isLoading}
              />

              {/* Avg buy price */}
              <input
                type="number"
                min="0.01"
                step="any"
                placeholder="Price"
                value={row.purchase_price}
                onChange={(e) => updateRow(row.ticker, "purchase_price", e.target.value)}
                className="w-full rounded-md border border-surface-border bg-surface-card px-2.5 py-1.5 text-sm text-white placeholder-slate-600 focus:border-brand-500 outline-none transition-colors text-right"
                disabled={isLoading}
              />

              {/* Remove */}
              <button
                type="button"
                onClick={() => removeStock(row.ticker)}
                disabled={isLoading}
                className="text-slate-600 hover:text-red-400 transition-colors flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          <p className="text-xs text-slate-600 px-1 flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {anyPositionsFilled
              ? "Stocks with shares + price will include P&L analysis."
              : "Optionally enter shares and average buy price to enable P&L analysis."}
          </p>
        </div>
      )}

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

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || rows.length < 1}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading
          ? "Analyzing…"
          : `Analyze Portfolio (${rows.length} stock${rows.length !== 1 ? "s" : ""})`}
      </button>
    </form>
  );
}
