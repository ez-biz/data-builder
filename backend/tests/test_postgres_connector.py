"""Unit tests for pieces of the Postgres connector that don't require a DB."""
from __future__ import annotations

from psycopg2.extras import Json

from app.connectors.postgres import _adapt_value


def test_adapt_value_passes_scalars_through():
    assert _adapt_value(1) == 1
    assert _adapt_value("hello") == "hello"
    assert _adapt_value(None) is None
    assert _adapt_value(3.14) == 3.14
    assert _adapt_value(True) is True


def test_adapt_value_wraps_dict_in_json():
    adapted = _adapt_value({"a": 1, "b": [2, 3]})
    assert isinstance(adapted, Json)


def test_adapt_value_wraps_list_in_json():
    adapted = _adapt_value([1, 2, {"nested": True}])
    assert isinstance(adapted, Json)


def test_adapt_value_passes_bytes_through():
    """bytes are a valid psycopg2 input for bytea columns."""
    assert _adapt_value(b"\x00\x01") == b"\x00\x01"
