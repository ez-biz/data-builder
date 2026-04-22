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
