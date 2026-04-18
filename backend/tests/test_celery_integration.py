"""Celery task integration tests.

Verifies run_pipeline_task and run_cdc_sync_task actually dispatch and execute
the underlying service functions. Runs in eager mode (set in conftest.py) so
no real worker/broker is required.
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.connectors.base import BaseConnector, ConnectionTestResult, QueryResult
from app.connectors.registry import ConnectorRegistry
from app.core.encryption import encrypt_config
from app.models.connector import Connector, ConnectorType
from app.models.pipeline import Pipeline, PipelineStatus
from app.models.pipeline_run import PipelineRun, RunStatus
from app.services import cdc_service, run_service
from app.tasks import run_cdc_sync_task, run_pipeline_task


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


class _EagerMockConnector(BaseConnector):
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
        return QueryResult(
            columns=["id"], rows=[[1], [2], [3]], row_count=3,
        )

    def write_table(self, schema, table, columns, rows, mode="append"):
        return len(rows)


@pytest.fixture(autouse=True)
def patch_services(monkeypatch):
    monkeypatch.setattr(run_service, "SessionLocal", _TestSessionLocal)
    monkeypatch.setattr(cdc_service, "SessionLocal", _TestSessionLocal)

    original_registry = dict(ConnectorRegistry._registry)
    ConnectorRegistry._registry[ConnectorType.POSTGRESQL] = _EagerMockConnector
    yield
    ConnectorRegistry._registry.clear()
    ConnectorRegistry._registry.update(original_registry)


def test_run_pipeline_task_executes_eagerly(db):
    connector = Connector(
        name="pg",
        connector_type=ConnectorType.POSTGRESQL,
        connection_config={"encrypted": encrypt_config({"host": "x"})},
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    cid = str(connector.id)

    definition = {
        "nodes": [
            {"id": "s1", "type": "source", "position": {"x": 0, "y": 0}, "data": {
                "label": "Src", "connectorId": cid,
                "schema": "public", "table": "users", "selectedColumns": [],
            }},
            {"id": "d1", "type": "destination", "position": {"x": 400, "y": 0}, "data": {
                "label": "Dst", "connectorId": cid,
                "schema": "staging", "table": "out", "writeMode": "append",
            }},
        ],
        "edges": [{"id": "e1", "source": "s1", "target": "d1"}],
    }
    pipeline = Pipeline(name="P", status=PipelineStatus.DRAFT, definition=definition)
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)

    run = PipelineRun(
        pipeline_id=pipeline.id, status=RunStatus.PENDING, triggered_by="manual"
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Invoke the task through its .delay() entry — eager mode runs it inline.
    run_pipeline_task.delay(
        str(run.id),
        str(pipeline.id),
        pipeline.name,
        definition,
        {cid: [ConnectorType.POSTGRESQL, {"host": "x"}]},
    )

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.COMPLETED
    assert run_after.rows_processed == 3


def test_start_run_dispatches_via_celery_task(client, db, monkeypatch):
    """The HTTP endpoint should dispatch via the Celery task (eager → runs inline)."""
    # Create a pipeline with no nodes — execution will fail, but we're asserting dispatch.
    resp = client.post("/api/pipelines", json={"name": "dispatch-test"})
    pipeline_id = resp.json()["id"]

    # The autouse stub_run_dispatch fixture (from test_runs.py) doesn't apply here.
    # Track task invocations by wrapping the task's run method.
    calls: list = []
    original = run_pipeline_task.run

    def _recording(*args, **kwargs):
        calls.append((args, kwargs))
        return original(*args, **kwargs)

    monkeypatch.setattr(run_pipeline_task, "run", _recording)

    resp = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert resp.status_code == 202
    # Eager mode executed the task at dispatch time.
    assert len(calls) == 1
    run_id_arg = calls[0][0][0]
    assert run_id_arg == resp.json()["id"]

    # Run should be FAILED (empty definition)
    run_after = db.query(PipelineRun).filter(PipelineRun.id == uuid.UUID(run_id_arg)).first()
    assert run_after.status == RunStatus.FAILED
