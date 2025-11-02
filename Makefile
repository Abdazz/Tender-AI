.PHONY: help install install-dev lint format test type-check up down logs migrate revision run-once build-report test-email up-deps clean

# Default target
help: ## Show this help message
	@echo "TenderAI BF - Makefile Commands"
	@echo "================================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development
install: ## Install dependencies with Poetry
	poetry install

install-dev: ## Install all dependencies including dev extras
	poetry install --extras "full" --with dev

lint: ## Run linting with ruff
	poetry run ruff check src tests
	poetry run ruff format --check src tests

format: ## Format code with ruff
	poetry run ruff format src tests
	poetry run ruff check --fix src tests

type-check: ## Run type checking with mypy
	poetry run mypy src/tenderai_bf

test: ## Run unit tests
	poetry run pytest tests/ -v

test-cov: ## Run tests with coverage
	poetry run pytest tests/ --cov=tenderai_bf --cov-report=html --cov-report=term

test-smoke: ## Run smoke tests only
	poetry run pytest tests/test_smoke.py -v

# Docker Operations
up: ## Start all services with docker-compose
	docker-compose up -d

down: ## Stop all services
	docker-compose down

logs: ## Show logs from all services
	docker-compose logs -f

logs-api: ## Show API service logs
	docker-compose logs -f api

logs-ui: ## Show UI service logs
	docker-compose logs -f ui

logs-worker: ## Show worker service logs
	docker-compose logs -f worker

up-deps: ## Start only database and storage dependencies
	docker-compose up -d postgres minio createbuckets

restart: ## Restart all services
	docker-compose restart

rebuild: ## Rebuild and restart services
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d

# Database Operations
migrate: ## Apply database migrations
	poetry run alembic upgrade head

migrate-docker: ## Apply migrations using docker
	docker-compose exec api alembic upgrade head

revision: ## Create new migration
	@read -p "Enter migration message: " message; \
	poetry run alembic revision --autogenerate -m "$$message"

revision-docker: ## Create new migration using docker
	@read -p "Enter migration message: " message; \
	docker-compose exec api alembic revision --autogenerate -m "$$message"

reset-db: ## Reset database (WARNING: destroys data)
	@echo "WARNING: This will destroy all data. Are you sure? [y/N]" && read ans && [ $${ans:-N} = y ]
	docker-compose down -v
	docker-compose up -d postgres
	sleep 5
	$(MAKE) migrate

# Pipeline Operations
run-once: ## Execute pipeline once
	poetry run python -m tenderai_bf.cli run-once

run-once-docker: ## Execute pipeline once using docker
	docker-compose exec api python -m tenderai_bf.cli run-once

build-report: ## Generate report only
	poetry run python -m tenderai_bf.cli build-report

test-email: ## Test email configuration
	poetry run python -m tenderai_bf.cli test-email

init-db: ## Initialize database schema
	poetry run python -m tenderai_bf.cli init-db

# UI Operations
ui: ## Start Gradio UI locally
	poetry run python -m tenderai_bf.ui.app

scheduler: ## Start scheduler daemon
	poetry run python -m tenderai_bf.scheduler.schedule

# Monitoring & Health
health: ## Check service health
	@echo "Checking service health..."
	@curl -f http://localhost:8000/health || echo "API not responding"
	@curl -f http://localhost:7860 || echo "UI not responding"

ps: ## Show running containers
	docker-compose ps

stats: ## Show container statistics
	docker stats

# Cleanup
clean: ## Clean up temporary files and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -name "*.pyo" -delete 2>/dev/null || true
	find . -name "*~" -delete 2>/dev/null || true

clean-docker: ## Clean up Docker resources
	docker-compose down -v --remove-orphans
	docker system prune -f
	docker volume prune -f

clean-all: clean clean-docker ## Clean everything

# Backup & Restore
backup: ## Backup database
	@timestamp=$$(date +%Y%m%d_%H%M%S); \
	docker-compose exec postgres pg_dump -U tenderai tenderai_bf > backup_$$timestamp.sql; \
	echo "Backup created: backup_$$timestamp.sql"

backup-minio: ## Backup MinIO data
	@timestamp=$$(date +%Y%m%d_%H%M%S); \
	docker run --rm -v rfp-watch-ai_minio-data:/data -v $(PWD):/backup alpine tar czf /backup/minio_backup_$$timestamp.tar.gz -C /data .; \
	echo "MinIO backup created: minio_backup_$$timestamp.tar.gz"

# Security
scan: ## Run security scans
	poetry run bandit -r src/
	docker run --rm -v $(PWD):/app -w /app clair-scanner --local-ip=host.docker.internal tenderai-bf:latest || true

# Development Utilities
shell: ## Open shell in API container
	docker-compose exec api bash

shell-db: ## Open database shell
	docker-compose exec postgres psql -U tenderai -d tenderai_bf

shell-minio: ## Open MinIO shell
	docker-compose exec minio bash

install-hooks: ## Install pre-commit hooks
	poetry run pre-commit install

update-deps: ## Update dependencies
	poetry update

# Documentation
docs: ## Generate documentation
	@echo "Documentation generation not yet implemented"

# Release
version: ## Show current version
	@poetry version

version-bump: ## Bump version (usage: make version-bump PART=patch|minor|major)
	poetry version $(PART)
	@echo "Version bumped to $$(poetry version -s)"

# Environment setup
setup: install-dev up-deps migrate ## Complete development setup
	@echo "Development environment setup complete!"
	@echo "Run 'make up' to start all services"
	@echo "Run 'make ui' to start the Gradio interface"

# Quick development cycle
dev: format lint test ## Run development checks (format, lint, test)

# Continuous Integration targets
ci: lint type-check test ## Run CI checks

# Production deployment preparation
prod-check: ## Check production readiness
	@echo "Checking production readiness..."
	@test -f .env || (echo "ERROR: .env file missing" && exit 1)
	@grep -q "DEBUG=false" .env || (echo "WARNING: DEBUG should be false in production" && exit 1)
	@grep -q "ENVIRONMENT=production" .env || (echo "WARNING: ENVIRONMENT should be production" && exit 1)
	@echo "Production checks passed"