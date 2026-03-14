from __future__ import annotations


def _create_pipeline(client, definition=None):
    resp = client.post("/api/pipelines", json={"name": "Test"})
    pid = resp.json()["id"]
    if definition:
        client.put(f"/api/pipelines/{pid}", json={"definition": definition})
    return pid


def test_validate_empty_pipeline(client):
    pid = _create_pipeline(client)
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("at least one node" in e["message"] for e in data["errors"])


def test_validate_no_source(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "destination", "position": {"x": 0, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("source" in e["message"].lower() for e in data["errors"])


def test_validate_no_destination(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "in", "connectorId": "c", "schema": "s", "table": "t", "selectedColumns": ["id"]}},
        ],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("destination" in e["message"].lower() for e in data["errors"])


def test_validate_source_missing_connector(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "in", "connectorId": "", "schema": "s", "table": "t", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "destination", "position": {"x": 300, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("missing connector" in e["message"].lower() for e in data["errors"])


def test_validate_source_missing_table(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "in", "connectorId": "c", "schema": "s", "table": "", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "destination", "position": {"x": 300, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("missing table" in e["message"].lower() for e in data["errors"])


def test_validate_join_needs_two_inputs(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "src", "connectorId": "c", "schema": "s", "table": "t", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "join", "position": {"x": 200, "y": 0},
             "data": {"label": "join", "joinType": "inner", "leftKey": "id", "rightKey": "id"}},
            {"id": "n3", "type": "destination", "position": {"x": 400, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("exactly 2 input" in e["message"] for e in data["errors"])


def test_validate_cycle_detection(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "src", "connectorId": "c", "schema": "s", "table": "t", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "filter", "position": {"x": 200, "y": 0},
             "data": {"label": "f1", "conditions": [{"column": "x", "operator": "eq", "value": "1"}], "logicalOperator": "AND"}},
            {"id": "n3", "type": "filter", "position": {"x": 400, "y": 0},
             "data": {"label": "f2", "conditions": [{"column": "y", "operator": "eq", "value": "2"}], "logicalOperator": "AND"}},
            {"id": "n4", "type": "destination", "position": {"x": 600, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
            {"id": "e3", "source": "n3", "target": "n2"},  # Cycle!
            {"id": "e4", "source": "n3", "target": "n4"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is False
    assert any("cycle" in e["message"].lower() for e in data["errors"])


def test_validate_valid_pipeline(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "src", "connectorId": "c", "schema": "public", "table": "users", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "filter", "position": {"x": 200, "y": 0},
             "data": {"label": "active", "conditions": [{"column": "active", "operator": "eq", "value": "true"}], "logicalOperator": "AND"}},
            {"id": "n3", "type": "destination", "position": {"x": 400, "y": 0},
             "data": {"label": "out", "connectorId": "c", "schema": "analytics", "table": "active_users", "writeMode": "overwrite"}},
        ],
        "edges": [
            {"id": "e1", "source": "n1", "target": "n2"},
            {"id": "e2", "source": "n2", "target": "n3"},
        ],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    resp = client.post(f"/api/pipelines/{pid}/validate")
    data = resp.json()
    assert data["valid"] is True
    assert len(data["errors"]) == 0


def test_validate_sets_pipeline_status(client):
    pid = _create_pipeline(client, {
        "nodes": [
            {"id": "n1", "type": "source", "position": {"x": 0, "y": 0},
             "data": {"label": "s", "connectorId": "c", "schema": "s", "table": "t", "selectedColumns": ["id"]}},
            {"id": "n2", "type": "destination", "position": {"x": 200, "y": 0},
             "data": {"label": "d", "connectorId": "c", "schema": "s", "table": "t", "writeMode": "append"}},
        ],
        "edges": [{"id": "e1", "source": "n1", "target": "n2"}],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    })
    client.post(f"/api/pipelines/{pid}/validate")
    pipeline = client.get(f"/api/pipelines/{pid}").json()
    assert pipeline["status"] == "valid"
