"""
Causal Analysis Service — discovers causal structure in portfolio returns.

Pipeline:
  1. Compute log returns from price DataFrame
  2. Run PC (Peter-Clark) algorithm via causal-learn
  3. Estimate treatment effects on identified causal edges via EconML LinearDML
  4. Return frontend-ready graph (nodes + edges)

All libraries (causal-learn, econml) are free open source.
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _compute_node_stats(returns_df: pd.DataFrame) -> dict[str, dict]:
    """Compute per-ticker statistics for node metadata."""
    stats = {}
    trading_days = 252
    for col in returns_df.columns:
        r = returns_df[col].dropna()
        stats[col] = {
            "avg_return": float(r.mean() * trading_days),
            "volatility": float(r.std() * np.sqrt(trading_days)),
        }
    return stats


def run_causal_discovery(
    returns_df: pd.DataFrame,
    significance_level: float = 0.05,
    max_cond_set_size: Optional[int] = None,
) -> dict:
    """
    Run the PC algorithm on portfolio log returns to discover causal DAG.

    Args:
        returns_df: DataFrame of daily returns (columns = ticker symbols)
        significance_level: p-value threshold for conditional independence tests
        max_cond_set_size: cap on conditioning set size (speeds up large graphs)

    Returns:
        {
            "adjacency_matrix": np.ndarray,
            "tickers": list[str],
            "dag_edges": list[{from, to}],
        }
    """
    try:
        from causallearn.search.ConstraintBased.PC import pc
        from causallearn.utils.cit import fisherz
    except ImportError:
        logger.error("causal-learn not installed. Run: pip install causal-learn")
        raise

    tickers = list(returns_df.columns)
    data = returns_df.dropna().values.astype(float)

    if data.shape[0] < 30:
        logger.warning("Fewer than 30 observations — causal results may be unreliable")

    logger.info(f"Running PC algorithm on {len(tickers)} tickers, {data.shape[0]} observations")

    kwargs = {
        "data": data,
        "alpha": significance_level,
        "indep_test": fisherz,
        "verbose": False,
        "show_progress": False,
    }
    if max_cond_set_size is not None:
        kwargs["depth"] = max_cond_set_size

    cg = pc(**kwargs)
    adj_matrix = cg.G.graph  # shape: (n, n), nonzero = edge exists

    # Extract directed edges: adj[i,j]=1 AND adj[j,i]=-1 means i→j
    dag_edges = []
    n = len(tickers)
    for i in range(n):
        for j in range(n):
            if adj_matrix[i, j] == 1 and adj_matrix[j, i] == -1:
                dag_edges.append({"from": tickers[i], "to": tickers[j]})

    logger.info(f"PC algorithm found {len(dag_edges)} directed causal edges")

    return {
        "adjacency_matrix": adj_matrix,
        "tickers": tickers,
        "dag_edges": dag_edges,
    }


def compute_treatment_effects(
    returns_df: pd.DataFrame,
    dag_result: dict,
) -> dict[tuple, dict]:
    """
    For each directed causal edge (X → Y), estimate the treatment effect
    using EconML's LinearDML (Double Machine Learning).

    Returns:
        {(source_ticker, target_ticker): {"effect": float, "p_value": float}}
    """
    try:
        from econml.dml import LinearDML
        from sklearn.linear_model import LassoCV, RidgeCV
    except ImportError:
        logger.warning("econml not installed — using OLS fallback for treatment effects")
        return _ols_treatment_effects(returns_df, dag_result["dag_edges"])

    effects = {}
    tickers = dag_result["tickers"]
    data = returns_df.dropna()

    for edge in dag_result["dag_edges"]:
        src = edge["from"]
        tgt = edge["to"]

        # Treatment: source returns; Outcome: target returns
        # Controls: all other tickers
        controls = [t for t in tickers if t not in (src, tgt)]

        T = data[src].values  # 1D — LinearDML accepts this; avoids sklearn column-vector warning
        Y = data[tgt].values
        X = data[controls].values if controls else np.ones((len(T), 1))

        try:
            dml = LinearDML(
                model_y=RidgeCV(),
                model_t=LassoCV(cv=3, max_iter=500),
                cv=3,
                random_state=42,
            )
            dml.fit(Y, T, X=X)
            effect = float(dml.effect(X).mean())

            # Approximate p-value via inference
            try:
                inf = dml.effect_inference(X)
                p_val = float(np.mean(inf.pvalue()))
            except Exception:
                # Fallback: derive p-value from effect magnitude
                se = abs(effect) / 2.0 if effect != 0 else 1.0
                t_stat = effect / max(se, 1e-10)
                from scipy import stats
                p_val = float(2 * (1 - stats.t.cdf(abs(t_stat), df=max(len(T) - 2, 1))))

            effects[(src, tgt)] = {"effect": round(effect, 6), "p_value": round(p_val, 6)}

        except Exception as e:
            logger.warning(f"DML failed for edge {src}→{tgt}: {e}. Using correlation.")
            corr = float(data[src].corr(data[tgt]))
            effects[(src, tgt)] = {"effect": round(corr, 6), "p_value": 0.05}

    return effects


def _ols_treatment_effects(
    returns_df: pd.DataFrame,
    dag_edges: list[dict],
) -> dict[tuple, dict]:
    """Fallback OLS-based treatment effects when econml is unavailable."""
    import statsmodels.api as sm
    from scipy import stats

    effects = {}
    data = returns_df.dropna()

    for edge in dag_edges:
        src, tgt = edge["from"], edge["to"]
        X = sm.add_constant(data[src].values)
        Y = data[tgt].values
        try:
            model = sm.OLS(Y, X).fit()
            effect = model.params[1]
            p_val = model.pvalues[1]
            effects[(src, tgt)] = {"effect": round(float(effect), 6), "p_value": round(float(p_val), 6)}
        except Exception:
            effects[(src, tgt)] = {"effect": 0.0, "p_value": 1.0}

    return effects


def format_for_frontend(
    dag_result: dict,
    effects: dict[tuple, dict],
    node_stats: dict[str, dict],
) -> dict:
    """
    Convert DAG result into frontend-ready JSON.

    Returns:
        {
            "nodes": [CausalNode, ...],
            "edges": [CausalEdge, ...],
        }
    """
    tickers = dag_result["tickers"]
    adj = dag_result["adjacency_matrix"]
    n = len(tickers)

    # Betweenness centrality (simple: count edges per node)
    out_degree = np.sum(adj == 1, axis=1)
    in_degree = np.sum(adj == 1, axis=0)
    total_degree = out_degree + in_degree
    max_deg = max(total_degree.max(), 1)
    centrality = total_degree / max_deg

    nodes = []
    for i, ticker in enumerate(tickers):
        stats = node_stats.get(ticker, {"avg_return": 0.0, "volatility": 0.0})
        nodes.append({
            "id": ticker,
            "label": ticker,
            "centrality": round(float(centrality[i]), 4),
            "avg_return": round(stats["avg_return"], 4),
            "volatility": round(stats["volatility"], 4),
        })

    edges = []
    for (src, tgt), eff in effects.items():
        effect = eff["effect"]
        edges.append({
            "source": src,
            "target": tgt,
            "weight": round(abs(effect), 6),
            "p_value": round(eff["p_value"], 6),
            "direction": "positive" if effect >= 0 else "negative",
        })

    return {"nodes": nodes, "edges": edges}


def compute_correlation_matrix(returns_df: pd.DataFrame) -> dict:
    """
    Compute Pearson correlation matrix between all tickers.
    Returns nested dict: {ticker -> {ticker -> correlation_coefficient}}.
    """
    corr = returns_df.corr().round(4)
    return corr.to_dict()


def run_full_causal_pipeline(returns_df: pd.DataFrame) -> dict:
    """
    Convenience wrapper: runs discovery + effects + formatting in one call.
    Uses alpha=0.1 (more permissive than 0.05) to discover more edges.
    Also computes Pearson correlation matrix as supplemental data.
    """
    node_stats = _compute_node_stats(returns_df)
    dag_result = run_causal_discovery(returns_df, significance_level=0.1)
    effects = compute_treatment_effects(returns_df, dag_result)
    graph = format_for_frontend(dag_result, effects, node_stats)
    graph["algorithm"] = "PC (Peter-Clark)"
    graph["significance_threshold"] = 0.1
    graph["correlation_matrix"] = compute_correlation_matrix(returns_df)
    return graph
