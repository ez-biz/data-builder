from __future__ import annotations


def test_invalid_schema_name_rejected(client):
    """Schema names with injection attempts should be rejected."""
    response = client.get(
        "/api/catalog/00000000-0000-0000-0000-000000000000/schemas/DROP TABLE users--/tables"
    )
    assert response.status_code == 400
    assert "Invalid" in response.json()["detail"]


def test_invalid_table_name_rejected(client):
    response = client.get(
        "/api/catalog/00000000-0000-0000-0000-000000000000/schemas/public/tables/'; DROP TABLE--/columns"
    )
    assert response.status_code == 400


def test_valid_identifier_accepted(client):
    """Valid identifiers should pass validation (may still 404 on connector)."""
    response = client.get(
        "/api/catalog/00000000-0000-0000-0000-000000000000/schemas/public_schema/tables"
    )
    # Should not be 400 (validation pass), but 404 (connector not found)
    assert response.status_code == 404
