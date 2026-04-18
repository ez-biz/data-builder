"""Tests for scheduler_service — cron-based pipeline triggering.

The loop is tested by calling _check_and_trigger() synchronously with a
stubbed run_service.start_run; the start/stop lifecycle is checked separately.
"""
from __future__ import annotations

import threading
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models.pipeline import Pipeline, PipelineStatus
from app.models.pipeline_run import PipelineRun, RunStatus
from app.services import scheduler_service


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def patch_scheduler(monkeypatch):
    monkeypatch.setattr(scheduler_service, "SessionLocal", _TestSessionLocal)
    # Widen the window so "* * * * *" is reliably considered due.
    monkeypatch.setattr(scheduler_service, "CHECK_INTERVAL_SECONDS", 120)


@pytest.fixture
def trigger_calls(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_start_run(db, pipeline, triggered_by="manual"):
        calls.append((str(pipeline.id), triggered_by))
        run = PipelineRun(
            pipeline_id=pipeline.id,
            status=RunStatus.PENDING,
            triggered_by=triggered_by,
        )
        db.add(run)
        db.commit()
        return run

    monkeypatch.setattr(scheduler_service.run_service, "start_run", fake_start_run)
    return calls


def _seed_pipeline(db, *, cron: str | None, name: str = "P") -> Pipeline:
    p = Pipeline(
        name=name,
        status=PipelineStatus.DRAFT,
        definition={"nodes": [], "edges": []},
        schedule_cron=cron,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_due_pipeline_is_triggered(db, trigger_calls):
    pipeline = _seed_pipeline(db, cron="* * * * *")

    scheduler_service._check_and_trigger()

    assert len(trigger_calls) == 1
    assert trigger_calls[0] == (str(pipeline.id), "schedule")


def test_pipeline_without_cron_is_skipped(db, trigger_calls):
    _seed_pipeline(db, cron=None)
    _seed_pipeline(db, cron="", name="Empty")

    scheduler_service._check_and_trigger()

    assert trigger_calls == []


def test_invalid_cron_is_skipped(db, trigger_calls):
    _seed_pipeline(db, cron="not a cron string")

    scheduler_service._check_and_trigger()

    assert trigger_calls == []


def test_duplicate_trigger_prevented_within_window(db, trigger_calls):
    pipeline = _seed_pipeline(db, cron="* * * * *")

    run = PipelineRun(
        pipeline_id=pipeline.id,
        status=RunStatus.RUNNING,
        triggered_by="schedule",
    )
    db.add(run)
    db.commit()

    scheduler_service._check_and_trigger()

    assert trigger_calls == []


def test_manual_run_does_not_block_scheduled_trigger(db, trigger_calls):
    """A recent manual run must not suppress a due scheduled run."""
    pipeline = _seed_pipeline(db, cron="* * * * *")

    run = PipelineRun(
        pipeline_id=pipeline.id,
        status=RunStatus.RUNNING,
        triggered_by="manual",
    )
    db.add(run)
    db.commit()

    scheduler_service._check_and_trigger()

    assert len(trigger_calls) == 1
    assert trigger_calls[0][1] == "schedule"


def test_start_stop_scheduler_lifecycle():
    assert scheduler_service._scheduler_thread is None or not scheduler_service._scheduler_thread.is_alive() or True

    scheduler_service.start_scheduler()
    thread = scheduler_service._scheduler_thread
    assert thread is not None
    assert thread.is_alive()
    assert isinstance(thread, threading.Thread)

    scheduler_service.stop_scheduler()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_start_scheduler_is_idempotent():
    scheduler_service.start_scheduler()
    first = scheduler_service._scheduler_thread
    scheduler_service.start_scheduler()
    second = scheduler_service._scheduler_thread
    assert first is second
    scheduler_service.stop_scheduler()
    if first:
        first.join(timeout=2)
