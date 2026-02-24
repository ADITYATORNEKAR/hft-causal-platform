# Root-level Dockerfile — build context is repo root
# Render always looks for Dockerfile here regardless of render.yaml settings.

FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Production image ───────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN useradd --system --create-home app

COPY --from=builder /root/.local /home/app/.local
COPY --chown=app:app backend/ .

USER app

ENV PATH=/home/app/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV DB_PATH=/tmp/hft_causal.db

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request, os; urllib.request.urlopen('http://localhost:' + os.environ.get('PORT','8000') + '/api/v1/health')"

# Single worker for free tier (512 MB RAM)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
