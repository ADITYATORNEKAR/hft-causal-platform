"""
Portfolio Optimizer — mean-variance optimization using Prophet forecast returns.

Strategies:
  - max_sharpe:     Maximize Sharpe ratio (forecast return / historical volatility)
  - min_volatility: Minimum variance portfolio
  - equal_weight:   Naive equal-allocation baseline

Uses scipy.optimize (already in scikit-learn's deps) for constrained optimization.
Expected returns come from the Prophet 1-year forecast per ticker.
Covariance is estimated from historical daily returns (annualised × 252).
"""

import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Approximate risk-free rate (US 3-month T-bill proxy)
RISK_FREE_RATE = 0.045  # 4.5%


def _portfolio_stats(weights: np.ndarray, mu: np.ndarray, cov: np.ndarray):
    """Return (expected_return, volatility, sharpe) for a weight vector."""
    ret = float(np.dot(weights, mu))
    vol = float(np.sqrt(np.dot(weights, np.dot(cov, weights))))
    sharpe = (ret - RISK_FREE_RATE) / vol if vol > 1e-9 else 0.0
    return ret, vol, sharpe


def _format_result(
    weights: np.ndarray,
    tickers: list[str],
    mu: np.ndarray,
    cov: np.ndarray,
    strategy: str,
) -> dict:
    w = np.array(weights, dtype=float)
    # Clip small negatives from solver noise, renormalise
    w = np.clip(w, 0, 1)
    total = w.sum()
    if total < 1e-9:
        w = np.ones(len(tickers)) / len(tickers)
    else:
        w = w / total

    ret, vol, sharpe = _portfolio_stats(w, mu, cov)
    allocation = {tickers[i]: round(float(w[i]) * 100, 1) for i in range(len(tickers))}

    return {
        "strategy": strategy,
        "weights": allocation,
        "expected_return": round(ret * 100, 2),
        "expected_volatility": round(vol * 100, 2),
        "sharpe_ratio": round(sharpe, 3),
    }


def optimize_portfolio(
    tickers: list[str],
    expected_returns_pct: dict[str, float],   # {ticker: annual return %}
    cov_matrix: list[list[float]],            # annualised covariance matrix (rows = tickers)
) -> dict:
    """
    Run mean-variance optimisation and return three strategy allocations.

    Returns:
        {
            "max_sharpe":     {strategy, weights, expected_return, expected_volatility, sharpe_ratio},
            "min_volatility": {...},
            "equal_weight":   {...},
        }
    """
    try:
        from scipy.optimize import minimize
    except ImportError:
        logger.error("scipy not available — cannot run optimization")
        return _fallback_equal_weight(tickers, expected_returns_pct, cov_matrix)

    n = len(tickers)
    if n < 2:
        return _fallback_equal_weight(tickers, expected_returns_pct, cov_matrix)

    # Convert % to decimal
    mu = np.array([expected_returns_pct.get(t, 0.0) / 100.0 for t in tickers])
    cov = np.array(cov_matrix, dtype=float)

    # Ensure cov is positive semi-definite (add small regularisation if needed)
    eigvals = np.linalg.eigvalsh(cov)
    if eigvals.min() < 0:
        cov += (-eigvals.min() + 1e-8) * np.eye(n)

    w0 = np.ones(n) / n
    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    # Cap single-asset weight to prevent degenerate 100% concentration.
    # For n >= 4 tickers: max weight = min(40%, 2/n) → spreads allocation sensibly.
    # For n < 4: allow up to 60% in one asset.
    max_w = min(0.40, 2.0 / n) if n >= 4 else 0.60
    bounds = [(0.0, max_w)] * n

    # ── Max Sharpe ──────────────────────────────────────────────────────────────
    def neg_sharpe(w):
        r, v, _ = _portfolio_stats(w, mu, cov)
        return -(r - RISK_FREE_RATE) / v if v > 1e-9 else 0.0

    res_sharpe = minimize(
        neg_sharpe, w0, method="SLSQP", bounds=bounds, constraints=constraints,
        options={"ftol": 1e-9, "maxiter": 1000},
    )

    # ── Min Volatility ─────────────────────────────────────────────────────────
    def portfolio_vol(w):
        return float(np.sqrt(np.dot(w, np.dot(cov, w))))

    res_minvol = minimize(
        portfolio_vol, w0, method="SLSQP", bounds=bounds, constraints=constraints,
        options={"ftol": 1e-9, "maxiter": 1000},
    )

    return {
        "max_sharpe": _format_result(
            res_sharpe.x if res_sharpe.success else w0,
            tickers, mu, cov, "Max Sharpe",
        ),
        "min_volatility": _format_result(
            res_minvol.x if res_minvol.success else w0,
            tickers, mu, cov, "Min Volatility",
        ),
        "equal_weight": _format_result(w0, tickers, mu, cov, "Equal Weight"),
    }


def _fallback_equal_weight(
    tickers: list[str],
    expected_returns_pct: dict[str, float],
    cov_matrix: list[list[float]],
) -> dict:
    n = len(tickers)
    w = np.ones(n) / n
    mu = np.array([expected_returns_pct.get(t, 0.0) / 100.0 for t in tickers])
    cov = np.array(cov_matrix, dtype=float)
    eq = _format_result(w, tickers, mu, cov, "Equal Weight")
    return {"max_sharpe": eq, "min_volatility": eq, "equal_weight": eq}


def build_covariance_matrix(
    returns_dict: dict[str, list[float]],
    tickers: list[str],
) -> Optional[list[list[float]]]:
    """
    Build an annualised covariance matrix from daily return series.
    returns_dict: {ticker: [daily_return, ...]}  (same length, same order)
    Returns None if insufficient data.
    """
    try:
        import pandas as pd
        df = pd.DataFrame({t: returns_dict[t] for t in tickers if t in returns_dict})
        if df.empty or len(df) < 30:
            return None
        cov = df.cov() * 252  # annualise
        # Return as list-of-lists in ticker order
        return cov.reindex(index=tickers, columns=tickers).fillna(0).values.tolist()
    except Exception as e:
        logger.warning(f"Covariance matrix build failed: {e}")
        return None
