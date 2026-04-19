"""Tests for cdc_service — poll-based CDC sync orchestration.

Invokes _run_sync() directly with:
- SessionLocal patched to the test DB
- ConnectorRegistry.create returning a mock connector
- S3Writer patched to a recorder (no real S3 calls)
"""
from __future__ import annotations

import uuid
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.connectors.base import BaseConnector, ConnectionTestResult, QueryResult
from app.connectors.registry import ConnectorRegistry
from app.core.encryption import encrypt_config
from app.models.cdc_job import CDCJob, CDCStatus, CDCSyncLog
from app.models.connector import Connector, ConnectorType
from app.services import cdc_service


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


# --- Mocks ---

_query_plan: list[QueryResult] = []
_executed_queries: list[tuple[str, Any]] = []


class _MockPGConnector(BaseConnector):
    def test_connection(self):
        return ConnectionTestResult(success=True, message="ok")

    def get_schemas(self):
        return []

    def get_tables(self, schema):
        return []

    def get_columns(self, schema, table):
        return []

    def preview_table(self, schema, table, limit=50):
        raise NotImplementedError

    def execute_query(self, query, params=None):
        _executed_queries.append((query, params))
        if _query_plan:
            return _query_plan.pop(0)
        return QueryResult(columns=[], rows=[], row_count=0)

    def write_table(self, schema, table, columns, rows, mode="append"):
        return 0


class _RecordingS3Writer:
    instances: list["_RecordingS3Writer"] = []

    def __init__(self, bucket: str, region: str = "us-east-1"):
        self.bucket = bucket
        self.region = region
        self.jsonl_calls: list[dict] = []
        self.csv_calls: list[dict] = []
        _RecordingS3Writer.instances.append(self)

    def write_jsonl(self, *, prefix, table_name, columns, rows, batch_id):
        self.jsonl_calls.append({
            "prefix": prefix, "table_name": table_name,
            "columns": columns, "rows": rows, "batch_id": batch_id,
        })
        return f"s3://{self.bucket}/{prefix.rstrip('/')}/{table_name}/{batch_id}.jsonl"

    def write_csv(self, *, prefix, table_name, columns, rows, batch_id):
        self.csv_calls.append({
            "prefix": prefix, "table_name": table_name,
            "columns": columns, "rows": rows, "batch_id": batch_id,
        })
        return f"s3://{self.bucket}/{prefix.rstrip('/')}/{table_name}/{batch_id}.csv"


@pytest.fixture(autouse=True)
def patch_cdc(monkeypatch):
    monkeypatch.setattr(cdc_service, "SessionLocal", _TestSessionLocal)
    monkeypatch.setattr(cdc_service, "S3Writer", _RecordingS3Writer)

    original_registry = dict(ConnectorRegistry._registry)
    ConnectorRegistry._registry[ConnectorType.POSTGRESQL] = _MockPGConnector

    _query_plan.clear()
    _executed_queries.clear()
    _RecordingS3Writer.instances.clear()

    yield

    ConnectorRegistry._registry.clear()
    ConnectorRegistry._registry.update(original_registry)


# --- Test helpers ---


