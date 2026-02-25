"""Integration tests for FastAPI endpoints using TestClient."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert "name" in data
    assert data["name"] == "PortfolioIQ"


def test_health(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "uptime_seconds" in data


def test_analyze_valid_portfolio(client):
    """Full integration test — fetches real data from yfinance."""
    resp = client.post(
        "/api/v1/portfolio/analyze",
        json={"tickers": ["AAPL", "MSFT"], "period": "1y", "benchmark": "SPY"},
        timeout=120,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "portfolio_id" in data
    assert data["status"] == "complete"
    assert len(data["tickers"]) >= 1
    return data["portfolio_id"]


def test_analyze_invalid_ticker_still_works(client):
    """Invalid tickers should be filtered out gracefully."""
    resp = client.post(
        "/api/v1/portfolio/analyze",
        json={"tickers": ["AAPL", "INVALIDXXX999"], "period": "1y"},
        timeout=120,
    )
    # AAPL should still work
    assert resp.status_code == 200


def test_causal_graph_requires_analysis(client):
    resp = client.get("/api/v1/portfolio/nonexistentid123/causal-graph")
    assert resp.status_code == 404


def test_backtest_requires_analysis(client):
    resp = client.get("/api/v1/portfolio/nonexistentid123/backtest")
    assert resp.status_code == 404


def test_insights_requires_analysis(client):
    resp = client.get("/api/v1/portfolio/nonexistentid123/insights")
    assert resp.status_code == 404
