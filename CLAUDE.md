# Data Builder — Project Conventions

## Architecture

- **Monorepo**: `backend/` (Python FastAPI) + `frontend/` (React + Vite) + `docker/`
- **Backend pattern**: Router → Service → Connector/Model (3-layer)
- **Frontend pattern**: Page → Component → API hook (React Query) + Zustand store
- **Pipeline storage**: JSON blob in PostgreSQL (React Flow graph serialization)

## Backend

- Python with `from __future__ import annotations` in every file
- FastAPI routers at `app/routers/`, services at `app/services/`
- Pydantic schemas at `app/schemas/` (never expose `connection_config` in responses)
- Connector system uses Strategy pattern with Registry (`@ConnectorRegistry.register`)
- Tests use SQLite in-memory via `tests/conftest.py` fixtures
- Run tests: `cd backend && source .venv/bin/activate && pytest -v`

## Frontend

- pnpm (not npm)
- Path alias: `@/` maps to `src/`
- UI components in `src/components/ui/` (shadcn/ui style with Radix primitives)
- API hooks in `src/api/` use TanStack Query
- Pipeline canvas state in Zustand (`src/stores/pipeline-store.ts`)
- Build check: `pnpm run build` (must pass TypeScript and Vite build)

## Key Commands

```bash
make dev            # Start everything for development
make test           # Run all tests
cd backend && source .venv/bin/activate && pytest -v  # Backend tests only
cd frontend && pnpm run build   # Frontend type check + build
```

## Adding a New Connector

1. Create `backend/app/connectors/new_type.py` implementing `BaseConnector`
2. Add enum value to `ConnectorType` in `backend/app/models/connector.py`
3. Register with `@ConnectorRegistry.register(ConnectorType.NEW_TYPE)`
4. Add form fields in `frontend/src/components/connectors/ConnectorForm.tsx`

## Adding a New Node Type

1. Create `frontend/src/components/pipeline/nodes/NewNode.tsx`
2. Register in `nodeTypes` map in `PipelineCanvas.tsx`
3. Add default data in `defaultNodeData` in `PipelineCanvas.tsx`
4. Add config panel section in `NodeConfigPanel.tsx`
5. Add TypeScript types in `frontend/src/types/pipeline.ts`
6. Add toolbar entry in `PipelineToolbar.tsx`
