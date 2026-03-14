def test_create_pipeline(client):
    response = client.post(
        "/api/pipelines",
        json={"name": "Test Pipeline"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Pipeline"
    assert data["status"] == "draft"
    assert data["definition"]["nodes"] == []


def test_list_pipelines(client):
    client.post("/api/pipelines", json={"name": "Pipeline 1"})
    client.post("/api/pipelines", json={"name": "Pipeline 2"})
    response = client.get("/api/pipelines")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_update_pipeline_definition(client):
    create_resp = client.post("/api/pipelines", json={"name": "My Pipeline"})
    pipeline_id = create_resp.json()["id"]

    definition = {
        "nodes": [
            {
                "id": "node-1",
                "type": "source",
                "position": {"x": 100, "y": 200},
                "data": {
                    "label": "users",
                    "connectorId": "some-uuid",
                    "schema": "public",
                    "table": "users",
                    "columns": [],
                    "selectedColumns": ["id", "name"],
                },
            }
        ],
        "edges": [],
        "viewport": {"x": 0, "y": 0, "zoom": 1},
    }
    response = client.put(
        f"/api/pipelines/{pipeline_id}",
        json={"definition": definition},
    )
    assert response.status_code == 200
    assert len(response.json()["definition"]["nodes"]) == 1


def test_validate_pipeline_empty(client):
    create_resp = client.post("/api/pipelines", json={"name": "Empty"})
    pipeline_id = create_resp.json()["id"]
    response = client.post(f"/api/pipelines/{pipeline_id}/validate")
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is False
    assert len(data["errors"]) > 0


def test_delete_pipeline(client):
    create_resp = client.post("/api/pipelines", json={"name": "To Delete"})
    pipeline_id = create_resp.json()["id"]
    response = client.delete(f"/api/pipelines/{pipeline_id}")
    assert response.status_code == 204
    response = client.get(f"/api/pipelines/{pipeline_id}")
    assert response.status_code == 404
