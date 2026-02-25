"""
Forecast Service — FB Prophet per-ticker price forecasting.

Fits an individual Prophet model per ticker and generates:
  - 30, 60, 90, 180, 365-day point forecasts with confidence intervals
  - Full daily forecast series out to 365 days (for chart rendering)
  - Last 90 days of historical actuals (for chart continuity)
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

import pandas as pd

logger = logging.getLogger(__name__)

# Forecast horizons in calendar days
HORIZONS = {
    "forecast_30d": 30,
    "forecast_60d": 60,
    "forecast_90d": 90,
    "forecast_6m": 182,
    "forecast_1y": 365,
}


def _run_ticker_forecast(prices_series: pd.Series, ticker: str) -> dict:
    """
    Fit a Prophet model on a ticker's historical price series.
    Returns the TickerForecast dict (matches schema).
    """
    try:
        from prophet import Prophet
    except ImportError:
        logger.error("prophet not installed — cannot run forecast")
        return _empty_forecast(ticker)

    if len(prices_series) < 60:
        logger.warning(f"Insufficient data for {ticker} ({len(prices_series)} days) — skipping forecast")
        return _empty_forecast(ticker)

    try:
        # Prepare Prophet dataframe
        df = prices_series.reset_index()
        df.columns = ["ds", "y"]
        # Strip timezone info — Prophet requires naive timestamps
        df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
        df = df.dropna()

        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
            changepoint_prior_scale=0.05,
            interval_width=0.80,
        )
        # Suppress Prophet's verbose output
        import logging as _logging
        _logging.getLogger("prophet").setLevel(_logging.WARNING)
        _logging.getLogger("cmdstanpy").setLevel(_logging.WARNING)

        model.fit(df)

        # Forecast 365 calendar days into the future
        future = model.make_future_dataframe(periods=365)
        forecast = model.predict(future)

        last_date = df["ds"].max()
        today = pd.Timestamp.now().normalize()

        def _point_at_horizon(days: int) -> dict:
            target = today + timedelta(days=days)
            # Find closest future row
            future_rows = forecast[forecast["ds"] >= target]
            if future_rows.empty:
                future_rows = forecast[forecast["ds"] >= last_date]
            row = future_rows.iloc[0]
            return {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "yhat": round(float(row["yhat"]), 2),
                "yhat_lower": round(float(row["yhat_lower"]), 2),
                "yhat_upper": round(float(row["yhat_upper"]), 2),
            }

        # Build historical tail (last 90 days of actuals, reindexed with Prophet values)
        historical_cutoff = today - timedelta(days=90)
        hist_rows = forecast[
            (forecast["ds"] >= historical_cutoff) & (forecast["ds"] <= today)
        ].copy()
        # Override yhat with actual prices where available
        actual_lookup = df.set_index("ds")["y"]
        historical = []
        for _, row in hist_rows.iterrows():
            date_str = row["ds"].strftime("%Y-%m-%d")
            actual = actual_lookup.get(row["ds"], None)
            yhat = float(actual) if actual is not None else float(row["yhat"])
            historical.append({
                "date": date_str,
                "yhat": round(yhat, 2),
                "yhat_lower": round(float(row["yhat_lower"]), 2),
                "yhat_upper": round(float(row["yhat_upper"]), 2),
            })

        # Future series: from today + 1 day to today + 365 days
        future_rows = forecast[forecast["ds"] > today].head(365)
        future_series = [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "yhat": round(float(row["yhat"]), 2),
                "yhat_lower": round(float(row["yhat_lower"]), 2),
                "yhat_upper": round(float(row["yhat_upper"]), 2),
            }
            for _, row in future_rows.iterrows()
        ]

        return {
            "ticker": ticker,
            "historical": historical,
            "forecast_30d": _point_at_horizon(30),
            "forecast_60d": _point_at_horizon(60),
            "forecast_90d": _point_at_horizon(90),
            "forecast_6m": _point_at_horizon(182),
            "forecast_1y": _point_at_horizon(365),
            "future_series": future_series,
        }

    except Exception as e:
        logger.warning(f"Prophet forecast failed for {ticker}: {e}")
        return _empty_forecast(ticker)


def _empty_forecast(ticker: str) -> dict:
    """Return a zero-filled forecast for when Prophet fails."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    empty_point = {"date": today, "yhat": 0.0, "yhat_lower": 0.0, "yhat_upper": 0.0}
    return {
        "ticker": ticker,
        "historical": [],
        "forecast_30d": empty_point,
        "forecast_60d": empty_point,
        "forecast_90d": empty_point,
        "forecast_6m": empty_point,
        "forecast_1y": empty_point,
        "future_series": [],
    }


async def run_portfolio_forecast(prices_df: pd.DataFrame, tickers: list[str]) -> dict:
    """
    Run Prophet forecasts for each ticker in a thread pool.
    Prophet is CPU-bound (Stan sampling), so we use run_in_executor.

    Returns:
        dict[ticker -> TickerForecast dict]
    """
    loop = asyncio.get_event_loop()
    results = {}

    for ticker in tickers:
        if ticker not in prices_df.columns:
            logger.warning(f"Ticker {ticker} not in prices DataFrame — skipping forecast")
            results[ticker] = _empty_forecast(ticker)
            continue

        series = prices_df[ticker].dropna()
        logger.info(f"Running Prophet forecast for {ticker} ({len(series)} data points)")
        try:
            result = await loop.run_in_executor(
                None, _run_ticker_forecast, series, ticker
            )
            results[ticker] = result
        except Exception as e:
            logger.warning(f"Forecast executor failed for {ticker}: {e}")
            results[ticker] = _empty_forecast(ticker)

    return results


def build_forecast_summary(ticker_forecasts: dict) -> dict:
    """
    Summarise the 1-year forecasts per ticker for passing to AI agents.
    Returns: {ticker: {current_price, forecast_1y_price, expected_return_pct}}
    """
    summary = {}
    for ticker, tf in ticker_forecasts.items():
        hist = tf.get("historical", [])
        if not hist:
            continue
        current_price = hist[-1]["yhat"]
        forecast_1y = tf.get("forecast_1y", {}).get("yhat", 0)
        if current_price > 0:
            expected_return = ((forecast_1y - current_price) / current_price) * 100
            summary[ticker] = {
                "current_price": round(current_price, 2),
                "forecast_1y_price": round(forecast_1y, 2),
                "expected_return_pct": round(expected_return, 2),
            }
    return summary
