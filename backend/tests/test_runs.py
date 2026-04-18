"""Tests for pipeline run HTTP endpoints.

The background ThreadPoolExecutor is stubbed out so these tests exercise only
the synchronous side-effects of the /run endpoint (run row creation, pipeline
status transition). End-to-end execution is covered in test_run_service.py.
"""
from __future__ import annotations

import time
import uuid

import pytest

from app.models.pipeline import Pipeline, PipelineStatus
from app.models.pipeline_run import PipelineRun, RunStatus


class _NoOpTask:
    def delay(self, *args, **kwargs):
        return None

    def apply_async(self, *args, **kwargs):
        return None


@pytest.fixture(autouse=True)
def stub_run_dispatch(monkeypatch):
    """Prevent the Celery run_pipeline_task from executing so tests stay
    synchronous and HTTP-layer behavior can be asserted without a worker.
    """
    monkeypatch.setattr("app.tasks.run_pipeline_task", _NoOpTask())


def _create_pipeline(client, name: str = "Pipe") -> str:
    resp = client.post("/api/pipelines", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]


def test_trigger_run_creates_pending_run(client, db):
    pipeline_id = _create_pipeline(client)

    resp = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert resp.status_code == 202

    body = resp.json()
    assert body["pipeline_id"] == pipeline_id
    assert body["status"] == "pending"
    assert body["triggered_by"] == "manual"
    assert body["started_at"] is None
    assert body["finished_at"] is None

    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(body["id"])).first()
    assert run is not None
    assert run.status == RunStatus.PENDING


def test_trigger_run_sets_pipeline_running(client, db):
    pipeline_id = _create_pipeline(client)

    client.post(f"/api/pipelines/{pipeline_id}/run")

    pipeline = db.query(Pipeline).filter(Pipeline.id == uuid.UUID(pipeline_id)).first()
    assert pipeline.status == PipelineStatus.RUNNING


def test_trigger_run_nonexistent_pipeline_returns_404(client):
    resp = client.post(f"/api/pipelines/{uuid.uuid4()}/run")
    assert resp.status_code == 404


def test_list_runs_empty(client):
    pipeline_id = _create_pipeline(client)
    resp = client.get(f"/api/pipelines/{pipeline_id}/runs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_runs_returns_newest_first(client):
    pipeline_id = _create_pipeline(client)

    first = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]
    time.sleep(1.1)  # SQLite created_at has second resolution — ensure distinct timestamps
    second = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    resp = client.get(f"/api/pipelines/{pipeline_id}/runs")
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert ids == [second, first]


def test_get_run_by_id(client):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    resp = client.get(f"/api/pipelines/{pipeline_id}/runs/{run_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == run_id


def test_get_run_wrong_pipeline_returns_404(client):
    pipeline_a = _create_pipeline(client, "A")
    pipeline_b = _create_pipeline(client, "B")
    run_id = client.post(f"/api/pipelines/{pipeline_a}/run").json()["id"]

    resp = client.get(f"/api/pipelines/{pipeline_b}/runs/{run_id}")
    assert resp.status_code == 404


def test_retry_pending_run_rejected(client):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/retry")
    assert resp.status_code == 400


def test_retry_failed_run_creates_new_run(client, db):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    run.status = RunStatus.FAILED
    db.commit()

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/retry")
    assert resp.status_code == 202

    body = resp.json()
    assert body["id"] != run_id
    assert body["status"] == "pending"
    assert body["triggered_by"] == "retry"


def test_cancel_pending_run(client, db):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "cancelled"
    assert body["error_message"] == "Cancelled by user"
    assert body["finished_at"] is not None


def test_cancel_running_run(client, db):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    run.status = RunStatus.RUNNING
    db.commit()

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cancel_completed_run_rejected(client, db):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    run.status = RunStatus.COMPLETED
    db.commit()

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 400


def test_cancel_wrong_pipeline_404(client):
    pipeline_a = _create_pipeline(client, "A")
    pipeline_b = _create_pipeline(client, "B")
    run_id = client.post(f"/api/pipelines/{pipeline_a}/run").json()["id"]

    resp = client.post(f"/api/pipelines/{pipeline_b}/runs/{run_id}/cancel")
    assert resp.status_code == 404


def test_start_run_persists_celery_task_id(client, db):
    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    assert run.celery_task_id is not None
    assert len(run.celery_task_id) > 10  # it's a UUID


def test_cancel_revokes_celery_task(client, db, monkeypatch):
    """cancel_run must call celery_app.control.revoke with the stored task_id."""
    from app.celery_app import celery_app

    revoke_calls: list = []

    def _record_revoke(task_id, terminate=False, signal=None):
        revoke_calls.append({"task_id": task_id, "terminate": terminate, "signal": signal})

    monkeypatch.setattr(celery_app.control, "revoke", _record_revoke)

    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    run_before = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    task_id_expected = run_before.celery_task_id

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 200

    assert len(revoke_calls) == 1
    assert revoke_calls[0]["task_id"] == task_id_expected
    assert revoke_calls[0]["terminate"] is True
    assert revoke_calls[0]["signal"] == "SIGTERM"


def test_cancel_without_task_id_skips_revoke(client, db, monkeypatch):
    """If celery_task_id is somehow missing, cancel should still update DB state."""
    from app.celery_app import celery_app

    revoke_calls: list = []
    monkeypatch.setattr(
        celery_app.control, "revoke",
        lambda *a, **kw: revoke_calls.append(a),
    )

    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    # Clear the task_id to simulate an edge case
    run = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id)).first()
    run.celery_task_id = None
    db.commit()

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert revoke_calls == []


def test_cancel_swallows_revoke_errors(client, db, monkeypatch):
    """If revoke raises (e.g. broker down), cancel still updates DB state."""
    from app.celery_app import celery_app

    def _boom(*a, **kw):
        raise ConnectionError("broker down")

    monkeypatch.setattr(celery_app.control, "revoke", _boom)

    pipeline_id = _create_pipeline(client)
    run_id = client.post(f"/api/pipelines/{pipeline_id}/run").json()["id"]

    resp = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
