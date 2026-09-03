# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TenderAI is a multi-agent RFP/tender harvester, multi-company/multi-tenant and multi-country. It autonomously scrapes procurement portals, classifies opportunities using AI, deduplicates them, generates French-language DOCX reports, and delivers them via email. Stack: Python 3.11+, LangGraph, FastAPI, Next.js (React frontend), PostgreSQL, MinIO, APScheduler.

## Git workflow (mandatory)

Every repo in this project (this monorepo, and each repo produced by the repo-split effort — `tenderai-backend`, `tenderai-frontend`, `tenderai-infra`) **must have a `staging` branch**. All work lands on `staging` first — where it gets deployed and exercised as a real test — and only moves to `main` after that validation passes. Never merge or push feature work directly to `main`; `main` only receives already-validated work promoted from `staging`.

See `docs/PROJECT_STATUS.md` for the current state of each chantier and which repos still need a `staging` branch created.

## Commands

```bash
# Install
poetry install                   # base deps
poetry install --extras "full" --with dev  # all extras + dev tools

# Development checks
make lint                        # ruff check + format --check
make format                      # ruff format + ruff check --fix
make type-check                  # mypy src/tenderai_bf
make test                        # pytest tests/ -v
make test-cov                    # with HTML coverage report
make dev                         # format + lint + test in sequence

# Run specific test file
poetry run pytest tests/test_smoke.py -v
poetry run pytest tests/nodes/test_classify.py -v
# Skip slow/integration tests
poetry run pytest tests/ -m "not slow and not integration"

# Local services (deps only)
make up-deps                     # starts postgres, minio, createbuckets
make migrate                     # alembic upgrade head
make revision                    # interactive: create new migration

# Run the pipeline
make run-once                    # execute full pipeline once
poetry run tenderai run-once     # same via CLI entry point
make test-email                  # verify SMTP config

# Start services
poetry run uvicorn tenderai_bf.api.main:app --reload --port 8000
make scheduler                   # APScheduler daemon

# Docker
make up                          # all services
make down
make logs-api / logs-worker
make rebuild                     # down + build --no-cache + up
```

## Architecture

### Layer structure

```
Next.js frontend (:3000) → FastAPI (:8000)
       ↓
LangGraph pipeline (agents/graph.py)
       ↓
PostgreSQL (metadata) + MinIO (files) + SMTP (delivery)
```

### LangGraph pipeline (`agents/graph.py`)

The pipeline is a `StateGraph[TenderAIState]` (a Pydantic model). Every edge uses `_route_after_step` to short-circuit to `error_handler` whenever `error_occurred=True` or `should_continue=False`. Non-fatal issues (e.g., transient SMTP failure after the report was already uploaded) are recorded as `warnings` and produce `completed_with_warnings` status rather than `failed`.

**Node sequence:**
```
load_sources → fetch_listings → extract_item_links → fetch_items
→ parse_extract → classify → deduplicate → summarize
→ compose_report → email_report
```

Each node lives in `agents/nodes/<name>.py` and receives/returns `TenderAIState`. The global singleton `get_pipeline()` is thread-safe (double-checked locking).

### Configuration (`config.py` + `settings.yaml`)

`Settings` is a Pydantic `BaseSettings` that loads `.env` first, then overlays values from `settings.yaml` (which supports `${VAR:-default}` env-var substitution). Security validation runs in `__init__`—`TENDERAI_JWT_SECRET` (≥32 chars) and `TENDERAI_ADMIN_PASSWORD` (≥8 chars, not trivially weak) are required in **all** environments; the app refuses to start without them.

Tests must pre-set these env vars before importing config—see `tests/conftest.py`.

### Key subsystems

| Module | Purpose |
|---|---|
| `agents/nodes/` | One file per pipeline step; source-specific fetchers: `fetch_bceao.py`, `fetch_joffres.py`, `fetch_quotidien.py`, `fetch_ungm.py` |
| `agents/nodes/classify.py` | Hybrid rules+LLM classification; controlled by `processing.use_llm_classification` and `processing.min_relevance_score` |
| `agents/nodes/deduplicate.py` | Configurable strategy via `processing.deduplication_method`: `hash_only`, `similarity_only`, `hash_similarity`, `llm_only`, `hybrid` |
| `agents/nodes/parse_pdf_rag.py` / `vector_store.py` | RAG pipeline using ChromaDB + sentence-transformers for PDF tender extraction |
| `api/main.py` | FastAPI app; JWT auth via `TENDERAI_JWT_SECRET`; routers under `/api/v1/` |
| `scheduler/schedule.py` | APScheduler daemon (default cron: `0 7 * * *` Africa/Ouagadougou) |
| `report/docx_report.py` | Generates branded `.docx` report uploaded to MinIO |
| `storage/minio_client.py` | S3-compatible MinIO wrapper |
| `email/smtp_client.py` | SMTP delivery with TLS |

### Data models (`models.py`)

Four SQLAlchemy tables: `Source` (portals to monitor), `Run` (pipeline execution record), `Notice` (individual tender; tracks `is_relevant`, `is_duplicate`, `content_hash`, `relevance_score`, `classification_method`), `File` (PDFs/docs stored in MinIO).

Run statuses: `running` → `completed` / `completed_with_warnings` / `failed`.

### LLM providers

Configured via `LLM_PROVIDER` env var or `settings.yaml`. Supported: `groq` (default model: `llama-3.3-70b-versatile`), `openai`, `ollama`. Provider/model can be switched without code changes.

## Environment setup

Required env vars (must be non-trivial):
- `TENDERAI_JWT_SECRET` — generate with `openssl rand -hex 32`
- `TENDERAI_ADMIN_PASSWORD` — at least 8 chars
- `DATABASE_URL` — PostgreSQL connection string
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `LLM_PROVIDER` + corresponding API key (`GROQ_API_KEY`, `OPENAI_API_KEY`, or `OLLAMA_BASE_URL`)

Copy `.env.example` to `.env` and fill in values before any `make` command.

## Testing notes

- `pyproject.toml` configures pytest to enforce `--cov-fail-under=80`; running `pytest` without arguments includes coverage. To skip coverage: `poetry run pytest tests/ -v --no-cov`.
- Tests use SQLite (`sqlite:///test.db`) not PostgreSQL; `conftest.py` sets required env vars before any import of `tenderai_bf`.
- Node-level tests in `tests/nodes/` can run individually and have their own `README.md` / `QUICKSTART.md`.
- Mark slow or network-dependent tests with `@pytest.mark.slow` or `@pytest.mark.integration`.
