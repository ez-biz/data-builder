# Data Builder

A visual ETL pipeline platform for building data workflows with drag-and-drop. Connect to databases, browse table catalogs, and create pipelines — no code required.

## Features

- **Database Connectors** — Connect to PostgreSQL and Databricks with Fernet-encrypted credential storage
- **Catalog Browser** — Browse schemas, tables, and columns; preview rows on demand
- **Visual Pipeline Builder** — Drag-and-drop canvas with 6 node types:
  - **Source** — Read from a database table
  - **Filter** — Apply WHERE conditions
  - **Transform** — Rename, cast, or compute columns
  - **Join** — Inner, left, right, full, or cross joins
  - **Aggregate** — GROUP BY with SUM, COUNT, AVG, MIN, MAX
  - **Destination** — Write to a target table (`append` / `overwrite`)
- **Pipeline Validation** — DAG cycle detection, handle validation, connectivity checks
- **Distributed Execution** — Celery workers pull jobs from Redis; scale horizontally
- **Run Control** — Trigger runs, cancel in-flight runs (SIGTERM revoke), retry failed runs
- **Scheduled Runs** — Attach a cron expression to any pipeline; a polling scheduler dispatches due jobs
- **CDC Streams (poll-based)** — Track a monotonically-increasing column, write new rows to S3 in JSONL or CSV with exponential-backoff auto-retry on transient DB errors
- **Monitoring** — Run history with status, duration, rows; aggregated stats dashboard; exportable logs (JSON/CSV); webhook notifications with HMAC signing
- **Auto-save** — Debounced save (3s) preserves canvas state
- **Workbench UI** — Dark sidebar + light work area + dot-grid canvas; Emerald primary accent; Inter + JetBrains Mono typography; fully keyboard-accessible

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Vite)               │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │ Sidebar  │ │ React Flow   │ │ Config Panel    │  │
│  │ Catalog  │ │ Canvas       │ │ / Run History   │  │
│  │ Browser  │ │ (drag/drop)  │ │                 │  │
│  └──────────┘ └──────────────┘ └─────────────────┘  │
│   Zustand (canvas)  TanStack Query (server state)   │
│   shadcn/Radix primitives · Workbench design system │
└───────────────────────┬─────────────────────────────┘
                        │ REST API
┌───────────────────────┴─────────────────────────────┐
│  Backend (FastAPI) — stateless API server           │
│  ┌────────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │ Connectors │ │ Catalog  │ │ Pipeline CRUD +    │ │
│  │ (PG, DBX)  │ │ Service  │ │ Validation + Runs  │ │
│  └────────────┘ └──────────┘ └────────────────────┘ │
│  Scheduler thread (cron poll) · Notification webhook│
└────────┬──────────────────────┬─────────────────────┘
         │                      │ dispatch via Redis
         │                      ▼
         │          ┌─────────────────────────────┐
         │          │ Celery worker(s)            │
         │          │ pipeline.run · cdc.sync     │
         │          │ (retry + SIGTERM revoke)    │
         │          └──────────┬──────────────────┘
         ▼                     ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────┐
  │ PostgreSQL 16│    │  Redis 7     │    │ S3 (CDC) │
  │ app metadata │    │  broker+back │    │ output   │
  └──────────────┘    └──────────────┘    └──────────┘
```

## Tech Stack

| Layer     | Technology                                                            |
|-----------|-----------------------------------------------------------------------|
| Frontend  | React 19, TypeScript, Vite, Tailwind 4, React Flow 12                 |
| State     | Zustand (canvas), TanStack Query (server)                             |
| UI        | shadcn/Radix primitives, Lucide icons, Inter + JetBrains Mono         |
| Design    | Workbench tokens (Emerald #059669); custom primitives — `DataTable`, `StatCard`, `EmptyState`, `PageHeader`, `Badge` variants |
| Backend   | Python, FastAPI, SQLAlchemy 2.0, Alembic, psycopg2                    |
| Tasking   | Celery 5 + Redis broker; retry policy on transient DB errors          |
| Database  | PostgreSQL 16 (metadata), Redis 7 (broker + cache)                    |
| Object    | AWS S3 via boto3 (CDC destination)                                    |
| Security  | Fernet encryption (credentials), HMAC-SHA256 webhook signing          |

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

### 4. Celery worker (for actual pipeline execution)

```bash
cd backend
source .venv/bin/activate
celery -A app.celery_app worker --loglevel=info --concurrency=4
```

Without the worker, runs dispatch but stay in `pending`. Docker Compose starts one automatically.

### Full Docker (alternative)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Brings up: `postgres`, `redis`, `backend` (FastAPI + scheduler), `worker` (Celery), `frontend`.

## Development

```bash
# Run backend tests (112 tests)
cd backend && source .venv/bin/activate && pytest -v

# Build frontend (tsc + vite)
cd frontend && pnpm run build

