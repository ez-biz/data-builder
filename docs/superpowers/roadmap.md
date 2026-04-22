# Data Builder — Future Roadmap

Living document covering the open phases, rough scoping, and sequencing rationale. Updated as priorities shift.

**As of:** 2026-04-19

## Status snapshot

| Phase | Scope | Status |
|---|---|---|
| 1    | Foundation — connectors, catalog, visual canvas, validation, auto-save | ✅ shipped |
| 2a   | Distributed execution (Celery + Redis), cancel, retry, scheduler, notifications | ✅ shipped |
| 2b   | Workbench UI revamp — Emerald tokens, primitives, canvas recipe | ✅ shipped |
| 3a   | Poll-based CDC (tracking-column → S3 JSONL/CSV) with transient retry | ✅ shipped |
| 3a.1 | CDC v2 foundation — `CDCKind` enum, event-log JSONL schema, `cdc.watch` watcher, start/stop endpoints | ✅ shipped |
| **2c** | **SQL pushdown** | open |
| **3b** | **WAL-based CDC for PostgreSQL** | open |
| **3c** | **MongoDB support + Change Streams CDC** | open |
| **4**  | **Text2SQL** | open |
| **UI** | Dark mode · ⌘K palette · Playwright VR · mobile | open |

No dates are committed. The sequencing below is a recommendation, not a schedule.

---

## Recommended sequence

**Rationale:** Ship the items that unlock the most concrete user value per day of work first. SQL pushdown unblocks anything that touches non-trivial datasets — nothing else matters if the engine can't scale. CDC hardening is second because the current poll-based CDC is fragile in ways users will hit in production (no deletes, row-miss on backdated updates). MongoDB and Text2SQL are expansion bets that deserve their own discovery before they're scoped.

```
now ─────────────────────────────────────────────────────────────────▶ later

  2c SQL pushdown          3b WAL CDC (PG)      3c MongoDB         4 Text2SQL
  ~1–2 days                ~2–3 days            ~3–4 days          ~3–5 days
  unlocks 100k+ rows       captures deletes     new source kind    natural-lang
                                                                   pipelines
```

Parallel tracks (each can slot into free time):
- **UI follow-ups** — dark mode, ⌘K palette, Playwright VR, mobile. Independent of backend work.
- **Security & auth** — no auth layer exists today. Only blocks multi-user deployment.

---

## Phase 2c — SQL pushdown

**Problem:** `execution_engine.py` runs every pipeline in Python memory. A source with >100k rows loads everything into a list, processes it, and only then writes to the destination. OOM at moderate scale; slow for any real dataset.

**Solution sketch:**
- For pipelines whose source(s) and destination share a connector, generate one SQL statement with CTEs per node (`WITH src AS (SELECT …), filt AS (SELECT … FROM src WHERE …), dst AS (INSERT INTO … SELECT …)`).
- Cross-connector pipelines (e.g. PG → Databricks) fall back to the current Python executor but with pagination (stream rows in batches instead of loading everything).
- Keep the in-memory executor as the reference implementation for tests + cross-connector fallback.

**Open design questions to resolve before starting:**
1. How to express a Transform node's user-defined expressions as SQL portably across PG and Databricks? Minimum viable set: cast, rename, arithmetic. No UDFs in v1.
2. How to handle Join keys that aren't the sort order? SQL engines handle it natively; the Python executor currently uses a hash-join. No work needed — just write SQL.
3. Error reporting — current executor captures `node_results` per node with row counts. SQL push loses per-node visibility. Option: run each stage's CTE once with `COUNT(*)` for metrics (cheap in the same transaction), or accept "final count only" and explain in the UI.

**Estimated effort:** 1–2 days for happy-path pushdown (source → filter → destination, same connector). +0.5 day each for join / aggregate / transform.

**Prerequisites:** None. Self-contained backend refactor.

**Rollout:** Behind an opt-in `pushdown=true` flag on the pipeline, default off until a test dataset >100k rows validates correctness.

---

## Phase 3b — WAL-based CDC for PostgreSQL

**Problem:** Current poll-based CDC has three production gaps:
- **No deletes** captured — `WHERE tracking_col > last_value` can't see what's gone.
- **Misses backdated updates** — rows whose tracking column is updated to a *lower* value are invisible.
- **No deletion / TTL story for replay.**

**Solution:** PostgreSQL logical replication via `pgoutput`.

