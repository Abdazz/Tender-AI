# TenderAI BF - Multi-Agent RFP Harvester for Burkina Faso

A production-grade system that autonomously monitors and harvests RFP/tender opportunities in IT/Engineering domains across Burkina Faso. Built with LangChain, LangGraph, Gradio, PostgreSQL, and MinIO.

## Features

- **Daily Automated Harvesting**: Monitors public procurement sources at 07:30 Africa/Ouagadougou
- **AI-Powered Classification**: Hybrid rules + ML model for IT/Engineering relevance
- **Multi-Source Support**: Configurable sources with rate limiting and robots.txt compliance
- **OCR & PDF Processing**: Advanced PDF extraction with Docling OCR for image-based documents
- **Smart Deduplication**: Content-based deduplication across multiple sources
- **Professional Reports**: Generates branded .docx reports with executive summaries
- **Email Distribution**: Automated SMTP delivery with configurable recipients
- **Admin Dashboard**: Gradio-based UI for monitoring, configuration, and manual runs
- **Audit Trail**: Complete provenance tracking and run history

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+**
- **Docker & Docker Compose** (recommended)
- **PostgreSQL 16+** (if running locally)
- **MinIO or S3** (for file storage)
- **LLM API Key** (Groq, OpenAI, or compatible)

### Installation

#### Option 1: Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/your-org/tenderai-bf.git
cd tenderai-bf

# Configure environment
cp .env.example .env
# Edit .env with your credentials (API keys, SMTP, etc.)

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access services:
# - FastAPI: http://localhost:8000
# - FastAPI Docs: http://localhost:8000/docs
# - Gradio UI: http://localhost:7860
# - MinIO Console: http://localhost:9001
```

#### Option 2: Local Development

```bash
# Install Poetry
curl -sSL https://install.python-poetry.org | python3 -

# Install dependencies
poetry install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start PostgreSQL and MinIO (via Docker)
docker-compose up -d postgres minio

# Run database migrations
poetry run alembic upgrade head

# Start FastAPI backend
poetry run uvicorn tenderai_bf.api.main:app --reload --port 8000

# Start Gradio UI (in another terminal)
poetry run python -m tenderai_bf.ui.app

# Or use the CLI
poetry run tenderai run-once
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost/tenderai` |
| `MINIO_ENDPOINT` | MinIO S3-compatible endpoint | `localhost:9000` |
| `MINIO_ACCESS_KEY` | MinIO access key | `minioadmin` |
| `MINIO_SECRET_KEY` | MinIO secret key | `minioadmin123` |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | `` |
| `SMTP_PASSWORD` | SMTP password | `` |
| `GROQ_API_KEY` | Groq LLM API key | `` |
| `OPENAI_API_KEY` | OpenAI API key (alternative) | `` |
| `LOG_LEVEL` | Logging level | `INFO` |

### Settings Configuration

Edit `settings.yaml` to configure:
- Cron schedule
- Source definitions
- Rate limits
- Email templates
- OCR settings
- Provider selection (Groq/OpenAI)

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend Layer                        │
│  ┌──────────────────┐      ┌─────────────────────────┐  │
│  │  Gradio Web UI   │◄────►│  External Clients       │  │
│  │  (Port 7860)     │      │  (Mobile, API, etc.)    │  │
│  └──────────────────┘      └─────────────────────────┘  │
└────────────┬──────────────────────────┬──────────────────┘
             │                          │
             │        HTTP REST         │
             ▼                          ▼
┌────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Port 8000)              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  REST API Layer                                      │ │
│  │  • /api/v1/runs - Pipeline execution                 │ │
│  │  • /api/v1/sources - Source management               │ │
│  │  • /api/v1/reports - Report generation               │ │
│  │  • /api/v1/admin - Authentication & settings         │ │
│  │  • /health - Health checks & monitoring              │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Authentication Layer (JWT)                          │ │
│  │  • OAuth2 password bearer                            │ │
│  │  • Token-based auth for API access                   │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│              Business Logic Layer                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  LangGraph Multi-Agent Pipeline                      │ │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐     │ │
│  │  │ Fetch  │→│Extract │→│Classify│→│ Report │     │ │
│  │  │Sources │  │  Data  │  │& Filter│  │Generate│     │ │
│  │  └────────┘  └────────┘  └────────┘  └────────┘     │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│                   Data Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL  │  │  MinIO S3    │  │  SMTP Email     │  │
│  │  (Metadata)  │  │  (Files)     │  │  (Delivery)     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### LangGraph Pipeline

```
LoadSources → FetchListings → ExtractItemLinks → FetchItems 
    ↓
ParseExtract → Classify → Deduplicate → Summarize 
    ↓
ComposeReport → EmailReport
```

## Available Commands

```bash
# Development
make lint              # Run ruff linting
make format            # Format code with black/ruff
make test              # Run unit tests
make type-check        # Run mypy type checking

# Docker Operations
make up                # Start all services
make down              # Stop all services
make logs              # View logs
make up-deps           # Start dependencies only

# Database
make migrate           # Apply migrations
make revision          # Create new migration

# Pipeline Operations
make run-once          # Execute pipeline once
make build-report      # Generate report only
make test-email        # Test email configuration
```

## Project Structure

```
rfp-watch-ai/
├── src/tenderai_bf/           # Main package
│   ├── config.py              # Pydantic settings
│   ├── db.py                  # SQLAlchemy setup
│   ├── models.py              # ORM models
│   ├── schemas.py             # Pydantic DTOs
│   ├── agents/                # LangGraph orchestration
│   │   ├── graph.py           # Main graph definition
│   │   └── nodes/             # Individual agent nodes
│   ├── storage/               # MinIO S3 client
│   ├── email/                 # SMTP utilities
│   ├── report/                # DOCX generation
│   ├── scheduler/             # APScheduler setup
│   ├── ui/                    # Gradio dashboard
│   ├── utils/                 # Utilities (dates, PDF, robots)
│   └── cli.py                 # Command-line interface
├── infra/                     # Infrastructure
│   ├── docker-compose.yml     # Service orchestration
│   ├── Dockerfile.api         # API/orchestrator image
│   ├── Dockerfile.ui          # UI image
│   └── Dockerfile.worker      # Worker image
├── alembic/                   # Database migrations
├── tests/                     # Test suite
├── settings.yaml              # Application configuration
└── pyproject.toml             # Dependencies & build config
```

## Testing

```bash
# Run all tests
make test

# Run specific test categories
pytest tests/test_smoke.py      # Smoke tests
pytest tests/test_dates.py      # Date utilities
pytest tests/test_report.py     # Report generation

# Integration tests (requires running services)
pytest tests/integration/
```

## Monitoring & Observability

- **Structured Logging**: JSON logs via structlog
- **Metrics**: Prometheus-compatible metrics
- **Health Checks**: Docker health checks for all services
- **Audit Trail**: Complete run history with provenance tracking

## Security

- **Secrets Management**: Environment variables + Docker secrets
- **SMTP Security**: TLS encryption enforced
- **Database**: Connection encryption and credential rotation
- **Rate Limiting**: Respectful crawling with robots.txt compliance
- **Input Validation**: Pydantic models throughout

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run `make lint && make test`
5. Submit a pull request

## Support

For technical issues:
- Check logs: `make logs`
- Review configuration: `settings.yaml` and `.env`
- Test components individually using CLI commands

For operational support, contact the YULCOM DevOps team.

## License

Internal YULCOM Technologies project. All rights reserved.