# All-in-one dev (requires docker for PG/Redis)
make dev
```

### Design docs

Completed and upcoming work is captured under `docs/superpowers/`:

- `specs/2026-04-18-ui-ux-revamp-design.md` — Workbench design spec
- `plans/2026-04-18-ui-ux-revamp.md` — implementation plan (31 tasks)

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

| Method | Endpoint                                                   | Description                        |
|--------|------------------------------------------------------------|------------------------------------|
| GET    | `/api/health`                                              | Health check                       |
| CRUD   | `/api/connectors`                                          | Manage connectors                  |
| POST   | `/api/connectors/{id}/test`                                | Test connection                    |
| GET    | `/api/catalog/{id}/schemas`                                | List schemas                       |
| GET    | `/api/catalog/{id}/schemas/{s}/tables`                     | List tables                        |
| GET    | `/api/catalog/{id}/schemas/{s}/tables/{t}/columns`         | List columns                       |
| GET    | `/api/catalog/{id}/schemas/{s}/tables/{t}/preview`         | Preview data                       |
| CRUD   | `/api/pipelines`                                           | Manage pipelines                   |
| POST   | `/api/pipelines/{id}/validate`                             | Validate pipeline                  |
| POST   | `/api/pipelines/{id}/run`                                  | Dispatch a run via Celery          |
| GET    | `/api/pipelines/{id}/runs`                                 | List recent runs                   |
| POST   | `/api/pipelines/{id}/runs/{rid}/retry`                     | Retry a failed/cancelled run       |
| POST   | `/api/pipelines/{id}/runs/{rid}/cancel`                    | Revoke an in-flight Celery task    |
| CRUD   | `/api/cdc/jobs`                                            | Manage CDC jobs                    |
| POST   | `/api/cdc/jobs/{id}/sync`                                  | Trigger an incremental CDC sync    |
| POST   | `/api/cdc/jobs/{id}/snapshot`                              | Trigger a full snapshot CDC sync   |
| POST   | `/api/cdc/jobs/{id}/start`                                 | Start the long-running watcher     |
| POST   | `/api/cdc/jobs/{id}/stop`                                  | Stop (cancel) the watcher          |
| GET    | `/api/cdc/jobs/{id}/logs`                                  | List CDC sync logs                 |
| GET    | `/api/monitoring/stats?days=N`                             | Aggregated run + CDC stats         |
| POST   | `/api/monitoring/export/webhook`                           | Push logs to a webhook endpoint    |

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

- [x] **Phase 1** — Foundation: connectors, catalog, visual canvas, validation, auto-save
- [x] **Phase 2a** — Distributed execution engine via Celery + Redis (cancel + retry); cron scheduling; webhook notifications
- [x] **Phase 2b** — Workbench UI revamp (Emerald + Balanced density; `DataTable`, `StatCard`, `EmptyState`, `PageHeader`)
- [x] **Phase 3a** — Poll-based CDC (tracking-column → S3 JSONL/CSV) with transient-error retry
- [x] **Phase 3a.1** — CDC v2 foundation: `CDCKind` discriminator, event-log JSONL schema, `cdc.watch` long-running watcher pattern, start/stop endpoints; unblocks 3b and 3c
- [ ] **Phase 2c** — SQL pushdown (execute as SQL instead of in-memory Python; unlocks >100k-row datasets)
- [ ] **Phase 3b** — WAL-based CDC for PostgreSQL (logical replication; captures deletes, no row-miss window)
- [ ] **Phase 3c** — MongoDB support: new `MongoConnector` + CDC via Change Streams (native `resume_token`, captures insert/update/replace/delete)
- [ ] **Phase 4**  — Text2SQL (natural-language → pipeline definition via LLM tool-use)
- [ ] **UI-follow-ups** — dark mode toggle, command palette (⌘K), Playwright visual-regression suite

Detailed scoping, sequencing rationale, and prerequisites for each open phase live in [`docs/superpowers/roadmap.md`](./docs/superpowers/roadmap.md).

## Security

- Connector credentials are encrypted at rest using Fernet symmetric encryption
- SQL identifiers are validated against `[a-zA-Z_][a-zA-Z0-9_]*` pattern
- PostgreSQL queries use parameterized queries via psycopg2
- CORS is restricted to configured origins
- Production deployment should use a strong `SECRET_KEY` (warns on weak defaults)

## License

Data Builder is **proprietary software** — Copyright © 2026 Anchit Gupta. All rights reserved.

**Any use, copy, modification, redistribution, or monetization requires prior written permission from the author.** The fact that the source is visible in this repository does not, by itself, grant any right to use it.

What is permitted without asking:

- Viewing the source on the authorized GitHub repository
- Quoting short excerpts in technical discussion (with attribution)
- Forking on GitHub solely to propose a pull request back to this repo

What requires explicit permission:

- Running the software for any personal, internal, educational, research, non-profit, or commercial purpose
- Hosting or serving functionality from the software to any third party
- Modifying, adapting, translating, or creating derivative works
- Redistributing, sublicensing, selling, or bundling the software
- Monetizing the software or any derivative (right expressly reserved to the author)
- Using any distinctive name, logo, or visual identity associated with the software

Any permitted use must include visible attribution:

> "Data Builder by Anchit Gupta — used with permission.
> Source: https://github.com/ez-biz/data-builder"

**Requesting permission:** email **anchitgupt2012@gmail.com** with the intended use, scope, duration, whether monetary consideration is involved, and the attribution you plan to display. Full terms: [`LICENSE`](./LICENSE).
