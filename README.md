# Data Builder

A visual ETL pipeline platform for building data workflows with drag-and-drop. Connect to databases, browse table catalogs, and create pipelines — no code required.

## Features

- **Database Connectors** — Connect to PostgreSQL and Databricks with encrypted credential storage
- **Catalog Browser** — Browse schemas, tables, and columns from connected databases
- **Visual Pipeline Builder** — Drag-and-drop canvas with 6 node types:
  - **Source** — Read from a database table
  - **Filter** — Apply WHERE conditions
  - **Transform** — Rename, cast, or compute columns
  - **Join** — Inner, left, right, full, or cross joins
  - **Aggregate** — GROUP BY with SUM, COUNT, AVG, MIN, MAX
  - **Destination** — Write to a target table
- **Pipeline Validation** — DAG cycle detection, handle validation, connectivity checks
- **Auto-save** — Debounced save (3s) preserves canvas state

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite)               │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ Sidebar  │ │ React Flow   │ │ Config Panel    │  │
│  │ Catalog  │ │ Canvas       │ │ (node editing)  │  │
│  │ Browser  │ │ (drag/drop)  │ │                 │  │
│  └──────────┘ └──────────────┘ └─────────────────┘  │
│       Zustand (canvas state)  TanStack Query (API)  │
└───────────────────────┬─────────────────────────────┘
                        │ REST API
┌───────────────────────┴─────────────────────────────┐
│  Backend (Python FastAPI)                           │
│  ┌────────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │ Connectors │ │ Catalog  │ │ Pipeline CRUD +    │ │
│  │ (PG, DBX)  │ │ Service  │ │ Validation Engine  │ │
│  └────────────┘ └──────────┘ └────────────────────┘ │
│       SQLAlchemy ORM    Fernet Encryption           │
└───────────────────────┬─────────────────────────────┘
                        │
          ┌─────────────┴────────────┐
          │  PostgreSQL 16           │
          │  (app metadata)          │
          └──────────────────────────┘
```

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 19, TypeScript, Vite, React Flow, TailwindCSS |
| State     | Zustand (canvas), TanStack Query (server)           |
| UI        | shadcn/ui components, Lucide icons                  |
| Backend   | Python, FastAPI, SQLAlchemy 2.0, Alembic            |
| Database  | PostgreSQL 16 (metadata), Redis 7 (cache)           |
| Security  | Fernet encryption (credentials), input validation   |

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+ with pnpm
- Docker & Docker Compose (for PostgreSQL and Redis)

### 1. Clone and start databases

```bash
git clone <repo-url> data-builder
cd data-builder
docker compose -f docker/docker-compose.yml up postgres redis -d
```

### 2. Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip setuptools
pip install -e ".[dev]"

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
pnpm install
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Full Docker (alternative)

```bash
docker compose -f docker/docker-compose.yml up --build
```

## Development

```bash
# Run backend tests (28 tests)
cd backend && source .venv/bin/activate && pytest -v

# Build frontend
cd frontend && pnpm run build

# All-in-one dev (requires docker for PG/Redis)
make dev
```

### Makefile commands

| Command           | Description                          |
|-------------------|--------------------------------------|
| `make setup`      | Install all dependencies             |
| `make dev`        | Start PG/Redis + backend + frontend  |
| `make docker-up`  | Start everything via Docker          |
| `make docker-down`| Stop Docker services                 |
| `make migrate`    | Run Alembic migrations               |
| `make test`       | Run all tests                        |

## API Endpoints

| Method | Endpoint                                              | Description          |
|--------|-------------------------------------------------------|----------------------|
| GET    | `/api/health`                                         | Health check         |
| CRUD   | `/api/connectors`                                     | Manage connectors    |
| POST   | `/api/connectors/{id}/test`                           | Test connection      |
| GET    | `/api/catalog/{id}/schemas`                           | List schemas         |
| GET    | `/api/catalog/{id}/schemas/{s}/tables`                | List tables          |
| GET    | `/api/catalog/{id}/schemas/{s}/tables/{t}/columns`    | List columns         |
| GET    | `/api/catalog/{id}/schemas/{s}/tables/{t}/preview`    | Preview data         |
| CRUD   | `/api/pipelines`                                      | Manage pipelines     |
| POST   | `/api/pipelines/{id}/validate`                        | Validate pipeline    |

Interactive docs at [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI).

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable         | Default                         | Description                     |
|------------------|---------------------------------|---------------------------------|
| `DATABASE_URL`   | `postgresql://...localhost:5432` | PostgreSQL connection string    |
| `REDIS_URL`      | `redis://localhost:6379/0`      | Redis connection string         |
| `SECRET_KEY`     | (weak default)                  | Encryption key — **change in prod** |
| `CORS_ORIGINS`   | `["http://localhost:5173"]`     | Allowed CORS origins            |
| `LOG_LEVEL`      | `DEBUG`                         | Python logging level            |

## Project Structure

```
data-builder/
├── backend/
│   ├── app/
│   │   ├── connectors/     # Database connector implementations
│   │   ├── core/           # Encryption, exceptions
│   │   ├── models/         # SQLAlchemy models (Connector, Pipeline)
│   │   ├── routers/        # FastAPI route handlers
│   │   ├── schemas/        # Pydantic request/response models
│   │   └── services/       # Business logic layer
│   ├── alembic/            # Database migrations
│   └── tests/              # pytest test suite
├── frontend/
│   └── src/
│       ├── api/            # React Query hooks
│       ├── components/
│       │   ├── layout/     # AppShell, Sidebar, Header
│       │   ├── pipeline/   # Canvas, nodes, config panel
│       │   ├── connectors/ # Connector forms
│       │   └── ui/         # Reusable UI primitives
│       ├── pages/          # Route page components
│       ├── stores/         # Zustand stores
│       └── types/          # TypeScript interfaces
├── docker/                 # Dockerfiles + compose
├── Makefile
└── .env.example
```

## Roadmap

- [x] Phase 1: Foundation — Connectors, catalog, visual canvas, drag & drop
- [ ] Phase 2: Execution engine — Celery workers, SQL generation, scheduling
- [ ] Phase 3: CDC — WAL-based change data capture (PostgreSQL → S3)
- [ ] Phase 4: Text2SQL — Natural language to SQL with LLM integration

## Security

- Connector credentials are encrypted at rest using Fernet symmetric encryption
- SQL identifiers are validated against `[a-zA-Z_][a-zA-Z0-9_]*` pattern
- PostgreSQL queries use parameterized queries via psycopg2
- CORS is restricted to configured origins
- Production deployment should use a strong `SECRET_KEY` (warns on weak defaults)
