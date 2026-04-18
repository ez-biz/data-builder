"""End-to-end tests for run_service._run_pipeline.

These invoke the background-thread function synchronously with:
- SessionLocal patched to the test sqlite DB
- A mock connector registered as POSTGRESQL so ConnectorRegistry.create works

They verify the full state transition: PENDING → RUNNING → COMPLETED/FAILED,
including pipeline status, rows_processed, and error_message on failure.
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
from app.services import run_service


_table_data: dict[str, QueryResult] = {}
_writes: list[dict] = []


class _MockPGConnector(BaseConnector):
    """Registered in place of POSTGRESQL for the duration of each test."""

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
        for key, result in _table_data.items():
            if key in query:
                return result
        return QueryResult(columns=[], rows=[], row_count=0)

    def write_table(self, schema, table, columns, rows, mode="append"):
        _writes.append({
            "schema": schema, "table": table,
            "columns": columns, "rows": rows, "mode": mode,
        })
        return len(rows)


_test_engine = create_engine(
    "sqlite:///./test.db", connect_args={"check_same_thread": False}
)
_TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)


@pytest.fixture(autouse=True)
def patch_run_service(monkeypatch):
    monkeypatch.setattr(run_service, "SessionLocal", _TestSessionLocal)

    original_registry = dict(ConnectorRegistry._registry)
    ConnectorRegistry._registry[ConnectorType.POSTGRESQL] = _MockPGConnector
    _table_data.clear()
    _writes.clear()
    yield
    ConnectorRegistry._registry.clear()
    ConnectorRegistry._registry.update(original_registry)


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


def _seed_pipeline(db, definition: dict) -> Pipeline:
    p = Pipeline(name="P", status=PipelineStatus.DRAFT, definition=definition)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _seed_run(db, pipeline_id: uuid.UUID) -> PipelineRun:
    run = PipelineRun(pipeline_id=pipeline_id, status=RunStatus.PENDING, triggered_by="manual")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def test_run_pipeline_completes_successfully(db):
    connector = _seed_connector(db)
    cid = str(connector.id)

    _table_data["users"] = QueryResult(
        columns=["id", "name"], rows=[[1, "Alice"], [2, "Bob"]], row_count=2,
    )

    definition = {
        "nodes": [
            {"id": "s1", "type": "source", "position": {"x": 0, "y": 0}, "data": {
                "label": "Users", "connectorId": cid,
                "schema": "public", "table": "users", "selectedColumns": [],
            }},
            {"id": "d1", "type": "destination", "position": {"x": 400, "y": 0}, "data": {
                "label": "Out", "connectorId": cid,
                "schema": "staging", "table": "users_copy", "writeMode": "append",
            }},
        ],
        "edges": [{"id": "e1", "source": "s1", "target": "d1"}],
    }
    pipeline = _seed_pipeline(db, definition)
    run = _seed_run(db, pipeline.id)

    connector_configs = {cid: (ConnectorType.POSTGRESQL, {"host": "x"})}
    run_service._run_pipeline(run.id, pipeline.id, pipeline.name, definition, connector_configs)

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.COMPLETED
    assert run_after.rows_processed == 2
    assert run_after.started_at is not None
    assert run_after.finished_at is not None
    assert run_after.error_message is None

    pipeline_after = db.query(Pipeline).filter(Pipeline.id == pipeline.id).first()
    assert pipeline_after.status == PipelineStatus.COMPLETED

    assert len(_writes) == 1
    assert _writes[0]["rows"] == [[1, "Alice"], [2, "Bob"]]


def test_run_pipeline_fails_on_empty_definition(db):
    pipeline = _seed_pipeline(db, {"nodes": [], "edges": []})
    run = _seed_run(db, pipeline.id)

    run_service._run_pipeline(run.id, pipeline.id, pipeline.name, {"nodes": [], "edges": []}, {})

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.FAILED
    assert run_after.error_message is not None
    assert run_after.finished_at is not None

    pipeline_after = db.query(Pipeline).filter(Pipeline.id == pipeline.id).first()
    assert pipeline_after.status == PipelineStatus.FAILED


def test_run_pipeline_fails_when_connector_missing(db):
    definition = {
        "nodes": [
            {"id": "s1", "type": "source", "position": {"x": 0, "y": 0}, "data": {
                "label": "X", "connectorId": "missing-connector-id",
                "schema": "public", "table": "users", "selectedColumns": [],
            }},
        ],
        "edges": [],
    }
    pipeline = _seed_pipeline(db, definition)
    run = _seed_run(db, pipeline.id)

    run_service._run_pipeline(run.id, pipeline.id, pipeline.name, definition, {})

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.FAILED
    assert run_after.error_message is not None


def test_run_pipeline_preserves_cancellation(db):
    """If the run is cancelled while executing, _run_pipeline must not overwrite its state."""
    connector = _seed_connector(db)
    cid = str(connector.id)

    _table_data["users"] = QueryResult(
        columns=["id"], rows=[[1], [2]], row_count=2,
    )

    definition = {
        "nodes": [
            {"id": "s1", "type": "source", "position": {"x": 0, "y": 0}, "data": {
                "label": "Users", "connectorId": cid,
                "schema": "public", "table": "users", "selectedColumns": [],
            }},
            {"id": "d1", "type": "destination", "position": {"x": 400, "y": 0}, "data": {
                "label": "Out", "connectorId": cid,
                "schema": "staging", "table": "out", "writeMode": "append",
            }},
        ],
        "edges": [{"id": "e1", "source": "s1", "target": "d1"}],
    }
    pipeline = _seed_pipeline(db, definition)
    run = _seed_run(db, pipeline.id)

    # Cancel the run *before* _run_pipeline runs — simulates user clicking Cancel
    # after dispatch but before execution completes.
    run.status = RunStatus.CANCELLED
    run.error_message = "Cancelled by user"
    db.commit()

    connector_configs = {cid: (ConnectorType.POSTGRESQL, {"host": "x"})}
    run_service._run_pipeline(run.id, pipeline.id, pipeline.name, definition, connector_configs)

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.CANCELLED
    assert run_after.error_message == "Cancelled by user"
    # Data was still written (can't un-do side effects), but run state is preserved.


def test_run_pipeline_captures_crash_from_registry(db, monkeypatch):
    """If ConnectorRegistry.create raises, the exception is caught and run marked FAILED."""
    connector = _seed_connector(db)
    cid = str(connector.id)

    definition = {
        "nodes": [
            {"id": "s1", "type": "source", "position": {"x": 0, "y": 0}, "data": {
                "label": "X", "connectorId": cid,
                "schema": "public", "table": "users", "selectedColumns": [],
            }},
        ],
        "edges": [],
    }
    pipeline = _seed_pipeline(db, definition)
    run = _seed_run(db, pipeline.id)

    def _boom(*args, **kwargs):
        raise RuntimeError("connector init blew up")

    monkeypatch.setattr(ConnectorRegistry, "create", classmethod(lambda cls, *a, **kw: _boom()))

    connector_configs = {cid: (ConnectorType.POSTGRESQL, {"host": "x"})}
    run_service._run_pipeline(run.id, pipeline.id, pipeline.name, definition, connector_configs)

    db.expire_all()
    run_after = db.query(PipelineRun).filter(PipelineRun.id == run.id).first()
    assert run_after.status == RunStatus.FAILED
    assert "connector init blew up" in (run_after.error_message or "")
    pipeline_after = db.query(Pipeline).filter(Pipeline.id == pipeline.id).first()
    assert pipeline_after.status == PipelineStatus.FAILED
