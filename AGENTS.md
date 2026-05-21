# AGENTS.md

Compact ramp-up guide for AI agents working in this repo.
Existing instruction file: `CLAUDE.md` (more verbose; check it for subsystem tables).

---

## Stack

Python 3.11+, LangGraph, FastAPI, Next.js frontend, Gradio (legacy UI), PostgreSQL, MinIO (S3), ChromaDB, APScheduler.

Source package: `src/tenderai_bf/` (flat, one file/dir per subsystem).
CLI entry point: `tenderai_bf.cli:main` → `tenderai` script.

---

## Key commands

```bash
# Install everything (dev + all optional extras)
poetry install --extras "full" --with dev

# One-shot dev cycle
make dev          # format → lint → test
make ci           # lint → type-check → test  (CI order, no auto-format)

# Individual checks
make format       # ruff format + ruff check --fix
make lint         # ruff check + format --check (read-only)
make type-check   # mypy src/tenderai_bf
make test         # pytest tests/ -v  (includes coverage, fails under 80%)

# Skip coverage threshold (faster iteration)
poetry run pytest tests/ -v --no-cov

# Run a single node test file
poetry run pytest tests/nodes/test_classify.py -v

# Skip slow/network tests
poetry run pytest tests/ -m "not slow and not integration" --no-cov

# Local infra (postgres + minio + createbuckets only)
make up-deps
make migrate      # alembic upgrade head (required after up-deps)

# Full pipeline run (local)
make run-once

# Start services individually
poetry run uvicorn tenderai_bf.api.main:app --reload --port 8000
poetry run python -m tenderai_bf.ui.app   # Gradio UI :7860
make scheduler                             # APScheduler daemon
```

---

## Testing quirks

- `pytest` **always** runs coverage and enforces `--cov-fail-under=80`. Use `--no-cov` to bypass locally.
- Tests use **SQLite** (`sqlite:///test.db`), never PostgreSQL.
- `conftest.py` must set security env vars **before any import of `tenderai_bf`** — it does this via `os.environ.setdefault`. Do not import config at module level in test files before conftest runs.
- Required vars pre-set in conftest: `TENDERAI_JWT_SECRET` (≥32 non-trivial chars), `TENDERAI_ADMIN_PASSWORD` (≥8 chars, not in blocklist). Missing or weak values cause `ValueError` at Settings init, aborting the test run.
- `tests/nodes/` tests can run independently; see `tests/nodes/QUICKSTART.md`.

---

## Configuration

Settings load in this order: `.env` → `settings.yaml` (`${VAR:-default}` substitution) → env-var overrides per nested class prefix.

Key env vars and where they map:
| Env var | Where used |
|---|---|
| `TENDERAI_JWT_SECRET` | `settings.monitoring.jwt_secret_key` (via `settings.yaml`) |
| `TENDERAI_ADMIN_PASSWORD` | `settings.security.admin_password` |
| `TENDERAI_DATABASE_URL` | `settings.yaml` → `settings.database.url` |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | `MinIOSettings` (prefix `MINIO_`) |
| `LLM_PROVIDER` | `settings.llm.provider` |
| `GROQ_API_KEY` / `OPENAI_API_KEY` / `OLLAMA_BASE_URL` | LLM auth |
| `TENDERAI_CHROMA_DIR` | ChromaDB persist path (default `/app/data/chroma_db`) |
| `MIN_RELEVANCE_SCORE` | read via `settings.yaml` expansion |

`settings.yaml` is **live config**, not a template — it is volume-mounted into Docker containers.

`settings.environment` must be one of `development`, `staging`, `production` (validated at boot). Tests rely on the field defaulting to `development`.

---

## Pipeline / LangGraph

`StateGraph[TenderAIState]` in `agents/graph.py`. Singleton access via `get_pipeline()` (thread-safe double-checked locking).

Node sequence:
```
load_sources → fetch_listings → extract_item_links → fetch_items
→ parse_extract → classify → deduplicate → summarize
→ compose_report → email_report
```

Every edge routes through `_route_after_step`: sets `error_occurred=True` → jump to `error_handler` and abort. Non-fatal issues go to `state.warnings` → final status `completed_with_warnings`.

Each node lives in `agents/nodes/<name>.py` and receives/returns `TenderAIState`.

Source-specific fetchers: `fetch_bceao.py`, `fetch_joffres.py`, `fetch_quotidien.py`, `fetch_ungm.py`.

---

## Migrations

```bash
make migrate           # alembic upgrade head
make revision          # interactive: prompts for message then autogenerates
```

Migrations must run before starting the API. In Docker deployments, the CI/CD workflow runs them via `docker compose run --no-deps --rm api alembic upgrade head` after postgres + minio are healthy.

---

## Docker

Dockerfiles live in `infra/Dockerfile.{api,frontend,worker,ui}`.

Services: `postgres`, `minio`, `createbuckets`, `api`, `frontend`, `worker`, `nginx`.
Optional: `prometheus`, `grafana` (use `--profile monitoring`).

**Postgres and MinIO ports are commented out in `docker-compose.yml`** — they are not exposed in production. Use `docker-compose.override.dev.yml` locally or expose via Nginx reverse proxy.

ChromaDB volume `chroma-data` is shared between `api` and `worker` containers, mounted at `/app/data/chroma_db`.

`api` and `worker` bind-mount `./src` for hot reload (no rebuild needed after code changes in dev).

**Production setup:**
```bash
cp docker-compose.override.prod.yml docker-compose.override.yml
# then: docker compose up -d
```

---

## CI/CD

- GitHub Actions: `.github/workflows/ci-cd.yml`
- Docker images pushed to `ghcr.io/{owner}/tenderai-bf-{api,frontend,worker}`
- Build triggered by: `v*` tag push, `[build]` in commit message, or manual `workflow_dispatch` with `skip_build=false`
- Deploy to production on push to `main`; staging on push to `develop`

---

## Linting / formatting

Two overlapping ruff configs exist: `ruff.toml` (canonical, has extra rule sets N, S, T20, SIM, RUF) and `pyproject.toml` (subset). `make lint` / `make format` invoke ruff against both `src` and `tests`.

Quote style: **double quotes** (enforced by ruff formatter).

`print()` is allowed (T201 ignored). `assert` is allowed in tests (S101 ignored).

---

## LLM providers

Switch without code changes via `LLM_PROVIDER` env var or `settings.yaml llm.provider`.
Supported: `groq` (default: `llama-3.3-70b-versatile`), `openai` (default: `gpt-4-turbo-preview`), `ollama` (default: `llama3.1` at `OLLAMA_BASE_URL`).

Prompts (extraction, classification, summarization, deduplication) are defined in `settings.yaml` under `prompts:` and are French-language.

---

## Data models

Four SQLAlchemy tables: `Source`, `Run`, `Notice`, `File`.
`Run` statuses: `running` → `completed` / `completed_with_warnings` / `failed`.
`Notice` tracks: `is_relevant`, `is_duplicate`, `content_hash`, `relevance_score`, `classification_method`.
