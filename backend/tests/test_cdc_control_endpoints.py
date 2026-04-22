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
