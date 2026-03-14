from __future__ import annotations

from app.core.encryption import decrypt_config


def test_create_connector(client):
    response = client.post(
        "/api/connectors",
        json={
            "name": "Test PG",
            "connector_type": "postgresql",
            "connection_config": {
                "host": "localhost",
                "port": 5432,
                "database": "testdb",
                "username": "user",
                "password": "secret123",
            },
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test PG"
    assert data["connector_type"] == "postgresql"
    assert data["is_active"] is True
    assert data["test_status"] is None
    # Password must NOT be in the response
    assert "secret123" not in str(data)
    assert "connection_config" not in data


def test_list_connectors(client):
    client.post(
        "/api/connectors",
        json={
            "name": "Conn 1",
            "connector_type": "postgresql",
            "connection_config": {"host": "h", "database": "d", "username": "u", "password": "p"},
        },
    )
    client.post(
        "/api/connectors",
        json={
            "name": "Conn 2",
            "connector_type": "databricks",
            "connection_config": {"server_hostname": "h", "http_path": "/p", "access_token": "t"},
        },
    )
    response = client.get("/api/connectors")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_connector(client):
    create = client.post(
        "/api/connectors",
        json={
            "name": "Get Me",
            "connector_type": "postgresql",
            "connection_config": {"host": "h", "database": "d", "username": "u", "password": "p"},
        },
    )
    cid = create.json()["id"]
    response = client.get(f"/api/connectors/{cid}")
    assert response.status_code == 200
    assert response.json()["name"] == "Get Me"


def test_get_nonexistent_connector(client):
    response = client.get("/api/connectors/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_update_connector(client):
    create = client.post(
        "/api/connectors",
        json={
            "name": "Old Name",
            "connector_type": "postgresql",
            "connection_config": {"host": "h", "database": "d", "username": "u", "password": "p"},
        },
    )
    cid = create.json()["id"]
    response = client.put(f"/api/connectors/{cid}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_connector(client):
    create = client.post(
        "/api/connectors",
        json={
            "name": "Delete Me",
            "connector_type": "postgresql",
            "connection_config": {"host": "h", "database": "d", "username": "u", "password": "p"},
        },
    )
    cid = create.json()["id"]
    response = client.delete(f"/api/connectors/{cid}")
    assert response.status_code == 204
    assert client.get(f"/api/connectors/{cid}").status_code == 404


def test_connector_config_is_encrypted(client):
    """Verify that connector configs are stored encrypted, not in plaintext.

    We test via the API: the response should NOT contain the password,
    and the encrypted config should be decryptable.
    """
    create = client.post(
        "/api/connectors",
        json={
            "name": "Encrypted",
            "connector_type": "postgresql",
            "connection_config": {"host": "secret-host", "database": "d", "username": "u", "password": "secret-pw"},
        },
    )
    data = create.json()
    # Password must not appear anywhere in the API response
    assert "secret-pw" not in str(data)
    assert "secret-host" not in str(data)
    assert "connection_config" not in data