```python
from psycopg2.extras import LogicalReplicationConnection, StartReplicationStream

conn = psycopg2.connect(..., connection_factory=LogicalReplicationConnection)
cur = conn.cursor()
cur.create_replication_slot(slot_name, output_plugin="pgoutput")
cur.start_replication(slot_name=slot_name, decode=False,
                      options={"proto_version": "1",
                               "publication_names": "<pub>"})
cur.consume_stream(process_change)   # callback per change message
```

**What's hard (and where most of the 2–3 days goes):**
- **Slot lifecycle.** Slots hold WAL until consumed; if the worker dies for a week, the source DB's disk fills. Need: auto-drop on pause > N days, monitoring / alerts, ownership clarity.
- **Publication setup.** User has to `CREATE PUBLICATION` on their source DB. UI needs to either surface this as a copy-paste step or provide the SQL as a hint.
- **Server-side requirement.** `wal_level=logical`. Not changeable at runtime; requires DBA cooperation. Some managed Postgres (e.g. RDS) needs a parameter-group change + restart.
- **Per-table state.** Replication slot is per-connection, publication is per-table-set. Each CDC job needs its own slot + publication.
- **Schema changes.** DDL events come through as separate protocol messages — need a policy: stop, warn, skip?
- **Checkpoint/restart.** On worker restart, need to resume from the last acknowledged LSN. Slot remembers this, but the worker needs durable state to skip events the S3 writer already emitted.

**S3 output schema changes** (shared with 3c):

```jsonl
{"_op":"insert","_lsn":"0/3D3F490","_ts":"…","_table":"public.users","before":null,"after":{"id":…,"name":…}}
{"_op":"update","_lsn":"0/3D3F4A8","_ts":"…","_table":"public.users","before":{"id":…,"name":"old"},"after":{"id":…,"name":"new"}}
{"_op":"delete","_lsn":"0/3D3F4B0","_ts":"…","_table":"public.users","before":{"id":…},"after":null}
```

**Estimated effort:** 2–3 days. Half of that is slot lifecycle + monitoring, not the happy-path WAL read.

**Prerequisites:**
- ✅ Met — `CDCKind` enum, `resume_token`, `operation_filter`, `checkpoint_interval_seconds`, and the `cdc.watch` long-running watcher pattern are all shipped (Phase 3a.1). `_watch_pg_wal` stub is in place.
- Workers need durable LSN checkpoints (new column or separate `cdc_checkpoints` table).

**Rollout:** Per-job opt-in (user picks kind when creating). Default stays `poll`.

---

## Phase 3c — MongoDB support + Change Streams CDC

**Why MongoDB is technically simpler than WAL PG** — but still a multi-day project because adding a new source kind touches the connector system, the catalog UI, the CDC model, and the S3 output schema.

### Part A: MongoDB connector (CDC-only scope)

**Add to `ConnectorType`:** `MONGODB`.

**New file:** `backend/app/connectors/mongodb.py`.

Adapt the relational metaphor:
- `schemas` → **databases** (`client.list_database_names()`)
- `tables` → **collections** (`db.list_collection_names()`)
- `columns` → inferred via `$sample` aggregation (e.g. `db.col.aggregate([{$sample:{size:100}}])`), scan field names + BSON types, surface most-common type per field

**Skip in v1:**
- `execute_query` — MongoDB speaks Aggregation, not SQL. No pipeline source yet.
- `write_table` — no MongoDB destination. CDC only writes to S3.

**Dependency:** `pymongo>=4.6`. Already in use in millions of projects; no compatibility worries.

### Part B: Change Streams CDC

**Why it's cleaner than WAL:**
- `resume_token` is an opaque BSON field on every change event. Persist it as `job.resume_token` after each batch; next run passes it via `resume_after=` and MongoDB handles replay correctness.
- All op types come through natively: `insert` / `update` / `replace` / `delete` (and `invalidate` if the collection is dropped).
- No slot lifecycle to babysit — MongoDB's oplog handles retention.

```python
with collection.watch(
    pipeline=[{"$match": {"operationType": {"$in": op_filter}}}],
    resume_after=job.resume_token,
    full_document="updateLookup",
    full_document_before_change="whenAvailable",
) as stream:
    for change in stream:
        emit_to_s3(change)
        job.resume_token = change["_id"]
        job.last_sync_at = now()
        db.commit()
```

**The one hard prerequisite:** Source MongoDB must be a **replica set** or sharded cluster. Change streams don't work on standalone. Replica set of 1 is fine for dev.

