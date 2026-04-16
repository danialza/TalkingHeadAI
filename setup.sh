#!/usr/bin/env bash
# ============================================================
# TalkingHeadAI — First-Time Setup (run once on a new machine)
# Usage:  ./setup.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}"

echo "╔══════════════════════════════════════════════╗"
echo "║   TalkingHeadAI — First-Time Setup           ║"
echo "╚══════════════════════════════════════════════╝"
echo

# ── 1. Check prerequisites ─────────────────────────────────
echo "▸ Checking prerequisites..."

fail=0
command -v docker  >/dev/null 2>&1 || { echo "  ❌ docker not found";  fail=1; }
command -v node    >/dev/null 2>&1 || { echo "  ❌ node not found";    fail=1; }
command -v npm     >/dev/null 2>&1 || { echo "  ❌ npm not found";     fail=1; }
command -v python3 >/dev/null 2>&1 || { echo "  ❌ python3 not found"; fail=1; }
if [[ $fail -eq 1 ]]; then
  echo "  → Install missing tools first. See docs/run-guide/01-prerequisites.md"
  exit 1
fi
echo "  ✅ docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
echo "  ✅ node $(node --version)"
echo "  ✅ python3 $(python3 --version | awk '{print $2}')"

# ── 2. .env ─────────────────────────────────────────────────
echo
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    echo "▸ .env created from .env.example"
    echo "  ⚠️  Open .env and fill in your API keys before running!"
    echo "  → ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY"
    echo
    read -rp "  Press Enter after you've filled in the keys (or Ctrl+C to abort)..."
  else
    echo "  ❌ .env.example not found. Cannot create .env."
    exit 1
  fi
else
  echo "▸ .env already exists — skipping"
fi

# ── 3. Python venv ──────────────────────────────────────────
echo
if [[ ! -d .venv ]]; then
  echo "▸ Creating Python virtual environment..."
  python3 -m venv .venv
  echo "  ✅ .venv created"
else
  echo "▸ .venv already exists — skipping creation"
fi

echo "▸ Installing Python dependencies..."
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install -r backend/requirements.txt -q
echo "  ✅ pip install done"

# Quick sanity
.venv/bin/python -c "import fastapi, sqlalchemy, anthropic; print('  ✅ Python imports OK')"

# ── 4. Frontend dependencies ───────────────────────────────
echo
echo "▸ Installing frontend dependencies..."
cd frontend
npm install --silent 2>/dev/null
echo "  ✅ npm install done"
cd "${SCRIPT_DIR}"

# ── 5. Docker infrastructure ───────────────────────────────
echo
echo "▸ Starting Docker infrastructure (Postgres, Qdrant, Redis)..."
docker compose up -d postgres qdrant redis

echo "▸ Waiting for services to become healthy..."
for i in {1..30}; do
  healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"healthy"' || true)
  if [[ "$healthy" -ge 3 ]]; then
    echo "  ✅ All 3 services healthy"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "  ⚠️  Services not all healthy after 30s — check 'docker compose ps'"
  fi
  sleep 1
done

# ── 6. Start backend briefly to create tables ──────────────
echo
echo "▸ Starting backend to initialize database tables..."

set -a
# shellcheck disable=SC1091
source .env
set +a
export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-thuser}:${POSTGRES_PASSWORD:-TalkingHead2026!}@localhost:5433/${POSTGRES_DB:-talkinghead}"
export QDRANT_URL="http://localhost:6333"
export REDIS_URL="redis://localhost:6379"

# Start uvicorn in background, wait for startup, then kill
.venv/bin/uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8009 &
UVICORN_PID=$!
sleep 5

# Check tables created
TABLE_COUNT=$(docker exec primentoring-postgres-1 psql -U "${POSTGRES_USER:-thuser}" -d "${POSTGRES_DB:-talkinghead}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ' || echo "0")
echo "  ✅ ${TABLE_COUNT} tables created in Postgres"

kill $UVICORN_PID 2>/dev/null || true
wait $UVICORN_PID 2>/dev/null || true

# ── 7. Seed knowledge base ─────────────────────────────────
echo
echo "▸ Seeding knowledge base (30 Q&A pairs → Postgres + Qdrant)..."
.venv/bin/python backend/seed/seed_kb.py
echo "  ✅ Seed complete"

# ── Done ────────────────────────────────────────────────────
echo
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  Setup complete!                        ║"
echo "║                                              ║"
echo "║   To start the system:  ./run.sh             ║"
echo "╚══════════════════════════════════════════════╝"
