"""
HFT Causal Platform — FastAPI Application Entry Point
"""

import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import router as api_router

DB_PATH = Path("/tmp/hft_causal.db")
START_TIME = time.time()


def init_db() -> None:
    """Initialize SQLite database with required tables."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS portfolios (
            id TEXT PRIMARY KEY,
            tickers TEXT NOT NULL,
            period TEXT NOT NULL,
            benchmark TEXT NOT NULL,
            created_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS causal_graphs (
            portfolio_id TEXT PRIMARY KEY,
            nodes_json TEXT NOT NULL,
            edges_json TEXT NOT NULL,
            computed_at REAL NOT NULL,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS backtest_results (
            portfolio_id TEXT PRIMARY KEY,
            timeseries_json TEXT NOT NULL,
            metrics_json TEXT NOT NULL,
            computed_at REAL NOT NULL,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS agent_insights (
            portfolio_id TEXT PRIMARY KEY,
            insights_json TEXT NOT NULL,
            computed_at REAL NOT NULL,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS forecasts (
            portfolio_id TEXT PRIMARY KEY,
            forecast_json TEXT NOT NULL,
            computed_at REAL NOT NULL,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );

        CREATE TABLE IF NOT EXISTS causal_graphs_v2 (
            portfolio_id TEXT PRIMARY KEY,
            nodes_json TEXT NOT NULL,
            edges_json TEXT NOT NULL,
            correlation_json TEXT NOT NULL,
            computed_at REAL NOT NULL,
            FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        );
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup, clean up on shutdown."""
    init_db()
    yield


app = FastAPI(
    title="HFT Causal Platform API",
    description="Causal inference & multi-agent portfolio analytics — 100% free stack",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["root"])
def read_root():
    return {
        "name": "HFT Causal Platform",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/api/v1/health",
    }


@app.get("/api/v1/health", tags=["health"])
def health_check():
    return {
        "status": "ok",
        "version": "1.0.0",
        "uptime_seconds": round(time.time() - START_TIME, 1),
    }
