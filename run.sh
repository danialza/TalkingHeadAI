#!/usr/bin/env bash
# ============================================================
# TalkingHeadAI — Daily Run (start everything with one command)
# Usage:  ./run.sh
#
# Starts: Docker infra → Backend (port 8009) → Frontend (port 3000)
# Stop:   Ctrl+C  (kills both backend & frontend, keeps Docker running)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "${SCRIPT_DIR}"

echo "╔══════════════════════════════════════════════╗"
echo "║   TalkingHeadAI — Starting System            ║"
echo "╚══════════════════════════════════════════════╝"
echo

# ── Preflight checks ───────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "❌  .env not found. Run ./setup.sh first."
  exit 1
fi
if [[ ! -d .venv ]]; then
  echo "❌  .venv not found. Run ./setup.sh first."
  exit 1
fi
if [[ ! -d frontend/node_modules ]]; then
  echo "❌  frontend/node_modules not found. Run ./setup.sh first."
  exit 1
fi

# ── Cleanup on exit ─────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "▸ Shutting down..."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && echo "  ✓ Frontend stopped"
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null && echo "  ✓ Backend stopped"
  wait 2>/dev/null
  echo "  ℹ  Docker services still running. To stop: docker compose stop"
  echo "  Done."
}
trap cleanup EXIT INT TERM

# ── 1. Docker infrastructure ───────────────────────────────
echo "▸ [1/3] Docker infrastructure..."
docker compose up -d postgres qdrant redis 2>&1 | grep -v "Running" || true

# Quick health wait (max 15s)
for i in {1..15}; do
  healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"healthy"' || true)
  [[ "$healthy" -ge 3 ]] && break
  sleep 1
done
echo "  ✅ Postgres :5433 | Qdrant :6333 | Redis :6379"

# ── 2. Backend ──────────────────────────────────────────────
echo
echo "▸ [2/3] Backend (FastAPI + uvicorn)..."

# Kill any stale process on port 8009
STALE_PID=$(lsof -ti :8009 2>/dev/null || true)
if [[ -n "$STALE_PID" ]]; then
  echo "  ⚠️  Port 8009 occupied (PID ${STALE_PID}) — killing..."
  kill -9 $STALE_PID 2>/dev/null || true
  sleep 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a
export DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER:-thuser}:${POSTGRES_PASSWORD:-TalkingHead2026!}@localhost:5433/${POSTGRES_DB:-talkinghead}"
export QDRANT_URL="http://localhost:6333"
export REDIS_URL="redis://localhost:6379"

# Ensure frontend env vars point to local dev ports (not Docker/nginx port 80)
export NEXT_PUBLIC_API_URL="http://localhost:8009/api"
export NEXT_PUBLIC_WS_URL="ws://localhost:8009/api/ws"
export NEXT_PUBLIC_API_KEY="${NEXT_PUBLIC_API_KEY:-primentoring-mentor-2026}"

.venv/bin/uvicorn main:app \
  --app-dir backend \
  --host 0.0.0.0 --port 8009 \
  --reload --reload-dir backend \
  > >(sed 's/^/  [backend] /') 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo "  ⏳ Waiting for backend..."
for i in {1..30}; do
  if curl -sf http://localhost:8009/api/health >/dev/null 2>&1; then
    echo "  ✅ Backend ready → http://localhost:8009"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "  ⚠️  Backend not responding after 30s — check logs above"
  fi
  sleep 1
done

# ── 3. Frontend ─────────────────────────────────────────────
echo
echo "▸ [3/3] Frontend (Next.js)..."

# Kill any stale process on port 3000
STALE_FE=$(lsof -ti :3000 2>/dev/null || true)
if [[ -n "$STALE_FE" ]]; then
  echo "  ⚠️  Port 3000 occupied (PID ${STALE_FE}) — killing..."
  kill -9 $STALE_FE 2>/dev/null || true
  sleep 1
fi

cd frontend
npm run dev \
  > >(sed 's/^/  [frontend] /') 2>&1 &
FRONTEND_PID=$!
cd "${SCRIPT_DIR}"

# Wait for frontend
for i in {1..20}; do
  if curl -sf http://localhost:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "  ✅ Frontend ready → http://localhost:3000"

# ── Ready ───────────────────────────────────────────────────
echo
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  System running!                        ║"
echo "║                                              ║"
echo "║   Frontend:  http://localhost:3000            ║"
echo "║   Backend:   http://localhost:8009            ║"
echo "║   Mentor:    http://localhost:3000/mentor     ║"
echo "║                                              ║"
echo "║   Press Ctrl+C to stop                       ║"
echo "╚══════════════════════════════════════════════╝"
echo

# Keep alive — wait for background processes
wait
