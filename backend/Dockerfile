# ── Base: shared deps ────────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Development: hot reload ──────────────────────────────
FROM base AS development
COPY requirements-dev.txt* ./
RUN pip install --no-cache-dir -r requirements-dev.txt 2>/dev/null || true
# Code mounted via volume in docker-compose.override.yml
CMD ["uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000", "--log-level", "debug"]

# ── Production: baked-in code ────────────────────────────
FROM base AS production
COPY . .

# Non-root user for security
RUN adduser --disabled-password --gecos '' appuser \
    && chown -R appuser:appuser /app \
    && mkdir -p /app/static/avatars \
    && chown appuser:appuser /app/static/avatars

USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-level", "info"]
