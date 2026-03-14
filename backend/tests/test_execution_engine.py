"""Tests for the pipeline execution engine."""
from __future__ import annotations

import pytest

from app.connectors.base import BaseConnector, ConnectionTestResult, QueryResult
from app.services.execution_engine import PipelineExecutor


class MockConnector(BaseConnector):
    """Mock connector for testing execution engine."""

    def __init__(self, data: dict[str, QueryResult] | None = None):
        super().__init__({})
        self._data = data or {}
        self.written: list[dict] = []

    def test_connection(self) -> ConnectionTestResult:
        return ConnectionTestResult(success=True, message="ok")

    def get_schemas(self):
        return []

    def get_tables(self, schema):
        return []

    def get_columns(self, schema, table):
        return []

    def preview_table(self, schema, table, limit=50):
        raise NotImplementedError

    def execute_query(self, query, params=None) -> QueryResult:
        # Return data based on table name in query
        for key, result in self._data.items():
            if key in query:
                return result
        return QueryResult(columns=[], rows=[], row_count=0)

    def write_table(self, schema, table, columns, rows, mode="append") -> int:
        self.written.append({
            "schema": schema,
            "table": table,
            "columns": columns,
            "rows": rows,
            "mode": mode,
        })
        return len(rows)


def _make_definition(nodes, edges):
    return {"nodes": nodes, "edges": edges, "viewport": {"x": 0, "y": 0, "zoom": 1}}


def test_source_to_destination():
    """End-to-end: read from source → write to destination."""
    mock = MockConnector(data={
        "users": QueryResult(
            columns=["id", "name", "email"],
            rows=[[1, "Alice", "a@b.com"], [2, "Bob", "b@c.com"]],
            row_count=2,
        )
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Users", "connectorId": "c1",
                "schema": "public", "table": "users", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "d1", "type": "destination", "data": {
                "label": "Output", "connectorId": "c1",
                "schema": "staging", "table": "users_copy", "writeMode": "append",
            }, "position": {"x": 400, "y": 0}},
        ],
        edges=[{"id": "e1", "source": "s1", "target": "d1"}],
    )

    executor = PipelineExecutor(connectors={"c1": mock})
    result = executor.execute(definition)

    assert result.success
    assert result.rows_processed == 2
    assert len(mock.written) == 1
    assert mock.written[0]["rows"] == [[1, "Alice", "a@b.com"], [2, "Bob", "b@c.com"]]


def test_filter_node():
    """Source → Filter → Destination."""
    mock = MockConnector(data={
        "orders": QueryResult(
            columns=["id", "amount", "status"],
            rows=[
                [1, 100, "paid"],
                [2, 50, "pending"],
                [3, 200, "paid"],
            ],
            row_count=3,
        )
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Orders", "connectorId": "c1",
                "schema": "public", "table": "orders", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "f1", "type": "filter", "data": {
                "label": "Paid Only", "conditions": [
                    {"column": "status", "operator": "eq", "value": "paid"}
                ], "logicalOperator": "AND",
            }, "position": {"x": 200, "y": 0}},
            {"id": "d1", "type": "destination", "data": {
                "label": "Output", "connectorId": "c1",
                "schema": "staging", "table": "paid_orders", "writeMode": "append",
            }, "position": {"x": 400, "y": 0}},
        ],
        edges=[
            {"id": "e1", "source": "s1", "target": "f1"},
            {"id": "e2", "source": "f1", "target": "d1"},
        ],
    )

    executor = PipelineExecutor(connectors={"c1": mock})
    result = executor.execute(definition)

    assert result.success
    assert result.rows_processed == 2
    assert len(mock.written[0]["rows"]) == 2


def test_transform_rename():
    """Source → Transform (rename) → Destination."""
    mock = MockConnector(data={
        "users": QueryResult(
            columns=["id", "name"],
            rows=[[1, "Alice"]],
            row_count=1,
        )
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Users", "connectorId": "c1",
                "schema": "public", "table": "users", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "t1", "type": "transform", "data": {
                "label": "Rename", "transformations": [
                    {"sourceColumn": "name", "operation": "rename", "targetColumn": "full_name"}
                ],
            }, "position": {"x": 200, "y": 0}},
            {"id": "d1", "type": "destination", "data": {
                "label": "Output", "connectorId": "c1",
                "schema": "staging", "table": "out", "writeMode": "append",
            }, "position": {"x": 400, "y": 0}},
        ],
        edges=[
            {"id": "e1", "source": "s1", "target": "t1"},
            {"id": "e2", "source": "t1", "target": "d1"},
        ],
    )

    executor = PipelineExecutor(connectors={"c1": mock})
    result = executor.execute(definition)

    assert result.success
    assert mock.written[0]["columns"] == ["id", "full_name"]