### Model changes needed (shared with 3b) — ✅ shipped in Phase 3a.1

All model changes are in place: `CDCKind` enum (`POLL`/`PG_WAL`/`MONGO_CHANGE_STREAM`), `resume_token`, `operation_filter`, `checkpoint_interval_seconds` on `CDCJob`, `tracking_column` now nullable, Alembic migration applied. `_watch_mongo` stub is in place in `cdc_service.py`.

### S3 output — event-log schema

Same JSONL shape as 3b (shown above) — so the two CDC kinds emit a compatible event stream. Downstream consumers (dbt, Spark jobs, etc.) write one parser.

### Frontend changes

- `ConnectorForm` — add MongoDB fields (connection string, replica set name).
- `CDCJobForm` — branch on connector type: show `tracking_column` for relational, hide for Mongo; show `operation_filter` multi-select for Mongo, hide for poll.
- Detail drawer — event log view when `cdc_kind != "poll"` (rendered from `full_document` + `updated_fields`).

**Estimated effort:** 3–4 days, broken down:
1. **Day 1:** `MongoConnector` with `test_connection`, `get_schemas`, `get_tables`, `get_columns` (sampled). No `execute_query` / `write_table`. Tests against `mongomock` or testcontainers.
2. **Day 2:** `CDCKind` enum, migration, schema + API updates. `MongoChangeStreamSync` service (the stream-based equivalent of `_run_sync`).
3. **Day 3:** Celery task for change-stream sync (different shape — long-running watcher vs. one-shot sync). Retry story, checkpoint story.
4. **Day 4:** Frontend forms, detail-drawer event view, end-to-end smoke.

### Why 3c probably lands before 3b

Counterintuitive, but:
- Change Streams are simpler to operate (no slot leak risk, no server-side config knob).
- MongoDB is a broader user base among the kinds of teams that want "stream changes to S3".
- The `cdc_kind` model changes need to happen either way — doing them for 3c first means 3b is a smaller incremental add.

---

## Phase 4 — Text2SQL

Translate natural-language requests into pipeline definitions or SQL queries. This is a different kind of project — LLM integration, prompt design, safety rails — not a backend refactor.

**Minimum viable scope (~3 days):**
- Add `/api/ai/text2sql` endpoint that accepts a prompt + connector context (schemas, tables, columns already in the catalog).
- Use Anthropic's SDK with prompt caching on the schema context (schema doesn't change within a session, so cache it).
- Return `{sql: str, rationale: str, warnings: str[]}`.
- UI: a sidebar / dialog on the Catalog page that accepts `"show me all users who signed up last week"` → renders generated SQL → user can copy/paste or "materialize as pipeline" (hard — that's a second effort: SQL → canvas graph).

**Scope to explicitly cut from v1:**
- SQL → pipeline-graph reverse transpiler. Too ambitious.
- Auto-execution of generated SQL. Too dangerous.
- Fine-tuning. Use plain tool-use with the right schema context.

**Prerequisites:**
- Anthropic API key as a config secret (`ANTHROPIC_API_KEY`).
- Prompt-caching strategy for schema context (the caching skill in this project's environment covers this).
- A reasonable cost cap / rate limit at the backend.

**Estimated effort:** 3–5 days depending on safety-rail depth.

---

## UI follow-ups

Parallel to backend work. Each is ~0.5–1 day. None block each other.

- **Dark mode toggle.** Current design is fixed dark-sidebar / light-work-area (Workbench). Full dark mode means adding `--dark:*` tokens or a second `@theme` block, toggled via a `Theme` context that writes to `documentElement`. Low risk.
- **Command palette (⌘K).** The affordance is already in the topbar. Needs the actual palette: fuzzy search over pipelines, connectors, CDC jobs, nav destinations. Radix + `cmdk` library.
- **Playwright visual regression.** Snapshot the 7 pages, run on CI, diff against main. Introduces Playwright as a frontend test dep.
- **Mobile / tablet responsive.** Currently desktop-only (sidebar collapses at 1024px). Making the canvas useful below that is hard; the list pages and monitoring are easier. Probably scope to "everything except the pipeline editor is readable on iPad."

---

## When to update this file

- After each phase ships — move its row to the status snapshot, delete the detailed section.
- When a phase's scope or effort estimate changes based on new information — edit in place, commit with a `docs(roadmap):` prefix so the intent shows in `git log`.
- When a new phase is added — put it at the bottom and update the status snapshot.
