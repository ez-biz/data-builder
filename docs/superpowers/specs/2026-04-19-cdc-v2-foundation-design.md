# CDC v2 Foundation — Design

**Date:** 2026-04-19
**Status:** Design — ready for implementation planning
**Part of:** Phase 3b + 3c foundation (split per `docs/superpowers/roadmap.md`)

---

## 1 · Intent & Scope

Establish the shared data model, task dispatch pattern, and output schema that both **WAL-based PostgreSQL CDC** (future Spec #2) and **MongoDB Change Streams CDC** (future Spec #3) will build on.

By itself this foundation ships nothing user-visible; its value is that it enables WAL and Change Streams to be small incremental additions rather than parallel systems.

### In scope

- `CDCKind` discriminator enum on `CDCJob` and supporting columns (`resume_token`, `operation_filter`)
- Event-log JSONL output schema covering all CDC kinds
- Long-running `cdc.watch` Celery task pattern with cancel + checkpoint semantics
- Refactor existing one-shot `_run_sync` (poll) into a `_poll_once` + `_watch_poll` loop using the new task pattern
- `S3Writer.write_events` method alongside the existing `write_jsonl` / `write_csv`
- Scheduler-driven re-dispatch on worker restart

### Out of scope

- WAL consumer implementation (Spec #2)
- MongoDB connector + Change Streams (Spec #3)
- UI form changes (each CDC kind ships its form fields in its own spec)
- DDL / schema-change event capture
- Auth layer

### Ship criteria

- Existing poll jobs continue to emit the legacy row-snapshot format with zero user-observed change (versioned path — see §3.2)
- `output_format="event-jsonl"` available opt-in for poll, required for WAL/Mongo
- `CDCKind.POLL` path is feature-equivalent to today, both in legacy and event-jsonl modes
- All 112 existing backend tests remain green
- New event-schema + watcher tests (~10) pass
- Alembic migration runs forward and backward cleanly on local Postgres

## 2 · Data Model & Alembic Migration

### 2.1 Enum and column additions

```python
# backend/app/models/cdc_job.py

class CDCKind(str, enum.Enum):
    POLL = "poll"
    PG_WAL = "pg_wal"
    MONGO_CHANGE_STREAM = "mongo_change_stream"


class CDCJob(UUIDMixin, TimestampMixin, Base):
    # ... existing fields unchanged ...

    cdc_kind: Mapped[CDCKind] = mapped_column(
        SQLEnum(CDCKind), nullable=False, default=CDCKind.POLL
    )

    # Opaque checkpoint. WAL LSN as hex string; BSON resume token hex-encoded.
    # None for poll kind (poll uses last_value).
    resume_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Which op types to emit. None = all applicable for the kind.
    # Ignored for poll (always emits "upsert"). Stored as JSON list of strings.
    operation_filter: Mapped[Optional[list[str]]] = mapped_column(
        JSON, nullable=True
    )

    # tracking_column becomes Optional (required only for POLL kind; validated at API)
    tracking_column: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True  # previously nullable=False
    )

    # Checkpoint cadence override (seconds). Default 10s for WAL/Mongo; ignored for poll.
    checkpoint_interval_seconds: Mapped[int] = mapped_column(default=10)

    # Celery task_id of the currently-running cdc.watch task. Used by
    # cancel_job to revoke and by scheduler re-dispatch to detect orphans.
    # Mirrors PipelineRun.celery_task_id.
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
```

`output_format` remains a `String` (no DB-level enum) because allowed values depend on `cdc_kind`:

- `"jsonl"` — legacy row-snapshot, poll only
- `"csv"` — legacy row-snapshot, poll only
- `"event-jsonl"` — new event-log format; opt-in for poll, required for WAL/Mongo

### 2.2 Alembic migration (`add_cdc_v2_foundation`)

```python
def upgrade() -> None:
    cdc_kind = sa.Enum("poll", "pg_wal", "mongo_change_stream", name="cdckind")
    cdc_kind.create(op.get_bind(), checkfirst=True)

    op.add_column("cdc_jobs",
        sa.Column("cdc_kind", cdc_kind, nullable=False, server_default="poll"))
    op.add_column("cdc_jobs",
        sa.Column("resume_token", sa.Text(), nullable=True))
    op.add_column("cdc_jobs",
        sa.Column("operation_filter", sa.JSON(), nullable=True))
    op.add_column("cdc_jobs",
        sa.Column("checkpoint_interval_seconds", sa.Integer(),
                  nullable=False, server_default="10"))
    op.add_column("cdc_jobs",
        sa.Column("celery_task_id", sa.String(length=100), nullable=True))
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

### 2.3 API validation (Pydantic)

`CDCJobCreate` / `CDCJobUpdate` enforce kind-specific rules before persistence:

- `cdc_kind=POLL`
  - `tracking_column` required
  - `output_format ∈ {"jsonl", "csv", "event-jsonl"}`
  - `resume_token`, `operation_filter` ignored (set to None)
- `cdc_kind=PG_WAL`
  - `tracking_column` must be None (or rejected with 422)
  - `operation_filter` defaults to `["insert", "update", "delete"]`
  - `output_format` forced to `"event-jsonl"` (reject other values)
- `cdc_kind=MONGO_CHANGE_STREAM`
  - Same as PG_WAL; default `operation_filter` includes `"replace"` → `["insert", "update", "replace", "delete"]`

Validation lives in `backend/app/schemas/cdc.py` via Pydantic `model_validator`. Attach clear error messages referencing which field is invalid and why.

## 3 · Event-Log Output Schema

### 3.1 Event shape

One JSON object per line in a `.jsonl` file. S3 path convention unchanged:

```
<s3_bucket>/<s3_prefix>/<table>/year=YYYY/month=MM/day=DD/<batch-id>.jsonl
```

Every event:

```json
{
  "_op":      "insert" | "update" | "delete" | "replace" | "upsert",
  "_table":   "public.users",
  "_ts":      "2026-04-19T14:22:01.234Z",
  "_position": "0/3D3F490",
  "_kind":    "pg_wal" | "mongo_change_stream" | "poll",
  "before":   { "id": 42, "name": "Alice" } | null,
  "after":    { "id": 42, "name": "Alice Jr." } | null,
  "updated_fields": [ "name" ] | null
}
```

Rules per op:

| `_op` | `before` | `after` | emitted by |
|---|---|---|---|
| `insert` | `null` | row | `pg_wal`, `mongo_change_stream` |
| `update` | pre-image row (or `null` if unavailable) | post-image row | `pg_wal`, `mongo_change_stream` |
| `replace` | pre-image row (or `null`) | full replacement document | `mongo_change_stream` only |
| `delete` | pre-image row (or `null`) | `null` | `pg_wal`, `mongo_change_stream` |
| `upsert` | `null` (poll cannot see pre-image) | row as observed | `poll` only |

**`_position`** encoding:
- `pg_wal` → LSN as `"X/Y"` hex string (native PG format)
- `mongo_change_stream` → BSON resume token hex-encoded
- `poll` → `str(tracking_col_value_of_last_row_in_batch)`

**`_ts`** — event observation timestamp, ISO-8601 UTC with milliseconds, generated at capture time.

**`updated_fields`** — optional, only populated when the source tells us which fields changed (WAL with `REPLICA IDENTITY FULL`, or Mongo `updateDescription.updatedFields`). Otherwise `null`.

### 3.2 Output format selection (versioned path)

Per Decision 2 resolved in brainstorming, the legacy row-snapshot format stays. Users opt into the new format per job:

| `cdc_kind` | `output_format` default | Legal values |
|---|---|---|
| `poll` (existing jobs) | `"jsonl"` (unchanged, pre-migration value) | `"jsonl"`, `"csv"`, `"event-jsonl"` |
| `poll` (new jobs) | `"event-jsonl"` | `"jsonl"`, `"csv"`, `"event-jsonl"` |
| `pg_wal` | `"event-jsonl"` | `"event-jsonl"` only |
| `mongo_change_stream` | `"event-jsonl"` | `"event-jsonl"` only |

No S3 path versioning (no `/v1/` or `/v2/` inserted). Users can tell formats apart by file contents; prefix configuration per job lets users route the two formats to different buckets if needed.

### 3.3 Serialization helpers

Reuse existing `s3_writer._serialize_value`:
- `None` → `null`
- `datetime` → ISO-8601 string
- `bytes` → lowercase hex
- `dict` / `list` → pass through (become nested JSON)

Called recursively on each field of `before` and `after`.

## 4 · Long-running Task Pattern

### 4.1 New task `cdc.watch`

Replaces one-shot `cdc.sync` as the default dispatch for running CDC jobs. The existing one-shot `cdc.sync` task remains for manual `POST /sync` and `POST /snapshot` invocations (one-off triggers) so users can force a sync without flipping a job to `RUNNING`.

```python
# backend/app/tasks.py

class _CDCWatchTask(celery_app.Task):
    # No autoretry — the task is long-lived; errors are handled inside the watcher.
    acks_late = True
    reject_on_worker_lost = True


@celery_app.task(bind=True, name="cdc.watch", base=_CDCWatchTask)
def cdc_watch_task(self, job_id: str) -> None:
    from app.services.cdc_service import _run_watcher
    _run_watcher(self, uuid.UUID(job_id))
```

### 4.2 Watcher dispatch

```python
def _run_watcher(task, job_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        job = db.query(CDCJob).filter_by(id=job_id).first()
        if not job or job.status != CDCStatus.RUNNING:
            logger.info("cdc.watch: job %s not running, exiting", job_id)
            return

        if job.cdc_kind == CDCKind.POLL:
            _watch_poll(task, db, job)
        elif job.cdc_kind == CDCKind.PG_WAL:
            _watch_pg_wal(task, db, job)       # stub in this spec; implemented in Spec #2
        elif job.cdc_kind == CDCKind.MONGO_CHANGE_STREAM:
            _watch_mongo(task, db, job)        # stub; implemented in Spec #3
        else:
            raise ValueError(f"unknown cdc_kind: {job.cdc_kind}")
    finally:
        db.close()
```

In this foundation spec, `_watch_pg_wal` and `_watch_mongo` are **stub functions** that raise `NotImplementedError("Spec #2/#3")`. They exist so the dispatch contract is locked now.

### 4.3 Cancel semantics

`POST /api/cdc/jobs/{id}/stop` (new endpoint) calls `cancel_job(db, job)`:

```python
def cancel_job(db: Session, job: CDCJob) -> CDCJob:
    if job.celery_task_id:
        try:
            celery_app.control.revoke(
                job.celery_task_id, terminate=True, signal="SIGTERM"
            )
        except Exception:
            logger.exception("Failed to revoke CDC watcher task %s", job.celery_task_id)

    job.status = CDCStatus.IDLE
    job.celery_task_id = None
    db.commit()
    db.refresh(job)
    return job
```

The watcher's inner loop is structured to catch the `SIGTERM` (via a global `signal.signal(SIGTERM, …)` handler registered at watcher start) and break out after committing a final checkpoint. Pattern mirrors the proven `cancel_run` flow for pipeline runs (commit `62f6a62` / `26519ac`).

**Race protection:** `_run_watcher` re-reads `job.status` once per iteration of the inner loop; if it sees anything other than `RUNNING`, it commits and exits. This catches cancels that revoke fails to deliver (e.g., broker down).

Also requires a new `CDCJob.celery_task_id: Mapped[Optional[str]] = mapped_column(String(100))` column, mirrored after `PipelineRun.celery_task_id`. Added in the same migration as §2.2.

### 4.4 Checkpoint cadence

**WAL / Mongo watchers** commit a checkpoint (`resume_token`, `last_sync_at`, `total_rows_synced` increment) whichever comes first of:

- **N = 1000 events** since last checkpoint, OR
- **M = `job.checkpoint_interval_seconds`** (default 10) seconds since last checkpoint

The constant N = 1000 is defined as `CDC_CHECKPOINT_EVENT_THRESHOLD` in `cdc_service.py`; M is per-job.

**Poll watcher** commits once per sync cycle (at the end of each `sync_interval_seconds` iteration), which is effectively the same contract applied at a coarser granularity. `checkpoint_interval_seconds` is ignored for poll.

### 4.5 Re-dispatch on worker restart

The existing `scheduler_service` 30-second tick extends to:

```python
def _dispatch_orphaned_watchers(db: Session) -> None:
    """Enqueue cdc.watch for any RUNNING job whose task is not actively
    being processed by any worker."""
    from app.tasks import cdc_watch_task

    inspector = celery_app.control.inspect(timeout=1.0)
    active_task_ids = _collect_active_task_ids(inspector) or set()

    orphans = (
        db.query(CDCJob)
        .filter(CDCJob.status == CDCStatus.RUNNING)
        .filter(or_(
            CDCJob.celery_task_id.is_(None),
            CDCJob.celery_task_id.notin_(active_task_ids),
        ))
        .all()
    )
    for job in orphans:
        task_id = str(uuid.uuid4())
        job.celery_task_id = task_id
        db.commit()
        cdc_watch_task.apply_async(args=(str(job.id),), task_id=task_id)
```

`_collect_active_task_ids(inspector)` unions `inspector.active()`, `inspector.reserved()`, and `inspector.scheduled()` across all workers. Returns `None` on broker connection failure, in which case the scheduler skips this tick (does not re-dispatch while blind).

This covers:
- Worker crash recovery
- Deployment restarts
- A new `POST /start` endpoint that flips a job to `RUNNING` without directly dispatching (scheduler picks it up on next tick; this keeps the control plane simple)

## 5 · S3 Writer refactor

### 5.1 New method

```python
# backend/app/services/s3_writer.py

class S3Writer:
    # existing write_jsonl / write_csv / test_access unchanged

    def write_events(
        self,
        *,
        prefix: str,
        table_name: str,
        events: list[dict],
        batch_id: str,
    ) -> str:
        """Write already-built event dicts as JSONL. Returns the S3 path."""
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

### 5.2 Dispatch by `output_format`

Inside the poll watcher (and later the WAL / Mongo watchers):

```python
if job.output_format == "event-jsonl":
    s3_path = s3.write_events(
        prefix=job.s3_prefix,
        table_name=job.source_table,
        events=events,
        batch_id=batch_id,
    )
elif job.output_format == "csv":
    s3_path = s3.write_csv(rows=rows, columns=columns, ...)
else:  # "jsonl" (legacy default for existing poll jobs)
    s3_path = s3.write_jsonl(rows=rows, columns=columns, ...)
```

Kind-specific event builders (`_build_poll_events(rows, columns, …)`, later `_build_wal_events`, `_build_mongo_events`) centralize the schema in §3 and are small pure functions.

## 6 · Poll path migration

### 6.1 Refactor shape

- Rename current `_run_sync` → `_poll_once(db, job) -> PollResult`, where `PollResult` carries raw rows + columns + new `last_value`
- New `_watch_poll(task, db, job)` wraps `_poll_once` in a loop:
  1. Call `_poll_once`
  2. Branch on `job.output_format`:
     - `"jsonl"` / `"csv"` → emit via `write_jsonl` / `write_csv` (legacy path, unchanged)
     - `"event-jsonl"` → build `upsert` events via `_build_poll_events(result)`, write via `write_events`
  3. Commit new `last_value`, `last_sync_at`, `total_rows_synced`
  4. Check cancel (`job.status != RUNNING` or SIGTERM received) — exit if so
  5. Sleep `job.sync_interval_seconds`
  6. Goto 1
- `_build_poll_events(rows, columns, tracking_col, table)` maps each row to:
  ```python
  {
    "_op": "upsert",
    "_table": f"{job.source_schema}.{job.source_table}",
    "_ts": now_iso(),
    "_position": str(row[tracking_col_idx]),
    "_kind": "poll",
    "before": None,
    "after": dict(zip(columns, [_serialize_value(v) for v in row])),
    "updated_fields": None,
  }
  ```

### 6.2 Endpoint behavior

- `POST /api/cdc/jobs/{id}/sync` (existing) — keeps running as a **one-shot** via `cdc.sync` task calling `_poll_once` directly. No watcher loop. Lets users force a sync without flipping `status` to `RUNNING`.
- `POST /api/cdc/jobs/{id}/snapshot` (existing) — unchanged, still a one-shot.
- `POST /api/cdc/jobs/{id}/start` (**new**) — sets `job.status = RUNNING`, returns 202. Scheduler's next tick dispatches a `cdc.watch` task.
- `POST /api/cdc/jobs/{id}/stop` (**new**) — calls `cancel_job`. Sets `job.status = IDLE`, revokes the watcher. Returns 200 with updated job.

### 6.3 Backward compatibility for existing jobs

Existing `CDCJob` rows keep `output_format="jsonl"` after the migration (per-row default unchanged). Their next `sync` or `watch` emits the legacy row-snapshot format exactly as before. No one-time rewrite of stored S3 objects. Only new jobs created through the API default to `"event-jsonl"`.

## 7 · Testing

### 7.1 New test files

```
backend/tests/test_cdc_event_schema.py (~6 tests)
  - poll upsert event structure (required fields, _kind="poll", before=null)
  - WAL stub: insert event structure
  - WAL stub: update event structure with updated_fields
  - WAL stub: delete event structure (after=null)
  - Mongo stub: replace event structure
  - _serialize_value round-trip on datetime/bytes/nested dict

backend/tests/test_cdc_watcher.py (~5 tests)
  - _watch_poll happy path: 2-iteration loop, emits events to write_events, advances last_value
  - _watch_poll cancel via status flip: watcher commits + exits after current iteration
  - _watch_poll cancel via SIGTERM: signal handler triggers clean shutdown
  - Checkpoint cadence: 1000 events mid-loop triggers intermediate commit (simulated via mock)
  - Legacy output_format="jsonl" in poll watcher still routes to write_jsonl (backward compat)

backend/tests/test_cdc_scheduler.py (~2 tests)
  - _dispatch_orphaned_watchers: finds RUNNING job with no active task, enqueues cdc.watch
  - _dispatch_orphaned_watchers: skips on broker inspect failure (returns None)
```

All new tests use the existing `task_always_eager` conftest fixture. No real Redis required. Celery `inspect` is mocked with a stub that returns known active task sets.

### 7.2 Test doubles

- `_FakeS3Writer` captures `write_events` / `write_jsonl` / `write_csv` calls for assertion
- `_FakePollConnector` returns a scripted sequence of `QueryResult`s
- Celery worker inspection mocked at the module level

### 7.3 Integration sanity check (manual, in DoD)

Create a poll job with `output_format="event-jsonl"` pointing at a local Postgres test table, run `_watch_poll` inline, verify that:
- The S3 object exists at the expected path
- Each line is valid JSON matching the event schema
- `_op = "upsert"` on every event
- `_position` matches the tracking column's last value

## 8 · Migration & Rollout Notes

### 8.1 Backward compatibility

Existing jobs keep working because:
- `cdc_kind` defaults to `"poll"` via `server_default`
- `output_format` column is unchanged; existing rows keep their `"jsonl"` / `"csv"` value
- Poll watcher branches on `output_format` and routes to the legacy writer for legacy values

### 8.2 Documentation updates (included in this effort)

- `README.md` roadmap entry: mark CDC v2 foundation shipped
- `CLAUDE.md` Forward-Looking Conventions section: update to reflect what's shipped vs. what Spec #2/#3 still add
- `docs/superpowers/roadmap.md`: move foundation to the "shipped" table, leave 3b/3c in the open list
- New short developer-facing note: `docs/cdc-event-schema.md` documenting the event-log shape (referenced from README)

### 8.3 User-visible migration communication

None required. No existing user-facing behavior changes. Opt-in new format is a feature, not a migration.

## 9 · Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Long-lived Celery tasks accumulate memory over days | Watcher explicitly releases `db` session on every iteration; documented recycle at 24h via Celery `worker_max_tasks_per_child` (already set in prod-like docker-compose) |
| Orphaned watchers after a crash continue consuming from stale state | Scheduler re-dispatch uses Celery `inspect` to detect stale `celery_task_id`; runs every 30s |
| Checkpoint thrash on idle jobs (10s commit when no events) | Commit is no-op when nothing changed; only `last_sync_at` updated. DB write cost is negligible. |
| Poll job users breaking their pipelines by opting into event-jsonl without updating downstream | UI shows an explicit "format" choice with help text; defaults preserve legacy for existing jobs |
| `inspect.active()` broker query slow under load and blocks scheduler | 1-second timeout on inspect; scheduler skips the orphan check on failure and tries again next tick |
| Re-dispatch races: two schedulers on different processes both enqueue | Current scheduler is a single thread per FastAPI process; single-instance by design. Docker-compose runs one backend. Multi-instance deployment would need a distributed lock — out of scope. |

## 10 · Definition of Done

- [ ] `CDCKind` enum + new columns (`resume_token`, `operation_filter`, `checkpoint_interval_seconds`, `celery_task_id`) live in `cdc_jobs`
- [ ] `tracking_column` is nullable with per-kind validation in Pydantic
- [ ] Alembic migration runs forward and backward cleanly on local Postgres; `pytest` still green after migration
- [ ] `S3Writer.write_events` method implemented with unit test
- [ ] `cdc.watch` Celery task wired; `_watch_poll` handles happy path + cancel + legacy `output_format`
- [ ] `_watch_pg_wal` / `_watch_mongo` stubs exist and raise `NotImplementedError` with a helpful message
- [ ] `POST /api/cdc/jobs/{id}/start` and `/stop` endpoints; integration tested
- [ ] Scheduler re-dispatch tick implemented; test for orphan detection
- [ ] Existing 112 backend tests + new tests (~13 total new tests) all green
- [ ] Frontend build green (no backend contract break)
- [ ] Chrome MCP smoke confirms existing CDC page still renders and existing poll jobs still work end-to-end
- [ ] `docs/cdc-event-schema.md` written; README + CLAUDE.md updated; roadmap updated

## 11 · Follow-up specs unlocked

- **Spec #2 — WAL-based PG CDC**: implements `_watch_pg_wal` on top of this foundation using `pypgoutput`, adds `pg_wal` form variant in the UI
- **Spec #3 — MongoDB + Change Streams CDC**: adds `MongoConnector` (CDC-only), implements `_watch_mongo`, adds `mongo_change_stream` form variant

Both are small incremental additions once this foundation lands.