def test_aggregate_node():
    """Source → Aggregate → Destination."""
    mock = MockConnector(data={
        "sales": QueryResult(
            columns=["region", "amount"],
            rows=[
                ["east", 100],
                ["east", 200],
                ["west", 150],
            ],
            row_count=3,
        )
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Sales", "connectorId": "c1",
                "schema": "public", "table": "sales", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "a1", "type": "aggregate", "data": {
                "label": "Sum by Region",
                "groupByColumns": ["region"],
                "aggregations": [
                    {"column": "amount", "function": "sum", "alias": "total"},
                    {"column": "amount", "function": "count", "alias": "cnt"},
                ],
            }, "position": {"x": 200, "y": 0}},
            {"id": "d1", "type": "destination", "data": {
                "label": "Output", "connectorId": "c1",
                "schema": "staging", "table": "agg_out", "writeMode": "overwrite",
            }, "position": {"x": 400, "y": 0}},
        ],
        edges=[
            {"id": "e1", "source": "s1", "target": "a1"},
            {"id": "e2", "source": "a1", "target": "d1"},
        ],
    )

    executor = PipelineExecutor(connectors={"c1": mock})
    result = executor.execute(definition)

    assert result.success
    written = mock.written[0]
    assert written["columns"] == ["region", "total", "cnt"]
    # Find east row
    east_row = [r for r in written["rows"] if r[0] == "east"][0]
    assert east_row[1] == 300  # sum
    assert east_row[2] == 2    # count


def test_join_node():
    """Two sources → Join → Destination."""
    src_connector = MockConnector(data={
        "users": QueryResult(
            columns=["id", "name"],
            rows=[[1, "Alice"], [2, "Bob"], [3, "Charlie"]],
            row_count=3,
        ),
        "orders": QueryResult(
            columns=["user_id", "total"],
            rows=[[1, 100], [1, 200], [2, 50]],
            row_count=3,
        ),
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Users", "connectorId": "c1",
                "schema": "public", "table": "users", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "s2", "type": "source", "data": {
                "label": "Orders", "connectorId": "c1",
                "schema": "public", "table": "orders", "selectedColumns": [],
            }, "position": {"x": 0, "y": 200}},
            {"id": "j1", "type": "join", "data": {
                "label": "Join", "joinType": "inner",
                "leftKey": "id", "rightKey": "user_id",
            }, "position": {"x": 200, "y": 100}},
            {"id": "d1", "type": "destination", "data": {
                "label": "Output", "connectorId": "c1",
                "schema": "staging", "table": "joined", "writeMode": "append",
            }, "position": {"x": 400, "y": 100}},
        ],
        edges=[
            {"id": "e1", "source": "s1", "target": "j1"},
            {"id": "e2", "source": "s2", "target": "j1"},
            {"id": "e3", "source": "j1", "target": "d1"},
        ],
    )

    executor = PipelineExecutor(connectors={"c1": src_connector})
    result = executor.execute(definition)

    assert result.success
    assert result.rows_processed == 3  # Alice has 2 orders, Bob has 1
    written = src_connector.written[0]
    assert len(written["rows"]) == 3


def test_empty_pipeline_fails():
    executor = PipelineExecutor(connectors={})
    result = executor.execute({"nodes": [], "edges": []})
    assert not result.success
    assert "no nodes" in result.error.lower()


def test_missing_connector_fails():
    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Test", "connectorId": "missing",
                "schema": "public", "table": "t", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
        ],
        edges=[],
    )
    executor = PipelineExecutor(connectors={})
    result = executor.execute(definition)
    assert not result.success
    assert "not found" in result.error.lower()


def test_filter_numeric_comparison():
    mock = MockConnector(data={
        "data": QueryResult(
            columns=["val"],
            rows=[[10], [20], [30], [40]],
            row_count=4,
        )
    })

    definition = _make_definition(
        nodes=[
            {"id": "s1", "type": "source", "data": {
                "label": "Data", "connectorId": "c1",
                "schema": "public", "table": "data", "selectedColumns": [],
            }, "position": {"x": 0, "y": 0}},
            {"id": "f1", "type": "filter", "data": {
                "label": "GT 15", "conditions": [
                    {"column": "val", "operator": "gt", "value": "15"}
                ], "logicalOperator": "AND",
            }, "position": {"x": 200, "y": 0}},
        ],
        edges=[{"id": "e1", "source": "s1", "target": "f1"}],
    )

    executor = PipelineExecutor(connectors={"c1": mock})
    result = executor.execute(definition)

    assert result.success
    output = executor._node_outputs["f1"]
    assert output.row_count == 3
    assert all(r[0] > 15 for r in output.rows)
