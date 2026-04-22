"""Tests for the long-running cdc.watch task and dispatch."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.connectors.base import BaseConnector, ConnectionTestResult, QueryResult
from app.connectors.registry import ConnectorRegistry
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


class _MockConnector(BaseConnector):
    def __init__(self, config):
        super().__init__(config)
        self._results = [
            QueryResult(columns=["id", "name"], rows=[[1, "A"], [2, "B"]], row_count=2),
            QueryResult(columns=["id", "name"], rows=[], row_count=0),
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

    assert len(write_events_calls) == 1
    assert len(write_events_calls[0]["events"]) == 2
    assert write_events_calls[0]["events"][0]["_op"] == "upsert"
    assert write_events_calls[0]["events"][0]["_kind"] == "poll"

    fresh = db.query(CDCJob).filter(CDCJob.id == j.id).first()
    db.refresh(fresh)
    assert fresh.last_value == "2"          # id of last row
    assert fresh.total_rows_synced == 2


def test_watch_poll_legacy_jsonl_uses_write_jsonl(
    db, monkeypatch, mock_connector_registry
):
    """Existing jobs with output_format='jsonl' use the legacy writer."""
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
    assert write_events_calls == []
