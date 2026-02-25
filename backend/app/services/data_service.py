"""
Data Service — fetches historical and live market data from free sources.

Sources (all free):
  - yfinance: historical OHLCV (no API key, unlimited)
  - Finnhub REST: real-time quotes (60 calls/min free, API key optional)
  - FRED: macro indicators (free API key)
  - feedparser: RSS financial news (no key)
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import feedparser
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# Free finance RSS feeds (no API key needed)
FINANCE_RSS_FEEDS = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US",
    "https://www.marketwatch.com/rss/topstories",
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
]


async def fetch_portfolio_data(
    tickers: list[str],
    period: str = "2y",
    benchmark: str = "SPY",
) -> dict:
    """
    Fetch historical adjusted close prices for all tickers + benchmark.

    Uses yfinance — completely free, no API key required.

    Returns:
        {
            "prices": pd.DataFrame (columns = tickers + benchmark),
            "returns": pd.DataFrame (log returns),
            "info": {ticker: {name, sector, market_cap}},
        }
    """
    all_tickers = list(set(tickers + [benchmark]))
    logger.info(f"Fetching historical data for {all_tickers} over {period}")

    loop = asyncio.get_event_loop()

    def _download():
        # Use individual Ticker.history() — more reliable on cloud IPs than
        # batch yf.download(), which Yahoo Finance rate-limits aggressively.
        dfs = {}
        for ticker in all_tickers:
            try:
                hist = yf.Ticker(ticker).history(period=period, auto_adjust=True)
                if len(hist) > 0:
                    dfs[ticker.upper()] = hist["Close"].rename(ticker.upper())
                else:
                    logger.warning(f"Empty history for {ticker}")
            except Exception as e:
                logger.warning(f"Failed to fetch {ticker}: {e}")
        if not dfs:
            return pd.DataFrame()
        return pd.DataFrame(dfs).dropna(how="all")

    prices = await loop.run_in_executor(None, _download)

    if prices.empty:
        logger.error("All tickers returned empty data from yfinance")
        return {"prices": prices, "returns": pd.DataFrame(), "info": {}}

    # Forward-fill minor gaps, backfill leading NaNs, drop any remaining
    prices = prices.ffill().bfill().dropna(how="all")

    # Log returns
    returns = prices.pct_change().dropna()

    # Fetch basic ticker info
    def _fetch_info(ticker: str) -> dict:
        try:
            t = yf.Ticker(ticker)
            info = t.info
            return {
                "name": info.get("longName", ticker),
                "sector": info.get("sector", "Unknown"),
                "market_cap": info.get("marketCap", 0),
            }
        except Exception:
            return {"name": ticker, "sector": "Unknown", "market_cap": 0}

    info = {}
    for ticker in tickers:
        info[ticker] = await loop.run_in_executor(None, _fetch_info, ticker)

    logger.info(f"Downloaded {len(prices)} trading days for {len(prices.columns)} tickers")
    return {"prices": prices, "returns": returns, "info": info}


async def fetch_live_price(
    ticker: str,
    finnhub_api_key: Optional[str] = None,
) -> Optional[dict]:
    """
    Fetch real-time quote via Finnhub REST API (free tier: 60 calls/min).
    Falls back to yfinance delayed quote if no API key provided.

    Returns dict with price, change, change_pct, high, low, open, prev_close.
    """
    api_key = finnhub_api_key or os.getenv("FINNHUB_API_KEY", "")

    if api_key:
        import httpx
        url = f"https://finnhub.io/api/v1/quote?symbol={ticker}&token={api_key}"
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                if data.get("c", 0) > 0:
                    return {
                        "ticker": ticker,
                        "price": data["c"],
                        "change": data["d"],
                        "change_pct": data["dp"],
                        "high": data["h"],
                        "low": data["l"],
                        "open": data["o"],
                        "prev_close": data["pc"],
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
            except Exception as e:
                logger.warning(f"Finnhub quote failed for {ticker}: {e}")

    # Fallback: yfinance (15-min delayed, always free)
    loop = asyncio.get_event_loop()

    def _yf_quote():
        t = yf.Ticker(ticker)
        hist = t.history(period="2d", interval="1d")
        if len(hist) >= 2:
            prev = hist["Close"].iloc[-2]
            curr = hist["Close"].iloc[-1]
            chg = curr - prev
            chg_pct = (chg / prev) * 100
            return {
                "ticker": ticker,
                "price": round(curr, 2),
                "change": round(chg, 2),
                "change_pct": round(chg_pct, 2),
                "high": round(hist["High"].iloc[-1], 2),
                "low": round(hist["Low"].iloc[-1], 2),
                "open": round(hist["Open"].iloc[-1], 2),
                "prev_close": round(prev, 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        return None

    return await loop.run_in_executor(None, _yf_quote)


async def fetch_news(
    ticker: str,
    count: int = 10,
    finnhub_api_key: Optional[str] = None,
) -> list[dict]:
    """
    Fetch recent news articles for a ticker.
    Uses Finnhub news (if key available) + Yahoo Finance RSS as fallback.
    """
    articles = []
    api_key = finnhub_api_key or os.getenv("FINNHUB_API_KEY", "")

    # --- Finnhub company news (free: API key required) ---
    if api_key:
        import httpx
        today = datetime.now().strftime("%Y-%m-%d")
        from_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        url = (
            f"https://finnhub.io/api/v1/company-news"
            f"?symbol={ticker}&from={from_date}&to={today}&token={api_key}"
        )
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                for item in resp.json()[:count]:
                    articles.append({
                        "headline": item.get("headline", ""),
                        "url": item.get("url", ""),
                        "source": item.get("source", "Finnhub"),
                        "published_at": datetime.fromtimestamp(
                            item.get("datetime", 0), tz=timezone.utc
                        ).isoformat(),
                        "raw_text": item.get("summary", item.get("headline", "")),
                    })
            except Exception as e:
                logger.warning(f"Finnhub news failed for {ticker}: {e}")

    # --- Yahoo Finance RSS (no API key, always free) ---
    if len(articles) < count:
        loop = asyncio.get_event_loop()
        rss_url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"

        def _parse_rss():
            feed = feedparser.parse(rss_url)
            results = []
            for entry in feed.entries[: count - len(articles)]:
                results.append({
                    "headline": entry.get("title", ""),
                    "url": entry.get("link", ""),
                    "source": "Yahoo Finance",
                    "published_at": entry.get("published", datetime.now(timezone.utc).isoformat()),
                    "raw_text": entry.get("summary", entry.get("title", "")),
                })
            return results

        try:
            rss_articles = await loop.run_in_executor(None, _parse_rss)
            articles.extend(rss_articles)
        except Exception as e:
            logger.warning(f"RSS fetch failed for {ticker}: {e}")

    return articles[:count]


async def search_ticker(query: str, finnhub_api_key: Optional[str] = None) -> list[dict]:
    """
    Search for ticker symbols by company name using Finnhub /search endpoint.
    Returns up to 10 matching [{symbol, description, type}].
    Falls back to empty list if no API key or request fails.
    """
    import httpx
    api_key = finnhub_api_key or os.getenv("FINNHUB_API_KEY", "")
    if not api_key or not query.strip():
        return []

    url = f"https://finnhub.io/api/v1/search?q={query.strip()}&token={api_key}"
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            return [
                {
                    "symbol": r["symbol"],
                    "description": r.get("description", r["symbol"]),
                    "type": r.get("type", ""),
                }
                for r in data.get("result", [])[:10]
                if r.get("type") in ("Common Stock", "ETP", "ADR")
            ]
        except Exception as e:
            logger.warning(f"Ticker search failed for '{query}': {e}")
            return []


async def fetch_macro_indicators(fred_api_key: Optional[str] = None) -> dict:
    """
    Fetch macro indicators from FRED (free API key required).
    Falls back to graceful empty dict if no key provided.

    Indicators: VIX, 10Y Treasury yield, Fed Funds Rate
    """
    api_key = fred_api_key or os.getenv("FRED_API_KEY", "")
    if not api_key:
        return {"note": "No FRED_API_KEY set — macro indicators unavailable"}

    try:
        from fredapi import Fred
        fred = Fred(api_key=api_key)
        loop = asyncio.get_event_loop()

        def _fetch():
            indicators = {}
            series_map = {
                "vix": "VIXCLS",
                "treasury_10y": "DGS10",
                "fed_funds_rate": "FEDFUNDS",
                "cpi_yoy": "CPIAUCSL",
            }
            for name, series_id in series_map.items():
                try:
                    s = fred.get_series(series_id, observation_start="2020-01-01")
                    latest = s.dropna().iloc[-1]
                    indicators[name] = round(float(latest), 4)
                except Exception:
                    indicators[name] = None
            return indicators

        return await loop.run_in_executor(None, _fetch)

    except Exception as e:
        logger.warning(f"FRED fetch failed: {e}")
        return {"error": str(e)}
