# Operation Shadow — local development commands (Docker only; no host Node required).
COMPOSE := docker compose

.DEFAULT_GOAL := help
PHONY_EXTRA := scan-bundle audit
.PHONY: help up down logs ps migrate seed shell lint typecheck test test-unit test-integration e2e e2e-prod check prod prod-down build rebuild reset voice-bank textures

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Start Postgres, run migrations and seed, then the dev server on http://localhost:3000
	$(COMPOSE) up -d --build --wait app
	@echo "Operation Shadow is running at http://localhost:3000"

down: ## Stop the stack (keeps the database volume)
	$(COMPOSE) --profile prod --profile e2e --profile e2e-prod down

logs: ## Follow logs for all running services
	$(COMPOSE) logs -f --tail=200

ps: ## Show service status
	$(COMPOSE) ps

migrate: ## Apply database migrations
	$(COMPOSE) run --rm migrate

seed: ## Seed local data (dev test operators)
	$(COMPOSE) run --rm seed

shell: ## Open a shell in the tools container
	$(COMPOSE) run --rm tools bash

voice-bank: ## Generate missing or changed voice lines with Gemini TTS (ARGS="--dry-run" to preview cost)
	$(COMPOSE) --profile media run --rm --build media pnpm voice-bank $(ARGS)

textures: ## Fetch the CC0 surface textures from Poly Haven (verified, downsized to WebP)
	$(COMPOSE) --profile media run --rm --build media pnpm textures $(ARGS)

lint: ## Run ESLint
	$(COMPOSE) run --rm --no-deps tools pnpm lint

typecheck: ## Run the TypeScript compiler on every package
	$(COMPOSE) run --rm --no-deps tools pnpm typecheck

test-unit: ## Run unit tests
	$(COMPOSE) run --rm --no-deps tools pnpm test:unit

test-integration: ## Run integration tests against the disposable test database
	$(COMPOSE) run --rm tools pnpm test:integration

test: ## Run unit and integration tests
	$(COMPOSE) run --rm test

e2e: ## Run browser tests against the dev server (starts the stack if needed)
	$(COMPOSE) --profile e2e run --rm e2e

e2e-prod: ## Run browser tests against the production-like build
	$(COMPOSE) --profile prod --profile e2e-prod run --rm e2e-prod

check: lint typecheck test ## Lint, typecheck and test

scan-bundle: build ## Build, then scan the browser bundle for server secrets (prints names only)
	$(COMPOSE) run --rm --no-deps tools npx tsx tools/security/scan-bundle.ts

audit: ## Check dependencies for known vulnerabilities
	$(COMPOSE) run --rm --no-deps tools pnpm audit --prod

build: ## Build the production Next.js bundle in the tools container
	$(COMPOSE) run --rm --no-deps tools pnpm build

prod: ## Build and start the production-like image on http://localhost:3001
	$(COMPOSE) --profile prod up -d --build --wait app-prod
	@echo "Production-like build is running at http://localhost:3001"

prod-down: ## Stop the production-like container
	$(COMPOSE) --profile prod stop app-prod

rebuild: ## Rebuild images from scratch (no cache)
	$(COMPOSE) --profile prod build --no-cache

reset: ## DANGER: delete all local data (database and dependency volumes)
	@printf "This permanently deletes the local database and cached dependencies. Type 'reset' to continue: "; \
	read answer; \
	if [ "$$answer" = "reset" ]; then $(COMPOSE) --profile prod --profile e2e down -v --remove-orphans; echo "Local data deleted."; else echo "Aborted."; fi
