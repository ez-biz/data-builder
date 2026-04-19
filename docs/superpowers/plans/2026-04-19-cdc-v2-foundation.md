# CDC v2 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared data model, task dispatch pattern, and event-log output schema that unblock both WAL-based PG CDC (future Spec #2) and MongoDB Change Streams CDC (future Spec #3) — without breaking any existing poll-based CDC behavior.

**Architecture:** Discriminated-model approach on `CDCJob` (new `CDCKind` enum) plus a new long-lived `cdc.watch` Celery task that wraps the existing poll logic in a cancelable loop. The legacy one-shot `cdc.sync` task is preserved for `/sync` and `/snapshot` HTTP endpoints. A new event-log JSONL schema is emitted alongside (not replacing) the legacy row-snapshot format, gated by per-job `output_format` with versioned-path migration semantics (existing jobs unchanged).

**Tech Stack:** Python 3.9, FastAPI, SQLAlchemy 2.0, Alembic, Celery 5 + Redis, psycopg2, boto3. pytest + `task_always_eager` fixture for Celery. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-19-cdc-v2-foundation-design.md` (commit `659d7b3`).

---

## Scope Check

Spec covers one subsystem (CDC foundation). WAL and Mongo are decomposed into their own future specs and are explicitly out of scope for this plan. Single plan document is appropriate.

## Testing Model

Backend-only work. TDD for every task:

1. Write failing test
2. Run it, confirm expected failure
3. Implement minimal code
4. Run tests, confirm pass + all 112 pre-existing tests still green
5. Commit

Celery runs inline via the existing `task_always_eager = True` setting in `tests/conftest.py`, so no worker process is needed during tests. Long-running watcher loops are tested with injected `sleep_fn` (mockable) and status-flip cancel — SIGTERM signal handling is code-reviewed but not unit-tested (OS-level, requires subprocess).

Build gates per commit:
- `cd backend && source .venv/bin/activate && pytest -q` → green (112 → ~125 tests)
- `cd frontend && pnpm run build` → green (frontend untouched but let's make sure import graphs don't break)

## File Structure Map

### Files to create

```
backend/alembic/versions/<auto>_cdc_v2_foundation.py   (Alembic migration)
backend/app/services/cdc_events.py                     (pure event-dict builders)
backend/tests/test_cdc_event_schema.py                 (~6 tests)
backend/tests/test_cdc_watcher.py                      (~5 tests)
backend/tests/test_cdc_scheduler_orphan.py             (~2 tests)
backend/tests/test_cdc_control_endpoints.py            (~3 tests)
docs/cdc-event-schema.md                               (user-facing reference)
```

### Files to modify

```
backend/app/models/cdc_job.py          (CDCKind enum + 5 new columns)
backend/app/schemas/cdc.py             (kind-aware Pydantic validation + new response fields)
backend/app/services/s3_writer.py      (add write_events method)
backend/app/services/cdc_service.py    (extract _poll_once; add _run_watcher + _watch_poll;
                                         add cancel_job, start_job; add _watch_pg_wal/_watch_mongo stubs)
