# Multi-stage build for production-grade image
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system deps for scientific libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Production image ──────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Non-root user for security
RUN addgroup --system app && adduser --system --group app

# Copy installed packages from builder
COPY --from=builder /root/.local /home/app/.local

# Copy application code
COPY --chown=app:app . .

# Data volume for SQLite
RUN mkdir -p /data && chown app:app /data

USER app

ENV PATH=/home/app/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV DB_PATH=/data/hft_causal.db

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:' + __import__('os').environ.get('PORT','8000') + '/api/v1/health')"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
