"""Event-log schema builders for CDC v2.

Pure functions. No DB, no I/O. Each returns a dict matching the event-log
JSONL shape documented in docs/cdc-event-schema.md.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_value(value: Any) -> Any:
    """Convert non-JSON-native types for event output.

    datetime → ISO, bytes → lowercase hex, dict/list → pass through.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    return value


def _serialize_row(row: list[Any], columns: list[str]) -> dict[str, Any]:
    """Convert a column-ordered row to a name->value dict with serialized values."""
    return {col: _serialize_value(val) for col, val in zip(columns, row)}


def _serialize_dict(d: dict[str, Any]) -> dict[str, Any]:
    """Serialize each value in a dict. Non-recursive (nested dicts pass through)."""
    return {k: _serialize_value(v) for k, v in d.items()}


def build_poll_upsert_event(
    *,
    row: list[Any],
    columns: list[str],
    tracking_column: str,
    table_name: str,
) -> dict[str, Any]:
    """Build an upsert event for a row emitted by the poll watcher."""
    try:
        tracking_idx = columns.index(tracking_column)
        position = str(_serialize_value(row[tracking_idx]))
    except ValueError:
        position = ""

    return {
        "_op": "upsert",
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": position,
        "_kind": "poll",
        "before": None,
        "after": _serialize_row(row, columns),
        "updated_fields": None,
    }


def build_wal_event(
    *,
    op: str,
    lsn: str,
    table_name: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    updated_fields: Optional[list[str]],
) -> dict[str, Any]:
    """Build a WAL-sourced event."""
    return {
        "_op": op,
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": lsn,
        "_kind": "pg_wal",
        "before": _serialize_dict(before) if before is not None else None,
        "after": _serialize_dict(after) if after is not None else None,
        "updated_fields": updated_fields,
    }


def build_mongo_event(
    *,
    op: str,
    resume_token_hex: str,
    table_name: str,
    before: Optional[dict[str, Any]],
    after: Optional[dict[str, Any]],
    updated_fields: Optional[list[str]],
) -> dict[str, Any]:
    """Build a Mongo Change Stream-sourced event."""
    return {
        "_op": op,
        "_table": table_name,
        "_ts": _now_iso(),
        "_position": resume_token_hex,
        "_kind": "mongo_change_stream",
        "before": _serialize_dict(before) if before is not None else None,
        "after": _serialize_dict(after) if after is not None else None,
        "updated_fields": updated_fields,
    }