def _seed_connector(db) -> Connector:
    c = Connector(
        name="pg",
        connector_type=ConnectorType.POSTGRESQL,
        connection_config={"encrypted": encrypt_config({"host": "x"})},
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def _seed_job(db, connector_id, **overrides) -> CDCJob:
    defaults = dict(
        name="test-job",
        connector_id=connector_id,
        source_schema="public",
        source_table="users",
        tracking_column="updated_at",
        s3_bucket="my-bucket",
        s3_prefix="cdc/",
        s3_region="us-east-1",
        output_format="jsonl",
        last_value=None,
    )
    defaults.update(overrides)
    job = CDCJob(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _seed_log(db, job_id) -> CDCSyncLog:
    from datetime import datetime, timezone
    log = CDCSyncLog(
        job_id=job_id,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _snapshot(job: CDCJob) -> dict:
    return {
        "source_schema": job.source_schema,
        "source_table": job.source_table,
        "tracking_column": job.tracking_column,
        "last_value": job.last_value,
        "s3_bucket": job.s3_bucket,
        "s3_prefix": job.s3_prefix,
        "s3_region": job.s3_region,
        "output_format": job.output_format,
    }


# --- Tests ---


def test_sync_with_new_rows_writes_jsonl_and_updates_state(db):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id, last_value="2026-01-01")
    log = _seed_log(db, job.id)

    _query_plan.append(QueryResult(
        columns=["id", "name", "updated_at"],
        rows=[[1, "A", "2026-01-02"], [2, "B", "2026-01-03"]],
        row_count=2,
    ))

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    # Query used the incremental WHERE clause with last_value as parameter
    assert len(_executed_queries) == 1
    query, params = _executed_queries[0]
    assert 'WHERE "updated_at" > %s' in query
    assert params == ("2026-01-01",)

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "completed"
    assert log_after.rows_captured == 2
    assert log_after.s3_path is not None
    assert log_after.finished_at is not None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.IDLE
    assert job_after.last_value == "2026-01-03"  # last row's tracking value
    assert job_after.total_rows_synced == 2
    assert job_after.error_message is None

    # S3 write happened once, as jsonl
    assert len(_RecordingS3Writer.instances) == 1
    s3 = _RecordingS3Writer.instances[0]
    assert len(s3.jsonl_calls) == 1
    assert len(s3.csv_calls) == 0
    assert s3.jsonl_calls[0]["rows"] == [[1, "A", "2026-01-02"], [2, "B", "2026-01-03"]]


def test_sync_with_no_new_rows_skips_s3_write(db):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id, last_value="2026-01-01", total_rows_synced=5)
    log = _seed_log(db, job.id)

    _query_plan.append(QueryResult(columns=[], rows=[], row_count=0))

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "completed"
    assert log_after.rows_captured == 0
    assert log_after.s3_path is None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.IDLE
    assert job_after.last_value == "2026-01-01"  # unchanged
    assert job_after.total_rows_synced == 5  # unchanged

    assert _RecordingS3Writer.instances == []


def test_full_snapshot_queries_without_where_and_sets_last_value(db):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id, last_value=None)
    log = _seed_log(db, job.id)

    _query_plan.append(QueryResult(
        columns=["id", "updated_at"],
        rows=[[1, "2026-01-05"], [2, "2026-01-06"], [3, "2026-01-07"]],
        row_count=3,
    ))

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    query, _params = _executed_queries[0]
    assert "WHERE" not in query
    assert 'ORDER BY "updated_at" ASC' in query

    db.expire_all()
    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.last_value == "2026-01-07"
    assert job_after.total_rows_synced == 3


def test_sync_with_csv_format_writes_csv(db):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id, output_format="csv")
    log = _seed_log(db, job.id)

    _query_plan.append(QueryResult(
        columns=["id", "updated_at"],
        rows=[[1, "2026-01-01"]],
        row_count=1,
    ))

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    s3 = _RecordingS3Writer.instances[0]
    assert len(s3.csv_calls) == 1
    assert len(s3.jsonl_calls) == 0


def test_sync_failure_marks_job_failed(db, monkeypatch):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)
    log = _seed_log(db, job.id)

    def _boom(*a, **kw):
        raise RuntimeError("connector exploded")

    monkeypatch.setattr(
        ConnectorRegistry, "create",
        classmethod(lambda cls, *a, **kw: _boom()),
    )

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "failed"
    assert "connector exploded" in (log_after.error_message or "")
    assert log_after.finished_at is not None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.FAILED
    assert "connector exploded" in (job_after.error_message or "")


