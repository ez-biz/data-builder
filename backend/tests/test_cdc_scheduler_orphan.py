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
