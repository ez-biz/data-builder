# Data Builder — Project Conventions

## Architecture

- **Monorepo**: `backend/` (Python FastAPI) + `frontend/` (React + Vite) + `docker/`
- **Backend pattern**: Router → Service → Connector/Model (3-layer)
- **Frontend pattern**: Page → Component → API hook (TanStack Query) + Zustand store
- **Pipeline storage**: JSON blob in PostgreSQL (React Flow graph serialization)
- **Task dispatch**: Celery + Redis. API server is stateless; workers run pipelines and CDC syncs.

## Backend

- Python with `from __future__ import annotations` in every file
- FastAPI routers at `app/routers/`, services at `app/services/`
- Pydantic schemas at `app/schemas/` (never expose `connection_config` in responses)
- Connector system uses Strategy pattern with Registry (`@ConnectorRegistry.register`)
- Celery app at `app/celery_app.py`; tasks at `app/tasks.py` delegate to service functions (`_run_pipeline`, `_run_sync`)
- Tests use SQLite in-memory via `tests/conftest.py` fixtures; `task_always_eager=True` means tasks run inline in tests
- Run tests: `cd backend && source .venv/bin/activate && pytest -v` (112 passing)

## Frontend

- pnpm (not npm); TypeScript + Vite + React 19; Tailwind 4 with `@theme` tokens
- Path alias: `@/` maps to `src/`
- Self-hosted fonts: Inter (body) + JetBrains Mono (identifiers/metrics) via `@fontsource/*`
- UI primitives in `src/components/ui/` (shadcn/Radix). **Always reuse these — do not inline new card / button / badge markup:**
  - Data display: `DataTable` (generic sortable w/ loading/empty/error), `StatCard`, `Badge` (`status` / `count` / `kind` / `variant`)
  - Structure: `PageHeader`, `Card`, `Dialog`, `Tabs`, `EmptyState`, `Skeleton`
  - Inputs: `Button`, `Input`, `Select`, `DropdownMenu`, `Tooltip`, `Toast`, `Kbd`
- API hooks in `src/api/` use TanStack Query; mutations invalidate the relevant queryKey
- Pipeline canvas state in Zustand (`src/stores/pipeline-store.ts`)
- Build check: `pnpm run build` (must pass TypeScript and Vite build)

## Design Tokens

Defined in `frontend/src/globals.css` under `@theme`. Consume via Tailwind classes (`bg-primary`, `border-border`, `text-muted-foreground`, …) — do not hardcode hex values in components.

- Primary accent: **Emerald** `#059669` (consumed via `--color-primary`)
- Sidebar: dark `#111827` with emerald active accent; light work area `#ffffff`
- Canvas: dot-grid `#d1d5db` on `#fafbfc`
- Node type colors: source/filter/transform/join/aggregate/destination — use `var(--color-node-*)`
- Radius: `rounded-md` (6px cards), `rounded-lg` (10px dialogs)
- Typography: 13px body, Inter sans, JetBrains Mono for identifiers/metrics

Full spec: `docs/superpowers/specs/2026-04-18-ui-ux-revamp-design.md`.

## Key Commands

```bash
make dev                                              # docker postgres+redis + backend + frontend
make test                                             # backend pytest + frontend build
cd backend && source .venv/bin/activate && pytest -v  # backend only
cd frontend && pnpm run build                         # TypeScript + Vite
cd backend && celery -A app.celery_app worker --loglevel=info --concurrency=4  # worker
```

## Adding a New Connector

1. Create `backend/app/connectors/new_type.py` implementing `BaseConnector`
2. Add enum value to `ConnectorType` in `backend/app/models/connector.py`
3. Register with `@ConnectorRegistry.register(ConnectorType.NEW_TYPE)`
4. Add form fields in `frontend/src/components/connectors/ConnectorForm.tsx`
5. If `write_table` is implemented, wrap dict/list row values in a JSON adapter (see `postgres.py` `_adapt_value`)

## Adding a New Node Type

1. Add TypeScript types in `frontend/src/types/pipeline.ts` (`FooNodeData`)
2. Create `frontend/src/components/pipeline/nodes/FooNode.tsx` — delegate to `NodeShell` with `kind`, `identifier`, optional `summary`, `hasInput`/`hasOutput` flags
3. Register in `nodeTypes` map in `PipelineCanvas.tsx`
4. Add default data in `defaultNodeData` in `PipelineCanvas.tsx`
5. Add config panel section in `NodeConfigPanel.tsx`
6. Add toolbar entry in `PipelineToolbar.tsx` with `--color-node-foo` css variable
7. Add backend handling in `execution_engine.py` (a new `_execute_foo` path)

## Adding a New List Page

Prefer the established pattern over inline markup:

```tsx
<PageHeader title="…" description="…" actions={<Button>Primary action</Button>} />
<DataTable columns={[…]} rows={rows} getRowId={(r) => r.id} loading={isLoading} error={…} />
```

For row-level menus: `DropdownMenu` inside the actions column, wrap the cell in `<span onClick={(e) => e.stopPropagation()}>` if the table has `onRowClick`.

## Run / CDC Task Conventions

- `run_service.start_run` pre-generates the Celery `task_id`, persists it on `PipelineRun.celery_task_id` before dispatch so `cancel_run` can revoke
- `_run_pipeline` guards against clobbering a `CANCELLED` status both pre- and post-execution
- CDC syncs retry on `psycopg2.OperationalError`, `InterfaceError`, `ConnectionError`, `TimeoutError` (3x exponential backoff); the `_CDCSyncTask.on_failure` hook marks FAILED when retries are exhausted
- Pipeline tasks **do not** auto-retry (append-mode destinations aren't idempotent)

## Forward-Looking Conventions (open phases)

See [`docs/superpowers/roadmap.md`](./docs/superpowers/roadmap.md) for scoping. When starting any of these, keep these conventions in mind so the model stays coherent:

- **Phase 2c (SQL pushdown):** keep the in-memory `PipelineExecutor` as the reference path — SQL pushdown is additive, selected per-pipeline via an opt-in flag. Cross-connector pipelines always fall back to the Python path (with pagination).
- **Phase 3b / 3c (WAL + Change Streams):** plan to introduce a `CDCKind` enum (`poll` / `pg_wal` / `mongo_change_stream`) on `CDCJob` as a discriminator **before** implementing either, so the second kind isn't a schema migration. Add `resume_token: Optional[bytes]` and `operation_filter: list[str]` at the same time; keep `tracking_column` `Optional` (only required for `poll`).
- **S3 output for event-based CDC:** use a single event-log JSONL schema for both WAL and Change Streams so downstream consumers don't have to branch:
  ```jsonl
  {"_op":"insert|update|replace|delete","_lsn_or_token":"…","_ts":"…","_table":"…","before":{…}|null,"after":{…}|null}
  ```
- **Phase 3c (MongoDB):** `MongoConnector` is CDC-only in v1 — skip `execute_query` / `write_table`. Schema inference via `$sample`, not full scan. Requires source to be a replica set (doc it; fail fast with a clear error on standalone).
- **Phase 4 (Text2SQL):** use the Anthropic SDK with prompt caching on schema context. The `claude-api` skill in this repo's environment captures the caching pattern — invoke it when starting. Never auto-execute generated SQL; always surface to the user for review.
