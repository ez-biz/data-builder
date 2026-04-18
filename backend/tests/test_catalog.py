"""Tests for the catalog HTTP layer and service.

Uses a mock connector registered in place of POSTGRESQL so no real DB is hit.
"""
from __future__ import annotations

import uuid

import pytest

from app.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionTestResult,
    PreviewResult,
    QueryResult,
    SchemaInfo,
    TableInfo,
)
from app.connectors.registry import ConnectorRegistry
from app.models.connector import ConnectorType


# Stub fixture state the mock reads from
_schemas: list[SchemaInfo] = []
_tables: dict[str, list[TableInfo]] = {}
_columns: dict[tuple[str, str], list[ColumnInfo]] = {}
_preview: dict[tuple[str, str], PreviewResult] = {}


class _MockPGConnector(BaseConnector):
    def test_connection(self):
        return ConnectionTestResult(success=True, message="ok")

    def get_schemas(self):
        return list(_schemas)

    def get_tables(self, schema):
        return list(_tables.get(schema, []))

    def get_columns(self, schema, table):
        return list(_columns.get((schema, table), []))

    def preview_table(self, schema, table, limit=50):
        return _preview.get((schema, table), PreviewResult(columns=[], rows=[], total_rows_returned=0))

    def execute_query(self, query, params=None):
        return QueryResult(columns=[], rows=[], row_count=0)

    def write_table(self, schema, table, columns, rows, mode="append"):
        return 0


@pytest.fixture(autouse=True)
def register_mock_connector():
    original_registry = dict(ConnectorRegistry._registry)
    ConnectorRegistry._registry[ConnectorType.POSTGRESQL] = _MockPGConnector
    _schemas.clear()
    _tables.clear()
    _columns.clear()
    _preview.clear()
    yield
    ConnectorRegistry._registry.clear()
    ConnectorRegistry._registry.update(original_registry)


def _create_connector(client) -> str:
    resp = client.post(
        "/api/connectors",
        json={
            "name": "pg",
            "connector_type": "postgresql",
            "connection_config": {
                "host": "x",
                "port": 5432,
                "database": "d",
                "username": "u",
                "password": "p",
            },
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# --- Schemas ---


def test_list_schemas_returns_connector_data(client):
    connector_id = _create_connector(client)
    _schemas.extend([
        SchemaInfo(name="public", table_count=5),
        SchemaInfo(name="analytics", table_count=2),
    ])

    resp = client.get(f"/api/catalog/{connector_id}/schemas")
    assert resp.status_code == 200
    body = resp.json()
    assert body["connector_id"] == connector_id
    assert len(body["schemas"]) == 2
    assert body["schemas"][0] == {"name": "public", "table_count": 5}


def test_list_schemas_missing_connector_returns_404(client):
    resp = client.get(f"/api/catalog/{uuid.uuid4()}/schemas")
    assert resp.status_code == 404


# --- Tables ---


def test_list_tables(client):
    connector_id = _create_connector(client)
    _tables["public"] = [
        TableInfo(name="users", table_type="base table", row_count_estimate=100),
        TableInfo(name="orders", table_type="base table", row_count_estimate=500),
    ]

    resp = client.get(f"/api/catalog/{connector_id}/schemas/public/tables")
    assert resp.status_code == 200
    body = resp.json()
    assert body["schema_name"] == "public"
    assert [t["name"] for t in body["tables"]] == ["users", "orders"]


def test_list_tables_invalid_schema_name_rejected(client):
    connector_id = _create_connector(client)
    resp = client.get(f"/api/catalog/{connector_id}/schemas/bad;drop/tables")
    assert resp.status_code == 400


# --- Columns ---


def test_list_columns(client):
    connector_id = _create_connector(client)
    _columns[("public", "users")] = [
        ColumnInfo(name="id", data_type="uuid", is_nullable=False, is_primary_key=True),
        ColumnInfo(name="email", data_type="text", is_nullable=False, is_primary_key=False),
    ]

    resp = client.get(f"/api/catalog/{connector_id}/schemas/public/tables/users/columns")
    assert resp.status_code == 200
    body = resp.json()
    assert body["table"] == "users"
    assert len(body["columns"]) == 2
    assert body["columns"][0]["is_primary_key"] is True


def test_list_columns_invalid_table_name_rejected(client):
    connector_id = _create_connector(client)
    resp = client.get(f"/api/catalog/{connector_id}/schemas/public/tables/bad-table/columns")
    assert resp.status_code == 400


# --- Preview ---


def test_preview_table(client):
    connector_id = _create_connector(client)
    _preview[("public", "users")] = PreviewResult(
        columns=["id", "email"],
        rows=[[1, "a@b.com"], [2, "c@d.com"]],
        total_rows_returned=2,
    )

    resp = client.get(f"/api/catalog/{connector_id}/schemas/public/tables/users/preview")
    assert resp.status_code == 200
    body = resp.json()
    assert body["columns"] == ["id", "email"]
    assert body["rows"] == [[1, "a@b.com"], [2, "c@d.com"]]
    assert body["total_rows_returned"] == 2


def test_preview_table_limit_capped(client):
    connector_id = _create_connector(client)
    resp = client.get(
        f"/api/catalog/{connector_id}/schemas/public/tables/users/preview?limit=999"
    )
    # FastAPI's Query le=500 validation → 422
    assert resp.status_code == 422
