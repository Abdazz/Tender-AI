# Improvements Roadmap

Tracking file for planned improvements to the TenderAI BF system.

**Statuses:** `planned` | `in progress` | `blocked` | `done`

---

## Feature Improvements

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 1 | [Multi-country pipeline support](#1-multi-country-pipeline-support) | ✅ `done` | |
| 2 | [Database-persisted configuration](#2-database-persisted-configuration) | ✅ `done` | |
| 3 | [Settings management module (admin dashboard)](#3-settings-management-module-admin-dashboard) | ✅ `done` | Depends on #2 |
| 4 | [Intégration Tavily comme parser web](#4-intégration-tavily-comme-parser-web) | ✅ `done` | Fetcher générique pour nouvelles sources web |

---

## Details

### 1. Multi-country pipeline support

**Status:** `done`

The pipeline is currently global (single instance, single set of sources). Add a first-class `Country` entity so that each country has its own set of tender sources, LLM prompts, scheduling configuration, and notification recipients. Running the pipeline for country X must be fully isolated from country Y — separate `Run` records, separate `Notice` tables (or a country FK), separate reports and email recipients.

**Scope includes:**
- `Country` model and migration (name, code, locale, active flag)
- Per-country `Source` association (sources already belong to a single country implicitly, make it explicit)
- Per-country pipeline configuration: prompts, relevance thresholds, schedule, email targets
- `get_pipeline(country)` factory that instantiates an isolated `StateGraph` per country
- Scheduler spawns one job per active country
- Admin API endpoints to manage countries and trigger per-country runs
- Frontend: country selector, per-country run history and notice list

**Open questions:**
- Share one LangGraph graph definition across countries (parameterized state) or instantiate separate graphs?
- How to handle sources that cover multiple countries (e.g. UNGM)?

---

### 2. Database-persisted configuration

**Status:** `done`

Today all configuration lives in `settings.yaml` and environment variables, requiring a file edit + service restart to change anything at runtime. Persist mutable operational settings (sources, prompts, schedules, relevance thresholds, email targets) in the database so they can be updated through the admin API without restarting services.

**Scope includes:**
- `Config` (or `Setting`) model: key/value or structured JSON per namespace (e.g. `llm`, `email`, `pipeline`)
- Admin API: GET/PUT endpoints to read and update settings at runtime
- In-process config reload: services poll or subscribe (e.g. cache TTL) for changes
- Migration / seeding: on first boot, seed DB from `settings.yaml` if the config table is empty

**Architectural decision — source of truth:**

| Option | Description | Trade-off |
|--------|-------------|-----------|
| A — YAML + DB overrides | YAML is the canonical default; DB stores only explicit overrides applied on top | Easy rollback; two sources of truth to keep mental model of |
| B — DB as sole source, YAML as seed | On first boot, seed DB from YAML; afterwards YAML is ignored | Clean runtime model; YAML becomes a one-time bootstrap artifact |

Option B is preferred: simpler at runtime, avoids silent divergence between file and DB.

**Open questions:**
- Which settings stay in env vars (secrets, infra URLs) vs. DB (operational/business settings)?
- How to propagate a DB change to the APScheduler daemon running in the `worker` container?

---

### 3. Settings management module (admin dashboard)

**Status:** `done`
**Depends on:** #2 (Database-persisted configuration)

Replace the current read-only JSON dump at `/settings` with a structured, editable settings UI. Settings are grouped by section with inline editing, validation, and save per section. Secrets and infrastructure URLs (database, MinIO, SMTP credentials) remain read-only in the UI — they are managed via environment variables only.

**Scope includes:**
- Sectioned layout (tabs or accordion): Pipeline, Scheduler, LLM, Email, Classification keywords, RAG
- Inline editing per field with type-appropriate inputs (text, number, toggle, tag list for keyword arrays)
- Per-section save with optimistic feedback and error display
- Read-only display for secret/infra fields with a clear visual distinction
- Backend: `PUT /api/v1/admin/settings/{section}` endpoints writing to the DB config store (from #2)
- Frontend proxy route in Next.js mirroring the existing `/api/proxy/` pattern
- On save, trigger a config reload signal so running services pick up changes without restart

**Open questions:**
- Which sections are safe to hot-reload vs. require a service restart (e.g. scheduler cron changes)?
- Should keyword lists (classification) have a dedicated tag-input component or a plain textarea?

---

### 4. Intégration Tavily comme parser web

**Status:** ✅ `done`

Les fetchers actuels (`fetch_bceao.py`, `fetch_joffres.py`, `fetch_quotidien.py`, etc.) sont tous des scrapers HTML custom, difficiles à maintenir et fragiles face aux changements de structure de page. Tavily est une API de recherche et d'extraction web conçue pour les agents LLM : elle retourne du contenu structuré, suit les liens, et gère le rendu JS sans configuration manuelle.

L'idée est de disposer d'un fetcher générique basé sur Tavily pour toute nouvelle source de type `web` ajoutée à l'avenir, sans avoir à écrire un scraper custom. Les fetchers existants (`fetch_bceao.py`, `fetch_joffres.py`, `fetch_quotidien.py`, `fetch_ungm.py`) sont conservés tels quels.

**Scope includes:**
- `fetch_tavily.py` : fetcher générique qui prend une URL de source, interroge Tavily (`/search` ou `/extract`), et retourne une liste normalisée de notices brutes compatibles avec `TenderAIState`
- Marquage des sources dans la DB avec un champ `fetcher_type` (ex. `custom`, `tavily`) pour que le pipeline sache quel fetcher instancier
- Paramétrage par source : profondeur de crawl, domaines autorisés, requête de recherche optionnelle
- Gestion de la clé API Tavily via env var `TAVILY_API_KEY`
- Tests d'intégration mockant l'API Tavily

**Open questions:**
- Tavily `/extract` (extraction ciblée d'URL) vs `/search` (recherche + extraction) : lequel utiliser selon le type de source ?
- Coût par requête Tavily : comment limiter les appels redondants (cache, dedup par URL) ?
