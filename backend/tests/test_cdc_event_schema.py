"""Unit tests for the cdc event-log schema builders.

Builders are pure functions over primitive inputs (rows, columns, metadata).
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest


def test_build_poll_upsert_event_shape():
    from app.services.cdc_events import build_poll_upsert_event

    row = [1, "Alice", "a@b.com", datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc)]
    columns = ["id", "name", "email", "updated_at"]
    event = build_poll_upsert_event(
        row=row,
        columns=columns,
        tracking_column="updated_at",
        table_name="public.users",
    )

    assert event["_op"] == "upsert"
    assert event["_table"] == "public.users"
    assert event["_kind"] == "poll"
    assert event["_position"] == "2026-04-19T12:00:00+00:00"
    assert event["before"] is None
    assert event["after"]["id"] == 1
    assert event["after"]["name"] == "Alice"
    # datetime serialized as ISO
    assert event["after"]["updated_at"] == "2026-04-19T12:00:00+00:00"
    # _ts is ISO and parseable
    assert "_ts" in event
    datetime.fromisoformat(event["_ts"].replace("Z", "+00:00"))
    assert event["updated_fields"] is None


def test_build_poll_upsert_event_no_tracking_column_in_row():
    """If tracking_column isn't in columns, _position falls back to empty string."""
    from app.services.cdc_events import build_poll_upsert_event

    event = build_poll_upsert_event(
        row=[1, "Alice"],
        columns=["id", "name"],
        tracking_column="updated_at",   # not in columns
        table_name="public.users",
    )
    assert event["_position"] == ""


def test_build_wal_event_insert():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="insert",
        lsn="0/3D3F490",
        table_name="public.users",
        before=None,
        after={"id": 42, "name": "Alice"},
        updated_fields=None,
    )
    assert event["_op"] == "insert"
    assert event["_kind"] == "pg_wal"
    assert event["_position"] == "0/3D3F490"
    assert event["before"] is None
    assert event["after"] == {"id": 42, "name": "Alice"}
    assert event["updated_fields"] is None


def test_build_wal_event_update_with_fields():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="update",
        lsn="0/3D3F4A8",
        table_name="public.users",
        before={"id": 42, "name": "Alice", "email": "old@x"},
        after={"id": 42, "name": "Alice", "email": "new@x"},
        updated_fields=["email"],
    )
    assert event["_op"] == "update"
    assert event["before"] == {"id": 42, "name": "Alice", "email": "old@x"}
    assert event["after"] == {"id": 42, "name": "Alice", "email": "new@x"}
    assert event["updated_fields"] == ["email"]


def test_build_wal_event_delete():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="delete",
        lsn="0/3D3F4B0",
        table_name="public.users",
        before={"id": 42, "name": "Alice"},
        after=None,
        updated_fields=None,
    )
    assert event["_op"] == "delete"
    assert event["before"] == {"id": 42, "name": "Alice"}
    assert event["after"] is None


def test_build_mongo_event_replace():
    from app.services.cdc_events import build_mongo_event

    event = build_mongo_event(
        op="replace",
        resume_token_hex="abcd1234",
        table_name="mydb.users",
        before=None,
        after={"_id": "507f", "name": "Alice"},
        updated_fields=None,
    )
    assert event["_op"] == "replace"
    assert event["_kind"] == "mongo_change_stream"
    assert event["_position"] == "abcd1234"
    assert event["after"]["_id"] == "507f"


def test_event_serializes_bytes_and_nested_dicts():
    from app.services.cdc_events import build_wal_event

    event = build_wal_event(
        op="insert",
        lsn="0/1",
        table_name="t",
        before=None,
        after={
            "id": 1,
            "blob": b"\x00\x01",            # should become hex
            "meta": {"nested": "value"},   # should pass through
            "ts": datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc),  # ISO
        },
        updated_fields=None,
    )
    assert event["after"]["blob"] == "0001"
    assert event["after"]["meta"] == {"nested": "value"}
    assert event["after"]["ts"] == "2026-04-19T12:00:00+00:00"