def test_sync_transient_error_reraises_for_retry(db, monkeypatch):
    """Transient psycopg2 errors must propagate so Celery can retry them;
    the sync log must NOT be marked failed on transient errors."""
    import psycopg2

    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)
    log = _seed_log(db, job.id)

    def _raise_transient(*args, **kwargs):
        raise psycopg2.OperationalError("connection refused")

    monkeypatch.setattr(ConnectorRegistry, "create", classmethod(lambda cls, *a, **kw: _raise_transient()))

    with pytest.raises(psycopg2.OperationalError):
        cdc_service._run_sync(
            log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
        )

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "running"  # Not failed — left for retry
    assert log_after.finished_at is None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status != CDCStatus.FAILED  # Not marked failed on transient


def test_sync_connection_error_reraises(db, monkeypatch):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)
    log = _seed_log(db, job.id)

    def _raise_conn(*args, **kwargs):
        raise ConnectionError("network unavailable")

    monkeypatch.setattr(ConnectorRegistry, "create", classmethod(lambda cls, *a, **kw: _raise_conn()))

    with pytest.raises(ConnectionError):
        cdc_service._run_sync(
            log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
        )


def test_mark_sync_failed_terminal_state(db, monkeypatch):
    """mark_sync_failed is the fallback when Celery retries are exhausted."""
    monkeypatch.setattr(cdc_service, "SessionLocal", _TestSessionLocal)

    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)
    log = _seed_log(db, job.id)

    cdc_service.mark_sync_failed(log.id, job.id, "exhausted retries: connection refused")

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "failed"
    assert "exhausted retries" in (log_after.error_message or "")
    assert log_after.finished_at is not None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.FAILED


def test_cdc_sync_task_has_retry_policy():
    """Verify the Celery task class is wired with the expected retry config."""
    import psycopg2

    from app.tasks import run_cdc_sync_task

    assert psycopg2.OperationalError in run_cdc_sync_task.autoretry_for
    assert psycopg2.InterfaceError in run_cdc_sync_task.autoretry_for
    assert ConnectionError in run_cdc_sync_task.autoretry_for
    assert TimeoutError in run_cdc_sync_task.autoretry_for
    assert run_cdc_sync_task.max_retries == 3
    assert run_cdc_sync_task.retry_backoff is True
    assert run_cdc_sync_task.retry_backoff_max == 60


def test_trigger_sync_connector_not_found_marks_failed(db):
    """If the connector referenced by the job no longer exists, trigger_sync
    must mark the log + job as failed and never dispatch a background worker."""
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)

    # Simulate connector deletion by detaching and deleting from DB
    db.delete(connector)
    db.commit()

    log = cdc_service.trigger_sync(db, job)

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "failed"
    assert log_after.error_message == "Connector not found"
    assert log_after.finished_at is not None

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.FAILED
    assert job_after.error_message == "Connector not found"

    # No S3 write, no query ever ran
    assert _RecordingS3Writer.instances == []
    assert _executed_queries == []


def test_trigger_snapshot_connector_not_found_marks_failed(db):
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id)
    db.delete(connector)
    db.commit()

    log = cdc_service.trigger_snapshot(db, job)

    db.expire_all()
    log_after = db.query(CDCSyncLog).filter(CDCSyncLog.id == log.id).first()
    assert log_after.status == "failed"
    assert log_after.error_message == "Connector not found"

    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.status == CDCStatus.FAILED


def test_sync_handles_tracking_column_not_in_result(db):
    """If the tracking column is absent from result columns, last_value preserved."""
    connector = _seed_connector(db)
    job = _seed_job(db, connector.id, last_value="100", tracking_column="id")
    log = _seed_log(db, job.id)

    # Result doesn't include 'id' column (weird but defensive)
    _query_plan.append(QueryResult(
        columns=["name"],
        rows=[["row1"]],
        row_count=1,
    ))

    cdc_service._run_sync(
        log.id, job.id, ConnectorType.POSTGRESQL, {"host": "x"}, _snapshot(job)
    )

    db.expire_all()
    job_after = db.query(CDCJob).filter(CDCJob.id == job.id).first()
    assert job_after.last_value == "100"  # unchanged because tracking col not in result
    assert job_after.total_rows_synced == 1


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