backend/app/services/scheduler_service.py  (add _dispatch_orphaned_watchers tick)
backend/app/tasks.py                   (add cdc.watch task)
backend/app/routers/cdc.py             (add POST /jobs/{id}/start and /stop)
backend/tests/test_cdc_service.py      (update test cases broken by _run_sync rename)
README.md                              (update roadmap: mark foundation shipped)
CLAUDE.md                              (update Forward-Looking Conventions)
docs/superpowers/roadmap.md            (move foundation to shipped)
```

### Files to read for context (no changes)

```
backend/app/services/run_service.py    (reference for cancel_run / revoke pattern)
backend/app/celery_app.py              (Celery config — no changes needed)
backend/tests/conftest.py              (task_always_eager already set)
```

---

## Phase 1 · Data Model

### Task 1: CDCKind enum and model columns

**Files:**
- Modify: `backend/app/models/cdc_job.py`
- Test: `backend/tests/test_cdc_service.py` (existing file; add model-level test)

- [ ] **Step 1: Write the failing test**

Add at the end of `backend/tests/test_cdc_service.py`:

```python
def test_cdc_job_model_has_new_columns(db):
    """Foundation columns must exist on CDCJob."""
    from app.models.cdc_job import CDCJob, CDCKind

    assert CDCKind.POLL.value == "poll"
    assert CDCKind.PG_WAL.value == "pg_wal"
    assert CDCKind.MONGO_CHANGE_STREAM.value == "mongo_change_stream"

    # Verify columns on the model class
    cols = {c.name for c in CDCJob.__table__.columns}
    assert "cdc_kind" in cols
    assert "resume_token" in cols
    assert "operation_filter" in cols
    assert "checkpoint_interval_seconds" in cols
    assert "celery_task_id" in cols

    # tracking_column must now be nullable
    tracking_col = CDCJob.__table__.columns["tracking_column"]
    assert tracking_col.nullable is True
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/anchitgupta/data-builder/backend && source .venv/bin/activate && pytest tests/test_cdc_service.py::test_cdc_job_model_has_new_columns -v
```

Expected: `AttributeError: module 'app.models.cdc_job' has no attribute 'CDCKind'` or `AssertionError` on missing columns.

- [ ] **Step 3: Update `backend/app/models/cdc_job.py`**

Replace the file contents with:

```python
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Enum as SQLEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class CDCStatus(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    FAILED = "failed"


class CDCKind(str, enum.Enum):
    """Which kind of CDC mechanism this job uses.

    poll                 — tracking-column polling (Phase 3a, shipped)
    pg_wal               — PostgreSQL logical replication (future Spec #2)
    mongo_change_stream  — MongoDB Change Streams (future Spec #3)
    """
    POLL = "poll"
    PG_WAL = "pg_wal"
    MONGO_CHANGE_STREAM = "mongo_change_stream"


class CDCJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cdc_jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[CDCStatus] = mapped_column(
        SQLEnum(CDCStatus), default=CDCStatus.IDLE
    )

    cdc_kind: Mapped[CDCKind] = mapped_column(
        SQLEnum(CDCKind), nullable=False, default=CDCKind.POLL
    )

    # Source config
    source_schema: Mapped[str] = mapped_column(String(255), nullable=False)
    source_table: Mapped[str] = mapped_column(String(255), nullable=False)
    # Required only for poll kind; API validates per kind.
    tracking_column: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # S3 destination config
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_prefix: Mapped[str] = mapped_column(String(500), nullable=False, default="cdc/")
    s3_region: Mapped[str] = mapped_column(String(50), nullable=False, default="us-east-1")
    output_format: Mapped[str] = mapped_column(String(20), nullable=False, default="jsonl")

    # State tracking
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_rows_synced: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sync_interval_seconds: Mapped[int] = mapped_column(default=300)

    # v2 foundation additions
    resume_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operation_filter: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    checkpoint_interval_seconds: Mapped[int] = mapped_column(default=10)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    connector: Mapped["Connector"] = relationship()


class CDCSyncLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cdc_sync_logs"

    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cdc_jobs.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    rows_captured: Mapped[int] = mapped_column(default=0)
    s3_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    job: Mapped["CDCJob"] = relationship()
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd /Users/anchitgupta/data-builder/backend && source .venv/bin/activate && pytest tests/test_cdc_service.py::test_cdc_job_model_has_new_columns -v
```

Expected: PASS.

- [ ] **Step 5: Run full backend suite to catch regressions**

```bash
pytest -q
```

Expected: all tests pass. If any `test_cdc_service.py` tests fail because the model constructor signature changed, note the failing tests — they'll be fixed in Task 2 along with the migration.

- [ ] **Step 6: Commit**

```bash
cd /Users/anchitgupta/data-builder
git add backend/app/models/cdc_job.py backend/tests/test_cdc_service.py
git commit -m "feat(cdc): add CDCKind enum + v2 foundation columns to CDCJob

Adds: cdc_kind (discriminator), resume_token, operation_filter,
checkpoint_interval_seconds, celery_task_id. tracking_column is now
nullable at the model level (per-kind validation lives in Pydantic).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Alembic migration for the new columns

**Files:**
- Create: `backend/alembic/versions/<auto-slug>_cdc_v2_foundation.py`

- [ ] **Step 1: Write the failing test (round-trip migration)**

Add a new test file `backend/tests/test_cdc_migration.py`:

```python
"""Check that the CDC v2 foundation migration runs forward + backward cleanly.

This exercises the Alembic migration against the test SQLite DB by invoking
the upgrade/downgrade functions directly (not the CLI).
"""
from __future__ import annotations

import importlib
import pathlib


def test_migration_module_exists():
    """Migration file must exist and expose upgrade/downgrade."""
    versions_dir = pathlib.Path(__file__).parent.parent / "alembic" / "versions"
    matches = list(versions_dir.glob("*cdc_v2_foundation*.py"))
    assert len(matches) == 1, f"Expected 1 migration file, got {matches}"

    # Import the module and verify it has upgrade/downgrade
    spec = importlib.util.spec_from_file_location("migration", matches[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert hasattr(module, "upgrade")
    assert hasattr(module, "downgrade")
    # Standard alembic headers
    assert hasattr(module, "revision")
    assert hasattr(module, "down_revision")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_cdc_migration.py -v
```

Expected: FAIL — `AssertionError: Expected 1 migration file, got []`.

- [ ] **Step 3: Generate the Alembic migration**

```bash
cd /Users/anchitgupta/data-builder/backend
source .venv/bin/activate
alembic revision --autogenerate -m "cdc v2 foundation"
```

This writes a file like `backend/alembic/versions/<hash>_cdc_v2_foundation.py`. Open it and replace the body with the exact migration below (autogenerate gets most of it right, but we force a deterministic shape):

```python
"""cdc v2 foundation

Revision ID: <alembic-generated>
Revises: <previous-head>
Create Date: 2026-04-19 ...
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "<keep the auto-generated one>"
down_revision = "<keep the auto-generated one>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    cdc_kind = sa.Enum(
        "poll", "pg_wal", "mongo_change_stream", name="cdckind"
    )
    cdc_kind.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "cdc_jobs",
        sa.Column("cdc_kind", cdc_kind, nullable=False, server_default="poll"),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("resume_token", sa.Text(), nullable=True),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("operation_filter", sa.JSON(), nullable=True),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column(
            "checkpoint_interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default="10",
        ),
    )
    op.add_column(
        "cdc_jobs",
        sa.Column("celery_task_id", sa.String(length=100), nullable=True),
    )
    op.alter_column("cdc_jobs", "tracking_column", nullable=True)


def downgrade() -> None:
    op.alter_column("cdc_jobs", "tracking_column", nullable=False)
    op.drop_column("cdc_jobs", "celery_task_id")
    op.drop_column("cdc_jobs", "checkpoint_interval_seconds")
    op.drop_column("cdc_jobs", "operation_filter")
    op.drop_column("cdc_jobs", "resume_token")
    op.drop_column("cdc_jobs", "cdc_kind")
    sa.Enum(name="cdckind").drop(op.get_bind(), checkfirst=True)
```

Keep the `revision` and `down_revision` values that Alembic generated. Do not touch them.

- [ ] **Step 4: Apply the migration on the local Postgres (sanity check)**

```bash
alembic upgrade head
```

Expected: single log line `Running upgrade <previous> -> <new>, cdc v2 foundation`. If it errors, usually means the local DB has stale state — run `alembic current` and `alembic history` to debug.

- [ ] **Step 5: Verify round-trip (forward → backward → forward)**

```bash
alembic downgrade -1
alembic upgrade head
```

Expected: both succeed without errors.

- [ ] **Step 6: Run the test + full suite**

```bash
pytest tests/test_cdc_migration.py -v
pytest -q
```

Expected: new test passes; full suite green (the SQLite in-memory test DB recreates from the model metadata each run, so it picks up the new columns even without running alembic against it).

- [ ] **Step 7: Commit**

```bash
git add backend/alembic/versions/*cdc_v2_foundation*.py backend/tests/test_cdc_migration.py
git commit -m "feat(cdc): alembic migration for v2 foundation columns

Adds cdc_kind (enum), resume_token, operation_filter,
checkpoint_interval_seconds, celery_task_id; makes tracking_column
nullable. Forward+backward round-trip validated on local Postgres.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pydantic schemas with kind-aware validation

**Files:**
- Modify: `backend/app/schemas/cdc.py`
- Test: `backend/tests/test_cdc_service.py` (add new tests)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_cdc_service.py`:

```python
def test_cdc_job_create_poll_requires_tracking_column():
    """Poll kind without tracking_column must be rejected."""
    import pydantic
    from app.schemas.cdc import CDCJobCreate

    with pytest.raises(pydantic.ValidationError) as exc:
        CDCJobCreate(
            name="x",
            connector_id=uuid.uuid4(),
            cdc_kind="poll",
            source_schema="public",
            source_table="users",
            # tracking_column missing
            s3_bucket="b",
        )
    assert "tracking_column" in str(exc.value)


def test_cdc_job_create_pg_wal_rejects_tracking_column():
    """WAL kind must not receive tracking_column."""
    import pydantic
    from app.schemas.cdc import CDCJobCreate

    with pytest.raises(pydantic.ValidationError):
        CDCJobCreate(
            name="x",
            connector_id=uuid.uuid4(),
            cdc_kind="pg_wal",
            source_schema="public",
            source_table="users",
            tracking_column="updated_at",  # not allowed for WAL
            s3_bucket="b",
        )


def test_cdc_job_create_pg_wal_forces_event_jsonl():
    """WAL kind output_format must be event-jsonl."""
    import pydantic
    from app.schemas.cdc import CDCJobCreate

    with pytest.raises(pydantic.ValidationError):
        CDCJobCreate(
            name="x",
            connector_id=uuid.uuid4(),
            cdc_kind="pg_wal",
            source_schema="public",
            source_table="users",
            s3_bucket="b",
            output_format="jsonl",  # must be event-jsonl
        )


def test_cdc_job_create_pg_wal_defaults_operation_filter():
    """WAL kind defaults operation_filter to [insert, update, delete]."""
    from app.schemas.cdc import CDCJobCreate

    m = CDCJobCreate(
        name="x",
        connector_id=uuid.uuid4(),
        cdc_kind="pg_wal",
        source_schema="public",
        source_table="users",
        s3_bucket="b",
        output_format="event-jsonl",
    )
    assert m.operation_filter == ["insert", "update", "delete"]


def test_cdc_job_create_mongo_defaults_operation_filter_includes_replace():
    """Mongo kind defaults include 'replace'."""
    from app.schemas.cdc import CDCJobCreate

    m = CDCJobCreate(
        name="x",
        connector_id=uuid.uuid4(),
        cdc_kind="mongo_change_stream",
        source_schema="mydb",
        source_table="mycoll",
        s3_bucket="b",
        output_format="event-jsonl",
    )
    assert set(m.operation_filter) == {"insert", "update", "replace", "delete"}


def test_cdc_job_create_poll_allows_all_output_formats():
    """Poll kind accepts jsonl, csv, event-jsonl."""
    from app.schemas.cdc import CDCJobCreate

    for fmt in ("jsonl", "csv", "event-jsonl"):
        m = CDCJobCreate(
            name="x",
            connector_id=uuid.uuid4(),
            cdc_kind="poll",
            source_schema="public",
            source_table="users",
            tracking_column="id",
            s3_bucket="b",
            output_format=fmt,
        )
        assert m.output_format == fmt
```

You'll need `import pytest` and `import uuid` at the top of the test file if they aren't already there.

- [ ] **Step 2: Run to confirm failure**

```bash
pytest tests/test_cdc_service.py -k "cdc_job_create" -v
```

Expected: 6 tests fail (validation doesn't exist yet).

- [ ] **Step 3: Replace `backend/app/schemas/cdc.py`**

```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.cdc_job import CDCKind, CDCStatus

_POLL_FORMATS = {"jsonl", "csv", "event-jsonl"}
_EVENT_ONLY_FORMATS = {"event-jsonl"}
_PG_WAL_DEFAULT_OPS = ["insert", "update", "delete"]
_MONGO_DEFAULT_OPS = ["insert", "update", "replace", "delete"]


class CDCJobCreate(BaseModel):
    name: str
    connector_id: uuid.UUID
    cdc_kind: CDCKind = CDCKind.POLL
    source_schema: str
    source_table: str
    tracking_column: Optional[str] = None
    s3_bucket: str
    s3_prefix: str = "cdc/"
    s3_region: str = "us-east-1"
    output_format: Optional[str] = None
    sync_interval_seconds: int = 300
    checkpoint_interval_seconds: int = 10
    operation_filter: Optional[list[str]] = None

    @model_validator(mode="after")
    def _validate_per_kind(self) -> "CDCJobCreate":
        kind = self.cdc_kind
        if kind == CDCKind.POLL:
            if not self.tracking_column:
                raise ValueError(
                    "tracking_column is required for cdc_kind=poll"
                )
            fmt = self.output_format or "jsonl"
            if fmt not in _POLL_FORMATS:
                raise ValueError(
                    f"output_format must be one of {sorted(_POLL_FORMATS)} for poll kind"
                )
            self.output_format = fmt
            # Poll kind ignores resume_token / operation_filter
            self.operation_filter = None
        elif kind == CDCKind.PG_WAL:
            if self.tracking_column:
                raise ValueError(
                    "tracking_column must be None for cdc_kind=pg_wal"
                )
            fmt = self.output_format or "event-jsonl"
            if fmt not in _EVENT_ONLY_FORMATS:
                raise ValueError(
                    "output_format must be 'event-jsonl' for pg_wal kind"
                )
            self.output_format = fmt
            if self.operation_filter is None:
                self.operation_filter = list(_PG_WAL_DEFAULT_OPS)
        elif kind == CDCKind.MONGO_CHANGE_STREAM:
            if self.tracking_column:
                raise ValueError(
                    "tracking_column must be None for cdc_kind=mongo_change_stream"
                )
            fmt = self.output_format or "event-jsonl"
            if fmt not in _EVENT_ONLY_FORMATS:
                raise ValueError(
                    "output_format must be 'event-jsonl' for mongo_change_stream kind"
                )
            self.output_format = fmt
            if self.operation_filter is None:
                self.operation_filter = list(_MONGO_DEFAULT_OPS)
        return self


class CDCJobUpdate(BaseModel):
    name: Optional[str] = None
    tracking_column: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_prefix: Optional[str] = None
    s3_region: Optional[str] = None
    output_format: Optional[str] = None
    sync_interval_seconds: Optional[int] = None
    checkpoint_interval_seconds: Optional[int] = None
    operation_filter: Optional[list[str]] = None


class CDCJobResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_id: uuid.UUID
    status: CDCStatus
    cdc_kind: CDCKind
    source_schema: str
    source_table: str
    tracking_column: Optional[str] = None
    s3_bucket: str
    s3_prefix: str
    s3_region: str
    output_format: str
    sync_interval_seconds: int
    checkpoint_interval_seconds: int
    last_sync_at: Optional[datetime] = None
    last_value: Optional[str] = None
    resume_token: Optional[str] = None
    operation_filter: Optional[list[str]] = None
    total_rows_synced: int = 0
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CDCSyncLogResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    started_at: datetime
    finished_at: Optional[datetime] = None
    rows_captured: int = 0
    s3_path: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Update `cdc_service.create_job` to persist the new fields**

In `backend/app/services/cdc_service.py`, replace the `create_job` function body with:

```python
def create_job(db: Session, data: CDCJobCreate) -> CDCJob:
    job = CDCJob(
        name=data.name,
        connector_id=data.connector_id,
        cdc_kind=data.cdc_kind,
        source_schema=data.source_schema,
        source_table=data.source_table,
        tracking_column=data.tracking_column,
        s3_bucket=data.s3_bucket,
        s3_prefix=data.s3_prefix,
        s3_region=data.s3_region,
        output_format=data.output_format,
        sync_interval_seconds=data.sync_interval_seconds,
        checkpoint_interval_seconds=data.checkpoint_interval_seconds,
        operation_filter=data.operation_filter,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_cdc_service.py -v
```

Expected: all 6 new kind-validation tests pass; existing tests continue to pass (they use `cdc_kind="poll"` by default).

- [ ] **Step 6: Full suite + frontend build**

```bash
pytest -q
cd ../frontend && pnpm run build
```

Expected: 112 + 7 new = ~119 tests green; frontend build green (frontend untouched but API response schema expanded, which is backward-compatible).

- [ ] **Step 7: Commit**

```bash
cd /Users/anchitgupta/data-builder
git add backend/app/schemas/cdc.py backend/app/services/cdc_service.py backend/tests/test_cdc_service.py
git commit -m "feat(cdc): kind-aware Pydantic validation on CDCJobCreate

- Poll kind requires tracking_column; allows jsonl/csv/event-jsonl
- WAL kind rejects tracking_column; forces output_format=event-jsonl;
  defaults operation_filter to [insert,update,delete]
- Mongo kind same as WAL; default operation_filter adds 'replace'
- Response schema exposes cdc_kind, resume_token, operation_filter,
  checkpoint_interval_seconds, celery_task_id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 · Event Schema Primitives

### Task 4: Event builder module (`cdc_events.py`)

**Files:**
- Create: `backend/app/services/cdc_events.py`
- Create: `backend/tests/test_cdc_event_schema.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_cdc_event_schema.py`:

```python
"""Unit tests for the cdc event-log schema builders.

Builders are pure functions over primitive inputs (rows, columns, metadata).
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest


def test_build_poll_upsert_event_shape():
    from app.services.cdc_events import build_poll_upsert_event

    row = [1, "Alice", "a@b.com", datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc)]
    columns = ["id", "name", "email", "updated_at"]
    event = build_poll_upsert_event(
        row=row,
        columns=columns,
        tracking_column="updated_at",
        table_name="public.users",
    )

    assert event["_op"] == "upsert"
    assert event["_table"] == "public.users"
    assert event["_kind"] == "poll"
    assert event["_position"] == "2026-04-19T12:00:00+00:00"
    assert event["before"] is None
    assert event["after"]["id"] == 1
    assert event["after"]["name"] == "Alice"
    # datetime serialized as ISO
    assert event["after"]["updated_at"] == "2026-04-19T12:00:00+00:00"
    # _ts is ISO and parseable
    assert "_ts" in event
    datetime.fromisoformat(event["_ts"].replace("Z", "+00:00"))
    assert event["updated_fields"] is None


def test_build_poll_upsert_event_no_tracking_column_in_row():
    """If tracking_column isn't in columns, _position falls back to empty string."""
    from app.services.cdc_events import build_poll_upsert_event

    event = build_poll_upsert_event(
        row=[1, "Alice"],
        columns=["id", "name"],
        tracking_column="updated_at",   # not in columns
        table_name="public.users",
    )
    assert event["_position"] == ""


def test_build_wal_event_insert():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="insert",
        lsn="0/3D3F490",
        table_name="public.users",
        before=None,
        after={"id": 42, "name": "Alice"},
        updated_fields=None,
    )
    assert event["_op"] == "insert"
    assert event["_kind"] == "pg_wal"
    assert event["_position"] == "0/3D3F490"
    assert event["before"] is None
    assert event["after"] == {"id": 42, "name": "Alice"}
    assert event["updated_fields"] is None


def test_build_wal_event_update_with_fields():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="update",
        lsn="0/3D3F4A8",
        table_name="public.users",
        before={"id": 42, "name": "Alice", "email": "old@x"},
        after={"id": 42, "name": "Alice", "email": "new@x"},
        updated_fields=["email"],
    )
    assert event["_op"] == "update"
    assert event["before"] == {"id": 42, "name": "Alice", "email": "old@x"}
    assert event["after"] == {"id": 42, "name": "Alice", "email": "new@x"}
    assert event["updated_fields"] == ["email"]


def test_build_wal_event_delete():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="delete",
        lsn="0/3D3F4B0",
        table_name="public.users",
        before={"id": 42, "name": "Alice"},
        after=None,
        updated_fields=None,
    )
    assert event["_op"] == "delete"
    assert event["before"] == {"id": 42, "name": "Alice"}
    assert event["after"] is None


def test_build_mongo_event_replace():
    from app.services.cdc_events import build_mongo_event

    event = build_mongo_event(
        op="replace",
        resume_token_hex="abcd1234",
        table_name="mydb.users",
        before=None,
        after={"_id": "507f", "name": "Alice"},
        updated_fields=None,
    )
    assert event["_op"] == "replace"
    assert event["_kind"] == "mongo_change_stream"
    assert event["_position"] == "abcd1234"
    assert event["after"]["_id"] == "507f"


def test_event_serializes_bytes_and_nested_dicts():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="insert",
        lsn="0/1",
        table_name="t",
        before=None,
        after={
            "id": 1,
            "blob": b"\x00\x01",            # should become hex
            "meta": {"nested": "value"},   # should pass through
            "ts": datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),  # ISO
        },
        updated_fields=None,
    )
    assert event["after"]["blob"] == "0001"
    assert event["after"]["meta"] == {"nested": "value"}
    assert event["after"]["ts"] == "2026-04-19T12:00:00+00:00"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cdc_event_schema.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.cdc_events'`.

- [ ] **Step 3: Create `backend/app/services/cdc_events.py`**

```python
"""Event-log schema builders for CDC v2.

Pure functions. No DB, no I/O. Each returns a dict matching the event-log
JSONL shape documented in docs/cdc-event-schema.md.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_value(value: Any) -> Any:
    """Convert non-JSON-native types for event output.

    Mirrors s3_writer._serialize_value but scoped to event fields:
    datetime → ISO, bytes → lowercase hex, dict/list → pass through
    (caller responsible for recursion if nested).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    return value


def _serialize_row(row: list[Any], columns: list[str]) -> dict[str, Any]:
    """Convert a column-ordered row to a name->value dict with serialized values."""
    return {col: _serialize_value(val) for col, val in zip(columns, row)}


def build_poll_upsert_event(
    *,
    row: list[Any],
    columns: list[str],
    tracking_column: str,
    table_name: str,
) -> dict[str, Any]:
    """Build an upsert event for a row emitted by the poll watcher."""
    try:
        tracking_idx = columns.index(tracking_column)
        position = str(_serialize_value(row[tracking_idx]))
    except ValueError:
        position = ""

    return {
        "_op": "upsert",
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": position,
        "_kind": "poll",
        "before": None,
        "after": _serialize_row(row, columns),
        "updated_fields": None,
    }


def build_wal_event(
    *,
    op: str,
    lsn: str,
    table_name: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    updated_fields: Optional[list[str]],
) -> dict[str, Any]:
    """Build a WAL-sourced event."""
    return {
        "_op": op,
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": lsn,
        "_kind": "pg_wal",
        "before": _serialize_dict(before) if before is not None else None,
        "after": _serialize_dict(after) if after is not None else None,
        "updated_fields": updated_fields,
    }


def build_mongo_event(
    *,
    op: str,
    resume_token_hex: str,
    table_name: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    updated_fields: Optional[list[str]],
) -> dict[str, Any]:
    """Build a Mongo Change Stream-sourced event."""
    return {
        "_op": op,
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": resume_token_hex,
        "_kind": "mongo_change_stream",
        "before": _serialize_dict(before) if before is not None else None,
        "after": _serialize_dict(after) if after is not None else None,
        "updated_fields": updated_fields,
    }


def _serialize_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Serialize each value in a dict. Non-recursive (nested dicts pass through)."""
    return {k: _serialize_value(v) for k, v in d.items()}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
pytest tests/test_cdc_event_schema.py -v
```

Expected: 7 tests pass.

- [ ] **Step 5: Full suite**

```bash
pytest -q
```

Expected: ~126 tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cdc_events.py backend/tests/test_cdc_event_schema.py
git commit -m "feat(cdc): event-log schema builders (poll upsert, WAL, Mongo)

Pure functions producing the foundation event dict shape. Serializes
datetime->ISO and bytes->hex at event-field level. Non-recursive
(nested dicts pass through to JSONL serialization).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 · S3 Writer

### Task 5: Add `S3Writer.write_events`

**Files:**
- Modify: `backend/app/services/s3_writer.py`
- Modify: `backend/tests/test_cdc.py` (existing S3 tests)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_cdc.py`:

```python
def test_s3_writer_write_events_path_and_body(monkeypatch):
    """write_events produces the expected S3 key and JSONL body."""
    from app.services.s3_writer import S3Writer

    captured = {}

    class _FakeS3:
        def put_object(self, **kwargs):
            captured["Bucket"] = kwargs["Bucket"]
            captured["Key"] = kwargs["Key"]
            captured["Body"] = kwargs["Body"]
            captured["ContentType"] = kwargs["ContentType"]

    w = S3Writer.__new__(S3Writer)
    w._bucket = "my-bucket"
    w._s3 = _FakeS3()

    events = [
        {"_op": "upsert", "_table": "public.users", "after": {"id": 1}},
        {"_op": "upsert", "_table": "public.users", "after": {"id": 2}},
    ]
    s3_path = w.write_events(
        prefix="cdc/",
        table_name="users",
        events=events,
        batch_id="abcd1234",
    )

    assert s3_path.startswith("s3://my-bucket/cdc/users/")
    assert s3_path.endswith("abcd1234.jsonl")
    assert captured["Bucket"] == "my-bucket"
    assert "users/year=" in captured["Key"]
    assert captured["Key"].endswith("abcd1234.jsonl")
    assert captured["ContentType"] == "application/x-ndjson"

    # Each line of body is valid JSON
    lines = captured["Body"].decode("utf-8").strip().split("\n")
    assert len(lines) == 2
    import json
    for line in lines:
        obj = json.loads(line)
        assert obj["_op"] == "upsert"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_cdc.py::test_s3_writer_write_events_path_and_body -v
```

Expected: FAIL — `AttributeError: 'S3Writer' object has no attribute 'write_events'`.

- [ ] **Step 3: Add the method to `backend/app/services/s3_writer.py`**

Find the end of the `S3Writer` class (just before the `_serialize_value` module-level function) and insert:

```python
    def write_events(
        self,
        *,
        prefix: str,
        table_name: str,
        events: list[dict],
        batch_id: str,
    ) -> str:
        """Write a list of already-built event dicts as JSONL. Returns the S3 path.

        Partitioning convention matches write_jsonl:
            <prefix>/<table>/year=YYYY/month=MM/day=DD/<batch_id>.jsonl
        """
        now = datetime.now(timezone.utc)
        key = (
            f"{prefix.rstrip('/')}/{table_name}/"
            f"year={now.year}/month={now.month:02d}/day={now.day:02d}/"
            f"{batch_id}.jsonl"
        )

        buf = io.StringIO()
        for event in events:
            buf.write(json.dumps(event, default=str) + "\n")

        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=buf.getvalue().encode("utf-8"),
            ContentType="application/x-ndjson",
        )
        logger.info(
            "Wrote %d events to s3://%s/%s",
            len(events), self._bucket, key,
        )
        return f"s3://{self._bucket}/{key}"
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_cdc.py::test_s3_writer_write_events_path_and_body -v
pytest -q
```

Expected: new test passes; full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/s3_writer.py backend/tests/test_cdc.py
git commit -m "feat(s3): S3Writer.write_events for event-log JSONL output

Same partition convention as write_jsonl. Caller is responsible for
building events in the schema defined by cdc_events.py; this method
just batches and uploads.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 · Task Pattern

### Task 6: Add `cdc.watch` Celery task + `_run_watcher` dispatch + stubs

**Files:**
- Modify: `backend/app/tasks.py`
- Modify: `backend/app/services/cdc_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cdc_watcher.py`:

```python
"""Tests for the long-running cdc.watch task and dispatch."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.encryption import encrypt_config
from app.models.cdc_job import CDCJob, CDCKind, CDCStatus
from app.models.connector import Connector, ConnectorType
from app.services import cdc_service


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def patch_session(monkeypatch):
    monkeypatch.setattr(cdc_service, "SessionLocal", _TestSessionLocal)


def _seed_connector(db) -> Connector:
    c = Connector(
        name="pg",
        connector_type=ConnectorType.POSTGRESQL,
        connection_config={"encrypted": encrypt_config({"host": "x"})},
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def _seed_job(db, connector_id, kind=CDCKind.POLL, **overrides) -> CDCJob:
    defaults = dict(
        name="j", connector_id=connector_id, cdc_kind=kind,
        source_schema="public", source_table="users",
        tracking_column="id" if kind == CDCKind.POLL else None,
        s3_bucket="b", s3_prefix="cdc/", s3_region="us-east-1",
        output_format="event-jsonl" if kind != CDCKind.POLL else "jsonl",
        status=CDCStatus.RUNNING,
    )
    defaults.update(overrides)
    j = CDCJob(**defaults)
    db.add(j); db.commit(); db.refresh(j)
    return j


def test_run_watcher_exits_if_job_not_running(db):
    """If status is IDLE, watcher returns immediately without error."""
    c = _seed_connector(db)
    j = _seed_job(db, c.id, status=CDCStatus.IDLE)

    class _Task:
        is_aborted = lambda self: False

    # Should not raise. Just returns.
    cdc_service._run_watcher(_Task(), j.id)


def test_run_watcher_pg_wal_raises_not_implemented(db):
    c = _seed_connector(db)
    j = _seed_job(db, c.id, kind=CDCKind.PG_WAL, tracking_column=None,
                  output_format="event-jsonl")

    class _Task:
        is_aborted = lambda self: False

    with pytest.raises(NotImplementedError) as exc:
        cdc_service._run_watcher(_Task(), j.id)
    assert "Spec #2" in str(exc.value)


def test_run_watcher_mongo_raises_not_implemented(db):
    c = _seed_connector(db)
    j = _seed_job(db, c.id, kind=CDCKind.MONGO_CHANGE_STREAM,
                  tracking_column=None, output_format="event-jsonl")

    class _Task:
        is_aborted = lambda self: False

    with pytest.raises(NotImplementedError) as exc:
        cdc_service._run_watcher(_Task(), j.id)
    assert "Spec #3" in str(exc.value)
```

- [ ] **Step 2: Run tests**

```bash
pytest tests/test_cdc_watcher.py -v
```

Expected: 3 tests fail — `_run_watcher` not defined.

- [ ] **Step 3: Update `backend/app/tasks.py`**

Add at the bottom of the file (after `run_cdc_sync_task`):

```python
class _CDCWatchTask(celery_app.Task):
    """Base class for the long-running cdc.watch task.

    No autoretry — the task is long-lived and handles its own errors.
    acks_late + reject_on_worker_lost so a crashed worker's task gets
    re-dispatched via the scheduler's orphan-detection tick.
    """
    acks_late = True
    reject_on_worker_lost = True


@celery_app.task(bind=True, name="cdc.watch", base=_CDCWatchTask)
def cdc_watch_task(self, job_id: str) -> None:
    from app.services.cdc_service import _run_watcher
    _run_watcher(self, uuid.UUID(job_id))
```

- [ ] **Step 4: Add `_run_watcher` and stub watchers to `cdc_service.py`**

Append to `backend/app/services/cdc_service.py` (after `_run_sync`):

```python
def _run_watcher(task, job_id: uuid.UUID) -> None:
    """Entry point for the cdc.watch task. Dispatches to per-kind watcher."""
    db = SessionLocal()
    try:
        job = db.query(CDCJob).filter(CDCJob.id == job_id).first()
        if not job:
            logger.info("cdc.watch: job %s not found, exiting", job_id)
            return
        if job.status != CDCStatus.RUNNING:
            logger.info(
                "cdc.watch: job %s has status=%s (not running), exiting",
                job_id, job.status,
            )
            return

        if job.cdc_kind == CDCKind.POLL:
            _watch_poll(task, db, job)
        elif job.cdc_kind == CDCKind.PG_WAL:
            _watch_pg_wal(task, db, job)
        elif job.cdc_kind == CDCKind.MONGO_CHANGE_STREAM:
            _watch_mongo(task, db, job)
        else:
            raise ValueError(f"Unknown cdc_kind: {job.cdc_kind}")
    finally:
        db.close()


def _watch_pg_wal(task, db: Session, job: CDCJob) -> None:
    """Stub — actual implementation lands in Spec #2 (WAL-based PG CDC)."""
    raise NotImplementedError(
        "WAL-based PG CDC watcher is implemented in Spec #2. "
        "This is the foundation; slot consumer + pypgoutput decoder come next."
    )


def _watch_mongo(task, db: Session, job: CDCJob) -> None:
    """Stub — actual implementation lands in Spec #3 (MongoDB + Change Streams)."""
    raise NotImplementedError(
        "MongoDB Change Streams watcher is implemented in Spec #3. "
        "This is the foundation; MongoConnector + resume_token consumer come next."
    )


def _watch_poll(task, db: Session, job: CDCJob) -> None:
    """Placeholder in Task 6 — real implementation lands in Task 7."""
    raise NotImplementedError("_watch_poll implemented in Task 7")
```

Also import `CDCKind` at the top of the file — replace the existing `from app.models.cdc_job import CDCJob, CDCStatus, CDCSyncLog` line with:

```python
from app.models.cdc_job import CDCJob, CDCKind, CDCStatus, CDCSyncLog
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_cdc_watcher.py -v
pytest -q
```

Expected: 3 tests pass; full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/tasks.py backend/app/services/cdc_service.py backend/tests/test_cdc_watcher.py
git commit -m "feat(cdc): cdc.watch Celery task + _run_watcher dispatch + stubs

- New long-running cdc.watch task (acks_late, reject_on_worker_lost)
- _run_watcher reads job.cdc_kind and dispatches to per-kind watcher
- _watch_pg_wal and _watch_mongo raise NotImplementedError with clear
  pointers to future specs
- _watch_poll stubbed (real implementation in Task 7)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Extract `_poll_once` + implement `_watch_poll` loop

**Files:**
- Modify: `backend/app/services/cdc_service.py`
- Test: `backend/tests/test_cdc_watcher.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_cdc_watcher.py`:

```python
from unittest.mock import MagicMock

from app.connectors.base import BaseConnector, ConnectionTestResult, QueryResult
from app.connectors.registry import ConnectorRegistry


class _MockConnector(BaseConnector):
    def __init__(self, config):
        super().__init__(config)
        self._results = [
            QueryResult(columns=["id", "name"], rows=[[1, "A"], [2, "B"]], row_count=2),
            QueryResult(columns=["id", "name"], rows=[], row_count=0),  # second call: no new rows
        ]

    def test_connection(self): return ConnectionTestResult(success=True, message="ok")
    def get_schemas(self): return []
    def get_tables(self, s): return []
    def get_columns(self, s, t): return []
    def preview_table(self, s, t, limit=50): raise NotImplementedError
    def execute_query(self, query, params=None):
        if self._results:
            return self._results.pop(0)
        return QueryResult(columns=[], rows=[], row_count=0)
    def write_table(self, s, t, cols, rows, mode="append"): return 0


@pytest.fixture
def mock_connector_registry(monkeypatch):
    original = dict(ConnectorRegistry._registry)
    ConnectorRegistry._registry[ConnectorType.POSTGRESQL] = _MockConnector
    yield
    ConnectorRegistry._registry.clear()
    ConnectorRegistry._registry.update(original)


def test_watch_poll_emits_events_and_exits_on_status_flip(
    db, monkeypatch, mock_connector_registry
):
    """Happy path: watcher calls _poll_once, emits events, commits, checks
    status, flips to IDLE on second iteration, exits cleanly."""
    c = _seed_connector(db)
    j = _seed_job(db, c.id, output_format="event-jsonl", sync_interval_seconds=0)

    # Capture write_events calls
    write_events_calls = []

    class _FakeS3Writer:
        def __init__(self, bucket, region="us-east-1"):
            self.bucket = bucket

        def write_events(self, *, prefix, table_name, events, batch_id):
            write_events_calls.append({
                "prefix": prefix, "table_name": table_name,
                "events": events, "batch_id": batch_id,
            })
            return f"s3://{self.bucket}/{prefix}{table_name}/batch-{batch_id}.jsonl"

        def write_jsonl(self, **kw): raise AssertionError("should use events path")
        def write_csv(self, **kw): raise AssertionError("should use events path")

    monkeypatch.setattr(cdc_service, "S3Writer", _FakeS3Writer)

    # Inject sleep that flips status to IDLE after first cycle so loop exits
    iteration = {"count": 0}
    def _fake_sleep(seconds):
        iteration["count"] += 1
        if iteration["count"] == 1:
            # Flip status via a direct DB write
            session = _TestSessionLocal()
            try:
                row = session.query(CDCJob).filter(CDCJob.id == j.id).first()
                row.status = CDCStatus.IDLE
                session.commit()
            finally:
                session.close()

    monkeypatch.setattr(cdc_service, "_watcher_sleep", _fake_sleep)

    class _Task:
        is_aborted = lambda self: False

    cdc_service._run_watcher(_Task(), j.id)

    # First iteration should have emitted 2 events (rows from first QueryResult)
    assert len(write_events_calls) == 1
    assert len(write_events_calls[0]["events"]) == 2
    assert write_events_calls[0]["events"][0]["_op"] == "upsert"
    assert write_events_calls[0]["events"][0]["_kind"] == "poll"

    # Job state advanced
    fresh = db.query(CDCJob).filter(CDCJob.id == j.id).first()
    db.refresh(fresh)
    assert fresh.last_value == "2"          # id of last row
    assert fresh.total_rows_synced == 2


def test_watch_poll_legacy_jsonl_uses_write_jsonl(
    db, monkeypatch, mock_connector_registry
):
    """Existing jobs with output_format='jsonl' (or 'csv') use the legacy writer."""
    c = _seed_connector(db)
    j = _seed_job(db, c.id, output_format="jsonl", sync_interval_seconds=0)

    write_jsonl_calls = []
    write_events_calls = []

    class _FakeS3Writer:
        def __init__(self, bucket, region="us-east-1"):
            self.bucket = bucket

        def write_jsonl(self, *, prefix, table_name, columns, rows, batch_id):
            write_jsonl_calls.append({"rows": rows, "columns": columns})
            return f"s3://{self.bucket}/legacy.jsonl"

        def write_events(self, **kw):
            write_events_calls.append(kw)
            return "s3://x/events.jsonl"

        def write_csv(self, **kw):
            raise AssertionError("unused")

    monkeypatch.setattr(cdc_service, "S3Writer", _FakeS3Writer)

    iteration = {"count": 0}
    def _fake_sleep(seconds):
        iteration["count"] += 1
        if iteration["count"] == 1:
            session = _TestSessionLocal()
            try:
                row = session.query(CDCJob).filter(CDCJob.id == j.id).first()
                row.status = CDCStatus.IDLE
                session.commit()
            finally:
                session.close()

    monkeypatch.setattr(cdc_service, "_watcher_sleep", _fake_sleep)

    class _Task:
        is_aborted = lambda self: False

    cdc_service._run_watcher(_Task(), j.id)

    assert len(write_jsonl_calls) == 1
    assert write_jsonl_calls[0]["rows"] == [[1, "A"], [2, "B"]]
    assert write_events_calls == []  # legacy path, not touched
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_cdc_watcher.py -v
```

Expected: 2 new tests fail — `_watch_poll` not implemented; `_watcher_sleep` not defined.

- [ ] **Step 3: Implement `_poll_once` extraction + `_watch_poll` in `cdc_service.py`**

In `backend/app/services/cdc_service.py`:

1. Add at the top (after existing imports):

```python
import time
from dataclasses import dataclass

from app.services.cdc_events import build_poll_upsert_event


@dataclass
class PollResult:
    """Outcome of a single poll iteration: raw rows + new tracking value."""
    columns: list[str]
    rows: list[list]
    new_last_value: Optional[str]
```

2. Replace the existing `_run_sync` function with this pair:

```python
def _poll_once(
    connector_type: str,
    connector_config: dict,
    job_snapshot: dict,
) -> PollResult:
    """Execute one poll cycle and return the raw result.

    Does not touch the DB or S3. Callers (both cdc.sync one-shot and
    _watch_poll loop) handle persistence and writes per output_format.
    """
    from app.connectors.registry import ConnectorRegistry

    connector = ConnectorRegistry.create(connector_type, connector_config)
    schema = job_snapshot["source_schema"]
    table = job_snapshot["source_table"]
    tracking_col = job_snapshot["tracking_column"]
    last_value = job_snapshot.get("last_value")

    if last_value:
        query = (
            f'SELECT * FROM "{schema}"."{table}" '
            f'WHERE "{tracking_col}" > %s '
            f'ORDER BY "{tracking_col}" ASC'
        )
        result = connector.execute_query(query, (last_value,))
    else:
        query = (
            f'SELECT * FROM "{schema}"."{table}" '
            f'ORDER BY "{tracking_col}" ASC'
        )
        result = connector.execute_query(query)

    new_last_value = last_value
    if result.rows:
        if tracking_col in result.columns:
            idx = result.columns.index(tracking_col)
            new_last_value = str(result.rows[-1][idx])

    return PollResult(
        columns=result.columns,
        rows=result.rows,
        new_last_value=new_last_value,
    )


# Indirection for test injection of sleep.
def _watcher_sleep(seconds: int) -> None:
    time.sleep(seconds)


def _watch_poll(task, db: Session, job: CDCJob) -> None:
    """Long-running poll watcher loop.

    Each iteration: call _poll_once, write to S3 (format-dependent),
    advance last_value, check status, sleep sync_interval_seconds.
    Exits cleanly when job.status != RUNNING.
    """
    connector = db.query(Connector).filter(Connector.id == job.connector_id).first()
    if not connector:
        logger.error("Watcher: connector %s not found for job %s",
                     job.connector_id, job.id)
        job.status = CDCStatus.FAILED
        job.error_message = "Connector not found"
        db.commit()
        return

    config = get_decrypted_config(connector)
    connector_type = connector.connector_type

    # Per-iteration snapshot built fresh so runtime edits to job fields take effect
    while True:
        # Re-read status inside the transaction
        db.refresh(job)
        if job.status != CDCStatus.RUNNING:
            logger.info("Watcher: job %s status=%s, exiting", job.id, job.status)
            return

        job_snapshot = {
            "source_schema": job.source_schema,
            "source_table": job.source_table,
            "tracking_column": job.tracking_column,
            "last_value": job.last_value,
            "s3_bucket": job.s3_bucket,
            "s3_prefix": job.s3_prefix,
            "s3_region": job.s3_region,
            "output_format": job.output_format,
        }

        try:
            result = _poll_once(connector_type, config, job_snapshot)
        except Exception as e:
            logger.exception("Watcher: poll failed for job %s", job.id)
            job.status = CDCStatus.FAILED
            job.error_message = str(e)
            db.commit()
            notify_cdc_failure(job.name, str(job.id), str(e))
            return

        if result.rows:
            # Build events or rows per output_format and write to S3
            s3 = S3Writer(bucket=job.s3_bucket, region=job.s3_region)
            batch_id = uuid.uuid4().hex[:8]
            table_fq = f"{job.source_schema}.{job.source_table}"

            if job.output_format == "event-jsonl":
                events = [
                    build_poll_upsert_event(
                        row=row,
                        columns=result.columns,
                        tracking_column=job.tracking_column,
                        table_name=table_fq,
                    )
                    for row in result.rows
                ]
                s3_path = s3.write_events(
                    prefix=job.s3_prefix,
                    table_name=job.source_table,
                    events=events,
                    batch_id=batch_id,
                )
            elif job.output_format == "csv":
                s3_path = s3.write_csv(
                    prefix=job.s3_prefix,
                    table_name=job.source_table,
                    columns=result.columns,
                    rows=result.rows,
                    batch_id=batch_id,
                )
            else:  # "jsonl" (legacy default)
                s3_path = s3.write_jsonl(
                    prefix=job.s3_prefix,
                    table_name=job.source_table,
                    columns=result.columns,
                    rows=result.rows,
                    batch_id=batch_id,
                )

            # Persist progress
            job.last_value = result.new_last_value
            job.total_rows_synced = (job.total_rows_synced or 0) + len(result.rows)

            # Append a sync-log row so the existing /logs endpoint remains populated
            now = datetime.now(timezone.utc)
            log = CDCSyncLog(
                job_id=job.id,
                started_at=now,
                finished_at=now,
                rows_captured=len(result.rows),
                s3_path=s3_path,
                status="completed",
            )
            db.add(log)

        job.last_sync_at = datetime.now(timezone.utc)
        job.error_message = None
        db.commit()

        # Sleep before next iteration
        _watcher_sleep(job.sync_interval_seconds)
```

- [ ] **Step 4: Keep the existing one-shot `cdc.sync` working by rewriting `trigger_sync` / `trigger_snapshot` to call `_poll_once`**

Inside `cdc_service.py`, replace the `trigger_sync` function's body so that when the task runs, it calls `_poll_once` and writes the result. The simplest shape:

Replace the existing body of `_run_sync` (the function Celery's `cdc.sync` task calls) with this wrapper that re-uses `_poll_once` + the same write-branch logic as `_watch_poll`:

```python
def _run_sync(
    log_id: uuid.UUID,
    job_id: uuid.UUID,
    connector_type: str,
    connector_config: dict,
    job_snapshot: dict,
) -> None:
    """One-shot sync (called by cdc.sync task for manual /sync and /snapshot).

    Reuses _poll_once for the query + same output-format branching as
    _watch_poll for the write. Unlike the watcher, this function does
    NOT loop — it performs exactly one iteration and returns.
    """
    db = SessionLocal()
    try:
        log = db.query(CDCSyncLog).filter(CDCSyncLog.id == log_id).first()
        job = db.query(CDCJob).filter(CDCJob.id == job_id).first()
        if not log or not job:
            return

        try:
            result = _poll_once(connector_type, connector_config, job_snapshot)
        except Exception as e:
            if isinstance(e, (__import_transient_exceptions())):
                # Re-raise to let Celery retry (preserves existing retry behavior)
                raise
            log.status = "failed"
            log.error_message = str(e)
            log.finished_at = datetime.now(timezone.utc)
            job.status = CDCStatus.FAILED
            job.error_message = str(e)
            db.commit()
            notify_cdc_failure(job.name, str(job_id), str(e))
            return

        if not result.rows:
            log.status = "completed"
            log.rows_captured = 0
            log.finished_at = datetime.now(timezone.utc)
            job.status = CDCStatus.IDLE
            db.commit()
            return

        s3 = S3Writer(bucket=job.s3_bucket, region=job.s3_region)
        batch_id = str(log_id)[:8]
        table_fq = f"{job.source_schema}.{job.source_table}"

        if job.output_format == "event-jsonl":
            events = [
                build_poll_upsert_event(
                    row=row,
                    columns=result.columns,
                    tracking_column=job.tracking_column,
                    table_name=table_fq,
                )
                for row in result.rows
            ]
            s3_path = s3.write_events(
                prefix=job.s3_prefix,
                table_name=job.source_table,
                events=events,
                batch_id=batch_id,
            )
        elif job.output_format == "csv":
            s3_path = s3.write_csv(
                prefix=job.s3_prefix,
                table_name=job.source_table,
                columns=result.columns,
                rows=result.rows,
                batch_id=batch_id,
            )
        else:
            s3_path = s3.write_jsonl(
                prefix=job.s3_prefix,
                table_name=job.source_table,
                columns=result.columns,
                rows=result.rows,
                batch_id=batch_id,
            )

        # Update tracking, log, and job state (parity with _watch_poll)
        log.status = "completed"
        log.rows_captured = len(result.rows)
        log.s3_path = s3_path
        log.finished_at = datetime.now(timezone.utc)

        job.status = CDCStatus.IDLE
        job.last_sync_at = datetime.now(timezone.utc)
        job.last_value = result.new_last_value
        job.total_rows_synced = (job.total_rows_synced or 0) + len(result.rows)
        job.error_message = None

        db.commit()
    finally:
        db.close()


def __import_transient_exceptions():
    """Lazy-import transient exception types so psycopg2 isn't imported at
    module load time in tests that don't need it."""
    import psycopg2
    return (
        psycopg2.OperationalError,
        psycopg2.InterfaceError,
        ConnectionError,
        TimeoutError,
    )
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_cdc_watcher.py -v
pytest tests/test_cdc_service.py -v
pytest -q
```

Expected: new watcher tests pass; existing cdc tests still pass; full suite green.

If existing `test_cdc_service.py::test_sync_with_*` fail, they're testing the old `_run_sync` shape — inspect and update them to reference the new `_poll_once` pattern or assert the same end-state via the new path. The behavior contract (status transitions, error_message) is preserved by design.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cdc_service.py backend/tests/test_cdc_watcher.py
git commit -m "feat(cdc): _poll_once extraction + _watch_poll long-running loop

- _poll_once: pure query+serialize, no DB/S3 side effects
- _watch_poll: loop with status-check + output_format branching +
  sync-log row appended per iteration + cancel-via-status on next
  iteration + sleep indirection (_watcher_sleep) for testability
- _run_sync (one-shot) rewritten to delegate to _poll_once + same
  write-branch logic; preserves Celery retry behavior

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 · Control Endpoints

### Task 8: `cancel_job` + `start_job` service functions + router wiring

**Files:**
- Modify: `backend/app/services/cdc_service.py`
- Modify: `backend/app/routers/cdc.py`
- Create: `backend/tests/test_cdc_control_endpoints.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_cdc_control_endpoints.py`:

```python
"""HTTP tests for POST /api/cdc/jobs/{id}/start and /stop endpoints."""
from __future__ import annotations

import uuid

import pytest

from app.core.encryption import encrypt_config
from app.models.cdc_job import CDCJob, CDCKind, CDCStatus
from app.models.connector import Connector, ConnectorType


def _make_connector(db):
    c = Connector(
        name="pg",
        connector_type=ConnectorType.POSTGRESQL,
        connection_config={"encrypted": encrypt_config({"host": "x"})},
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


def _make_job(db, connector_id, status=CDCStatus.IDLE):
    j = CDCJob(
        name="j", connector_id=connector_id, cdc_kind=CDCKind.POLL,
        source_schema="public", source_table="users", tracking_column="id",
        s3_bucket="b", s3_prefix="cdc/", s3_region="us-east-1",
        output_format="event-jsonl", status=status,
    )
    db.add(j); db.commit(); db.refresh(j)
    return j


def test_start_job_transitions_to_running(client, db):
    c = _make_connector(db)
    j = _make_job(db, c.id, status=CDCStatus.IDLE)

    resp = client.post(f"/api/cdc/jobs/{j.id}/start")
    assert resp.status_code == 202

    db.refresh(j)
    assert j.status == CDCStatus.RUNNING


def test_stop_job_revokes_and_transitions_to_idle(client, db, monkeypatch):
    from app.celery_app import celery_app

    revoke_calls = []
    monkeypatch.setattr(
        celery_app.control, "revoke",
        lambda task_id, terminate=False, signal=None: revoke_calls.append(
            (task_id, terminate, signal)
        ),
    )

    c = _make_connector(db)
    j = _make_job(db, c.id, status=CDCStatus.RUNNING)
    j.celery_task_id = "abc-123"
    db.commit()

    resp = client.post(f"/api/cdc/jobs/{j.id}/stop")
    assert resp.status_code == 200

    db.refresh(j)
    assert j.status == CDCStatus.IDLE
    assert j.celery_task_id is None
    assert revoke_calls == [("abc-123", True, "SIGTERM")]


def test_start_job_404_on_missing_id(client):
    resp = client.post(f"/api/cdc/jobs/{uuid.uuid4()}/start")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests**

```bash
pytest tests/test_cdc_control_endpoints.py -v
```

Expected: 3 tests fail (routes not defined).

- [ ] **Step 3: Add `start_job` and `cancel_job` to `cdc_service.py`**

Append to `backend/app/services/cdc_service.py`:

```python
def start_job(db: Session, job: CDCJob) -> CDCJob:
    """Flip a CDC job to RUNNING. The scheduler's next tick will dispatch
    a cdc.watch task for it (see scheduler_service._dispatch_orphaned_watchers)."""
    job.status = CDCStatus.RUNNING
    job.error_message = None
    db.commit()
    db.refresh(job)
    return job


def cancel_job(db: Session, job: CDCJob) -> CDCJob:
    """Stop a CDC job: revoke the running watcher task (if any), set status=IDLE."""
    if job.celery_task_id:
        from app.celery_app import celery_app

        try:
            celery_app.control.revoke(
                job.celery_task_id, terminate=True, signal="SIGTERM"
            )
            logger.info(
                "Revoked cdc.watch task %s for job %s",
                job.celery_task_id, job.id,
            )
        except Exception:
            logger.exception(
                "Failed to revoke cdc.watch task %s", job.celery_task_id
            )

    job.status = CDCStatus.IDLE
    job.celery_task_id = None
    db.commit()
    db.refresh(job)
    return job
```

- [ ] **Step 4: Add routes in `backend/app/routers/cdc.py`**

Append to the router:

```python
@router.post("/jobs/{job_id}/start", response_model=CDCJobResponse, status_code=202)
def start_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Flip the job to RUNNING. Scheduler will dispatch a watcher on next tick."""
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return cdc_service.start_job(db, job)


@router.post("/jobs/{job_id}/stop", response_model=CDCJobResponse)
def stop_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Stop a running watcher: revoke the Celery task, set status=IDLE."""
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return cdc_service.cancel_job(db, job)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_cdc_control_endpoints.py -v
pytest -q
```

Expected: 3 new tests pass; full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/cdc_service.py backend/app/routers/cdc.py backend/tests/test_cdc_control_endpoints.py
git commit -m "feat(cdc): POST /jobs/{id}/start + /stop control endpoints

- start_job flips status to RUNNING; scheduler picks it up
- cancel_job revokes the cdc.watch task (SIGTERM) and sets status=IDLE
- Swallows broker revoke errors so DB state still updates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 · Scheduler Re-Dispatch

### Task 9: `_dispatch_orphaned_watchers` in scheduler_service

**Files:**
- Modify: `backend/app/services/scheduler_service.py`
- Create: `backend/tests/test_cdc_scheduler_orphan.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_cdc_scheduler_orphan.py`:

```python
"""Tests for _dispatch_orphaned_watchers scheduler tick."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.encryption import encrypt_config
from app.models.cdc_job import CDCJob, CDCKind, CDCStatus
from app.models.connector import Connector, ConnectorType
from app.services import scheduler_service


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def patch_session(monkeypatch):
    monkeypatch.setattr(scheduler_service, "SessionLocal", _TestSessionLocal)


def _seed(db):
    c = Connector(
        name="pg", connector_type=ConnectorType.POSTGRESQL,
        connection_config={"encrypted": encrypt_config({"host": "x"})},
    )
    db.add(c); db.commit(); db.refresh(c)
    j = CDCJob(
        name="j", connector_id=c.id, cdc_kind=CDCKind.POLL,
        source_schema="public", source_table="users", tracking_column="id",
        s3_bucket="b", s3_prefix="cdc/", s3_region="us-east-1",
        output_format="event-jsonl", status=CDCStatus.RUNNING,
        celery_task_id=None,
    )
    db.add(j); db.commit(); db.refresh(j)
    return c, j


def test_orphan_detection_enqueues_watcher_for_running_job_without_task(
    db, monkeypatch
):
    c, j = _seed(db)

    apply_async_calls = []

    class _FakeTask:
        @staticmethod
        def apply_async(args=None, task_id=None):
            apply_async_calls.append({"args": args, "task_id": task_id})

    monkeypatch.setattr(
        "app.tasks.cdc_watch_task", _FakeTask, raising=False
    )

    # Inspector: no active tasks anywhere
    class _Inspector:
        def active(self): return {"worker1": []}
        def reserved(self): return {"worker1": []}
        def scheduled(self): return {"worker1": []}

    class _Control:
        def inspect(self, timeout=1.0): return _Inspector()

    monkeypatch.setattr(scheduler_service, "_celery_control",
                        lambda: _Control())

    scheduler_service._dispatch_orphaned_watchers()

    assert len(apply_async_calls) == 1
    assert apply_async_calls[0]["args"] == (str(j.id),)
    new_task_id = apply_async_calls[0]["task_id"]
    assert new_task_id is not None

    # job.celery_task_id now populated
    db.refresh(j)
    assert j.celery_task_id == new_task_id


def test_orphan_detection_skips_when_inspect_returns_none(db, monkeypatch):
    """If inspect() returns no response (broker down), do nothing this tick."""
    _seed(db)

    apply_async_calls = []

    class _FakeTask:
        @staticmethod
        def apply_async(args=None, task_id=None):
            apply_async_calls.append({"args": args, "task_id": task_id})

    monkeypatch.setattr(
        "app.tasks.cdc_watch_task", _FakeTask, raising=False
    )

    class _NullInspector:
        def active(self): return None
        def reserved(self): return None
        def scheduled(self): return None

    class _Control:
        def inspect(self, timeout=1.0): return _NullInspector()

    monkeypatch.setattr(scheduler_service, "_celery_control",
                        lambda: _Control())

    scheduler_service._dispatch_orphaned_watchers()
    assert apply_async_calls == []
```

- [ ] **Step 2: Run tests**

```bash
pytest tests/test_cdc_scheduler_orphan.py -v
```

Expected: both fail — `_dispatch_orphaned_watchers` not defined.

- [ ] **Step 3: Update `backend/app/services/scheduler_service.py`**

Add at the top of the file (after existing imports):

```python
import uuid
from app.celery_app import celery_app
from app.models.cdc_job import CDCJob, CDCStatus
```

Add these helpers near the bottom of the file (after the existing `_check_and_trigger`):

```python
def _celery_control():
    """Indirection for test mocking."""
    return celery_app.control


def _collect_active_task_ids(inspector) -> Optional[set]:
    """Gather active+reserved+scheduled task IDs across workers.

    Returns None if the inspector reports no response (broker likely down)
    so the caller can skip this tick rather than re-dispatch blind.
    """
    collected = set()
    for getter in ("active", "reserved", "scheduled"):
        try:
            resp = getattr(inspector, getter)()
        except Exception:
            return None
        if resp is None:
            return None
        for _worker, tasks in resp.items():
            for t in tasks or []:
                tid = t.get("id") if isinstance(t, dict) else None
                if tid:
                    collected.add(tid)
    return collected


def _dispatch_orphaned_watchers() -> None:
    """Find CDC jobs in RUNNING state whose celery_task_id is missing or
    not actively processed, and re-dispatch a cdc.watch task for each."""
    control = _celery_control()
    try:
        inspector = control.inspect(timeout=1.0)
    except Exception:
        logger.exception("Scheduler: celery inspect failed, skipping orphan check")
        return

    active_ids = _collect_active_task_ids(inspector)
    if active_ids is None:
        logger.warning("Scheduler: celery inspect returned no response; skipping")
        return

    # Lazy import to avoid celery_app pulling at module load
    from app.tasks import cdc_watch_task

    db = SessionLocal()
    try:
        orphans = (
            db.query(CDCJob)
            .filter(CDCJob.status == CDCStatus.RUNNING)
            .all()
        )
        for job in orphans:
            if job.celery_task_id and job.celery_task_id in active_ids:
                continue  # actively processed
            task_id = str(uuid.uuid4())
            job.celery_task_id = task_id
            db.commit()
            cdc_watch_task.apply_async(args=(str(job.id),), task_id=task_id)
            logger.info("Scheduler: dispatched cdc.watch for orphan job %s (task_id=%s)",
                        job.id, task_id)
    finally:
        db.close()
```

Finally, extend `_check_and_trigger` to also call the orphan check (at the end of its body):

```python
def _check_and_trigger() -> None:
    # ... existing pipeline scheduling logic unchanged ...

    try:
        _dispatch_orphaned_watchers()
    except Exception:
        logger.exception("Scheduler: orphan dispatch failed")
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_cdc_scheduler_orphan.py -v
pytest -q
```

Expected: 2 new tests pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/scheduler_service.py backend/tests/test_cdc_scheduler_orphan.py
git commit -m "feat(cdc): scheduler re-dispatches orphaned cdc.watch tasks

Every 30-second scheduler tick now also inspects celery for active
task IDs, finds CDC jobs in RUNNING state whose celery_task_id is
missing or not actively processed, and enqueues a fresh cdc.watch
with a pre-generated task_id. Broker failure (inspect returns None)
causes the tick to skip without re-dispatch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 · Documentation + Final Verification

### Task 10: User-facing event schema reference

**Files:**
- Create: `docs/cdc-event-schema.md`

- [ ] **Step 1: Write `docs/cdc-event-schema.md`**

```markdown
# CDC Event-Log Schema (v2)

All CDC kinds (`poll`, `pg_wal`, `mongo_change_stream`) can emit to a shared
event-log format when `output_format="event-jsonl"`. Each S3 object is a
UTF-8 JSONL file (one JSON object per line).

## Location

```
<s3_bucket>/<s3_prefix>/<table>/year=YYYY/month=MM/day=DD/<batch_id>.jsonl
```

`<batch_id>` is an 8-character hex string unique per batch.

## Event shape

```json
{
  "_op":      "insert" | "update" | "delete" | "replace" | "upsert",
  "_table":   "<schema>.<table>",
  "_ts":      "2026-04-19T14:22:01.234Z",
  "_position": "<lsn|resume_token|tracking_value>",
  "_kind":    "pg_wal" | "mongo_change_stream" | "poll",
  "before":   { ... } | null,
  "after":    { ... } | null,
  "updated_fields": [ "col1", "col2" ] | null
}
```

### Field reference

| Field | Type | Description |
|---|---|---|
| `_op` | string | One of `insert`, `update`, `delete`, `replace`, `upsert` |
| `_table` | string | Fully-qualified table/collection name |
| `_ts` | ISO-8601 | Event capture timestamp (UTC, millisecond precision) |
| `_position` | string | Source-native position: WAL LSN (`"0/3D3F490"`), Mongo BSON resume token (hex), or poll tracking-column value |
| `_kind` | string | Which CDC mechanism produced this event |
| `before` | object\|null | Row state before the change (null for `insert`, may be null for `update`/`delete` if unavailable) |
| `after` | object\|null | Row state after the change (null for `delete`) |
| `updated_fields` | array\|null | Names of fields that changed; present only when the source reports it (PG `REPLICA IDENTITY FULL`, Mongo `updateDescription`) |

### Rules per op

| `_op` | `before` | `after` | Emitted by |
|---|---|---|---|
| `insert` | `null` | row | `pg_wal`, `mongo_change_stream` |
| `update` | pre-image or `null` | post-image | `pg_wal`, `mongo_change_stream` |
| `replace` | pre-image or `null` | full replacement document | `mongo_change_stream` only |
| `delete` | pre-image or `null` | `null` | `pg_wal`, `mongo_change_stream` |
| `upsert` | `null` | observed row | `poll` only |

### Value serialization rules

- `datetime` → ISO-8601 string
- `bytes` → lowercase hex
- nested `dict`/`list` → pass through as JSON (consumers receive structured data)
- `null` → JSON `null`

## Relation to legacy row-snapshot format

Jobs with `output_format="jsonl"` or `output_format="csv"` continue to emit
the legacy row-snapshot format (one serialized row per object, no `_op`
discriminator). See the pre-v2 behavior in commit history if you need the
exact spec. Existing poll jobs are not migrated; they keep the legacy format
until a user opts into `"event-jsonl"`.

WAL and Mongo kinds must use `"event-jsonl"` — they cannot emit legacy
row-snapshots because their semantics don't map cleanly.

## Downstream consumer hint

For `pg_wal` and `mongo_change_stream` kinds, treat consecutive events
with the same `_table` and `_position` as the same logical change (deduplication
hedge against replay). For `poll` kind, each emission is idempotent over
its `_position` (a given tracking value is only seen once across syncs).
```

- [ ] **Step 2: Commit**

```bash
git add docs/cdc-event-schema.md
git commit -m "docs: CDC event-log schema reference

Documents the shared JSONL schema emitted by poll/WAL/Mongo kinds when
output_format=event-jsonl, including field semantics, op rules, and
serialization conventions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Update README + CLAUDE.md + roadmap

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/roadmap.md`

- [ ] **Step 1: Update README.md**

Find the Roadmap section and update the CDC-v2 foundation status:

Replace:
```markdown
- [ ] **Phase 3b** — WAL-based CDC for PostgreSQL (logical replication; captures deletes, no row-miss window)
- [ ] **Phase 3c** — MongoDB support: new `MongoConnector` + CDC via Change Streams (native `resume_token`, captures insert/update/replace/delete)
```

With:
```markdown
- [x] **Phase 3a.1** — CDC v2 foundation (CDCKind discriminator, event-log schema, cdc.watch watcher pattern; unblocks 3b/3c)
- [ ] **Phase 3b** — WAL-based CDC for PostgreSQL (logical replication; captures deletes, no row-miss window)
- [ ] **Phase 3c** — MongoDB support: new `MongoConnector` + CDC via Change Streams (native `resume_token`, captures insert/update/replace/delete)
```

Also add a new row in the Tech Stack or API Endpoints table — mention the new `POST /api/cdc/jobs/{id}/start` and `/stop` endpoints:

Append to the API Endpoints table:

```markdown
| POST   | `/api/cdc/jobs/{id}/start`                                 | Flip CDC job to RUNNING (scheduler dispatches watcher) |
| POST   | `/api/cdc/jobs/{id}/stop`                                  | Stop watcher (revoke Celery task, set IDLE)          |
```

- [ ] **Step 2: Update CLAUDE.md**

In the "Forward-Looking Conventions" section, update the `Phase 3b / 3c` bullet to reflect that the foundation is now shipped:

Replace the bullet that starts `**Phase 3b / 3c (WAL + Change Streams):**` with:

```markdown
- **Phase 3b / 3c (WAL + Change Streams):** The CDC v2 foundation (CDCKind enum, resume_token, operation_filter, event-log JSONL schema, cdc.watch long-running task) is **shipped**. Spec #2 (WAL) implements `_watch_pg_wal` on top of this; Spec #3 (Mongo) implements `_watch_mongo` + adds `MongoConnector`. Event schema is locked: see `docs/cdc-event-schema.md`.
```

- [ ] **Step 3: Update `docs/superpowers/roadmap.md`**

In the Status snapshot table, add a new row under the shipped items:

```markdown
| 3a.1 | CDC v2 foundation (CDCKind enum, event-log schema, watcher pattern, start/stop control) | ✅ shipped |
```

And in the "Phase 3b — WAL-based CDC" section, replace the "Prerequisites" block with:

```markdown
**Prerequisites:** ✅ Met. The CDC v2 foundation (CDCKind enum, resume_token, operation_filter, event-log S3 schema, cdc.watch task pattern, scheduler orphan dispatch) shipped as Phase 3a.1.
```

Same edit for Phase 3c.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/superpowers/roadmap.md
git commit -m "docs: mark CDC v2 foundation shipped across README, CLAUDE.md, roadmap

- README roadmap adds Phase 3a.1 as shipped; API endpoints table
  documents /start and /stop
- CLAUDE.md Forward-Looking Conventions note that WAL/Mongo now only
  need their kind-specific implementations
- roadmap.md Status snapshot gains 3a.1 row; 3b and 3c Prerequisites
  updated to reflect met-status

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Full-app smoke + PR

- [ ] **Step 1: Run all backend tests**

```bash
cd /Users/anchitgupta/data-builder/backend && source .venv/bin/activate && pytest -q
```

Expected: 112 original + ~16 new = ~128 tests green.

- [ ] **Step 2: Run frontend build**

```bash
cd /Users/anchitgupta/data-builder/frontend && pnpm run build
```

Expected: exit 0. (Frontend wasn't modified, but `CDCJobResponse` gained fields that TypeScript typing may reject — if it does, it's because the frontend `type CDCJob` needs the new optional fields added. If the build is green, no change needed.)

- [ ] **Step 3: Live dev-server smoke**

Start backend + frontend:

```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2
cd frontend && pnpm run dev

# Terminal 3 (for Celery worker)
cd backend && source .venv/bin/activate && celery -A app.celery_app worker --loglevel=info --concurrency=4
```

Then in a browser at `http://localhost:5173`:

1. CDC page loads, existing jobs visible, zero console errors
2. Create a new poll job with `tracking_column="id"`, `output_format="event-jsonl"` — verify it saves
3. Trigger `POST /api/cdc/jobs/<id>/start` via `curl`:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/cdc/jobs/<id>/start
   ```
   Response: 202 with status="running"
4. Watch the Celery worker log — should see a `cdc.watch` task picked up within ~30s (scheduler tick)
5. Verify one S3 object written to the expected path (check the bucket)
6. Trigger `POST /api/cdc/jobs/<id>/stop`:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/cdc/jobs/<id>/stop
   ```
   Response: 200 with status="idle". Worker log shows task revoked.
7. Test legacy `output_format="jsonl"` job still works with the one-shot `POST /sync` endpoint

- [ ] **Step 4: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore(cdc): final smoke polish" || true
```

- [ ] **Step 5: Push branch + open PR**

```bash
git push -u origin cdc-v2-foundation
gh pr create --base main --head cdc-v2-foundation --title "feat: CDC v2 foundation" --body "$(cat <<'EOF'
## Summary

Shared foundation for WAL-based PG CDC (future Spec #2) and MongoDB
Change Streams CDC (future Spec #3). Backend-only. Existing poll jobs
continue emitting legacy row-snapshot format unchanged (versioned path).

**Spec:** `docs/superpowers/specs/2026-04-19-cdc-v2-foundation-design.md`

## What shipped

- `CDCKind` enum (poll / pg_wal / mongo_change_stream) with kind-aware Pydantic validation
- New columns: `resume_token`, `operation_filter`, `checkpoint_interval_seconds`, `celery_task_id`; `tracking_column` now nullable
- Alembic migration (forward + backward tested)
- Event-log JSONL schema via `app.services.cdc_events` builders
- `S3Writer.write_events` method for event-log output
- Long-running `cdc.watch` Celery task + `_run_watcher` dispatch
- `_watch_poll` loop with cancel-via-status + output_format branching
- `_watch_pg_wal` and `_watch_mongo` stubs (raise `NotImplementedError` pointing at future specs)
- `POST /api/cdc/jobs/{id}/start` and `/stop` control endpoints
- Scheduler orphan dispatch: finds RUNNING jobs with no active Celery task, re-dispatches
- `docs/cdc-event-schema.md` reference

## Test plan

- [x] `pytest` — 112 existing + ~16 new tests green
- [x] `pnpm run build` — green
- [x] Alembic forward + backward round-trip on local Postgres
- [x] Live smoke: new `/start` + `/stop` endpoints; event-jsonl job writes to S3; legacy jsonl job unchanged

## Follow-ups unlocked

- Spec #2: WAL-based PG CDC (implements `_watch_pg_wal`)
- Spec #3: MongoDB + Change Streams (implements `_watch_mongo` + `MongoConnector`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Final cleanup**

Post-merge: delete the feature branch locally:

```bash
git checkout main
git pull origin main
git branch -d cdc-v2-foundation
```

---

## Definition of Done

- [ ] `CDCKind` enum + v2 columns live on `cdc_jobs` with per-kind Pydantic validation
- [ ] Alembic migration runs forward and backward cleanly on local Postgres
- [ ] `S3Writer.write_events` implemented + unit-tested
- [ ] `app.services.cdc_events` module with builders for `poll`, `pg_wal`, `mongo_change_stream`
- [ ] `cdc.watch` Celery task wired; `_watch_poll` implements the full loop with cancel + legacy output_format
- [ ] `_watch_pg_wal` / `_watch_mongo` stubs raise `NotImplementedError` with spec pointers
- [ ] `POST /api/cdc/jobs/{id}/start` and `/stop` endpoints live
- [ ] Scheduler re-dispatches orphaned `cdc.watch` tasks on worker restart
- [ ] `docs/cdc-event-schema.md` written; README + CLAUDE.md + roadmap updated
- [ ] All 112 existing backend tests + ~16 new tests pass
- [ ] `pnpm run build` green
- [ ] Live smoke: start/stop + event-jsonl emission + legacy jsonl backward compat all verified
- [ ] PR opened linking the spec; merged to main

---

## Self-Review Checklist (for plan author)

### Spec coverage

| Spec section | Plan task(s) |
|---|---|
| §1 Intent & Scope | All tasks |
| §2 Data Model & Migration | Task 1, Task 2 |
| §2.3 API validation | Task 3 |
| §3 Event-Log Output Schema | Task 4 (builders), Task 10 (reference doc) |
| §4.1 cdc.watch task | Task 6 |
| §4.2 Watcher dispatch | Task 6 |
| §4.3 Cancel semantics | Task 8 |
| §4.4 Checkpoint cadence | Task 7 (poll implicit: one commit per cycle) |
| §4.5 Re-dispatch on restart | Task 9 |
| §5 S3 Writer refactor | Task 5 |
| §6 Poll path migration | Task 7 |
| §7 Testing | Tasks 1-9 (TDD for each) |
| §8 Migration & Rollout Notes | Task 11 |
| §10 DoD | Task 12 |

All spec sections map to tasks.

### Placeholder scan

- No `TBD`, `TODO`, `implement later`, or `fill in details`
- No "add appropriate error handling" without showing the handler
- Every code step includes full code
- Every shell step includes the exact command

### Type consistency

- `CDCKind` enum spelled consistently across Tasks 1, 3, 6, 7
- `PollResult` dataclass from Task 7 used in Tasks 7 only
- `_watcher_sleep` function from Task 7 mockable in tests
- Event builder names (`build_poll_upsert_event`, `build_wal_event`, `build_mongo_event`) from Task 4 match Task 7 usage
- `cdc_watch_task` from Task 6 matches Task 9 import path

### Scope fit

Plan is ~12 tasks with TDD per task. Each task is self-contained and commits independently. Plan does not try to do WAL or Mongo work — those are separate future specs per the source spec §10.

**Plan is complete and self-consistent.**
