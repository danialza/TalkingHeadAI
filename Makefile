.PHONY: help up up-local up-infra dev down logs seed pull-models shell-backend shell-db shell-frontend clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Starting services ──────────────────────────────────

up: ## Start all services (cloud mode — uses API keys)
	docker compose --profile app up -d
	@echo "✅  Started. Visit http://localhost"
	@echo "   Mentor dashboard: http://localhost/mentor"

up-local: ## Start with local AI (no cloud API costs, slower)
	docker compose --profile app --profile local-ai --profile llm-local up -d
	@echo "✅  Started with local AI. Visit http://localhost"

up-infra: ## Start only infra (postgres, qdrant, redis) — for local backend dev
	docker compose up -d postgres qdrant redis
	@echo "✅  Infra running (postgres:5432, qdrant:6333, redis:6379)"

dev: ## Start in dev mode with hot reload
	docker compose -f docker-compose.yml -f docker-compose.override.yml --profile app up

# ── Stopping ───────────────────────────────────────────

down: ## Stop all services
	docker compose --profile app --profile local-ai --profile llm-local down

down-v: ## Stop and remove volumes (⚠️  destroys data)
	docker compose --profile app --profile local-ai --profile llm-local down -v

# ── Utilities ──────────────────────────────────────────

logs: ## Tail all logs
	docker compose logs -f --tail=100

logs-backend: ## Tail backend logs
	docker compose logs -f backend

logs-frontend: ## Tail frontend logs
	docker compose logs -f frontend

# ── Database & Seeding ─────────────────────────────────

seed: ## Initialize DB, Qdrant, and load seed data
	docker compose exec backend python scripts/init_db.py
	docker compose exec backend python scripts/init_qdrant.py
	docker compose exec backend python seed/seed_kb.py
	@echo "✅  Database seeded!"

migrate: ## Run alembic migrations
	docker compose exec backend alembic upgrade head

# ── Shell access ────────────────────────────────────────

shell-backend: ## Open shell in backend container
	docker compose exec backend bash

shell-db: ## Open psql in postgres container
	docker compose exec postgres psql -U $${POSTGRES_USER:-thuser} -d $${POSTGRES_DB:-talkinghead}

shell-frontend: ## Open shell in frontend container
	docker compose exec frontend sh

# ── Local AI models ────────────────────────────────────

pull-models: ## Pull Ollama LLM model (run once)
	docker compose exec ollama ollama pull $${OLLAMA_MODEL:-llama3.2:3b}
	@echo "✅  Model downloaded. Whisper + Coqui models download automatically on first use."

# ── Build ──────────────────────────────────────────────

build: ## Rebuild all images
	docker compose --profile app --profile local-ai --profile llm-local build

build-backend: ## Rebuild backend only
	docker compose build backend

build-frontend: ## Rebuild frontend only
	docker compose build frontend

# ── Cleanup ────────────────────────────────────────────

clean-avatars: ## Delete generated avatar videos (frees disk space)
	rm -rf ./data/avatars/*
	@echo "✅  Avatar cache cleared"

clean: ## Remove all containers, images, and build cache
	docker compose --profile app --profile local-ai --profile llm-local down --rmi local
	docker builder prune -f
