"""Tests for CDC service and S3 writer."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from app.connectors.base import QueryResult
from app.services.s3_writer import S3Writer, _serialize_value


# --- S3 Writer Tests ---


def test_serialize_value_none():
    assert _serialize_value(None) is None


def test_serialize_value_datetime():
    from datetime import datetime, timezone
    dt = datetime(2026, 3, 14, 12, 0, 0, tzinfo=timezone.utc)
    assert _serialize_value(dt) == "2026-03-14T12:00:00+00:00"


def test_serialize_value_bytes():
    assert _serialize_value(b"\x00\xff") == "00ff"


def test_serialize_value_dict():
    assert _serialize_value({"a": 1}) == '{"a": 1}'


def test_serialize_value_passthrough():
    assert _serialize_value(42) == 42
    assert _serialize_value("hello") == "hello"


@patch("app.services.s3_writer.boto3")
def test_write_jsonl(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    writer = S3Writer(bucket="test-bucket", region="us-east-1")
    path = writer.write_jsonl(
        prefix="cdc/",
        table_name="users",
        columns=["id", "name"],
        rows=[[1, "Alice"], [2, "Bob"]],
        batch_id="abc123",
    )

    assert path.startswith("s3://test-bucket/cdc/users/")
    assert "abc123.jsonl" in path

    # Verify put_object was called
    mock_client.put_object.assert_called_once()
    call_kwargs = mock_client.put_object.call_args[1]
    assert call_kwargs["Bucket"] == "test-bucket"
    assert call_kwargs["ContentType"] == "application/x-ndjson"

    # Verify content is valid JSONL
    body = call_kwargs["Body"].decode("utf-8")
    lines = [json.loads(line) for line in body.strip().split("\n")]
    assert len(lines) == 2
    assert lines[0]["id"] == 1
    assert lines[0]["name"] == "Alice"
    assert "_cdc_captured_at" in lines[0]
    assert lines[1]["id"] == 2
    assert lines[1]["name"] == "Bob"


@patch("app.services.s3_writer.boto3")
def test_write_csv(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    writer = S3Writer(bucket="test-bucket", region="us-west-2")
    path = writer.write_csv(
        prefix="output/",
        table_name="orders",
        columns=["id", "total"],
        rows=[[1, 100.5], [2, 200.0]],
        batch_id="xyz789",
    )

    assert "orders" in path
    assert "xyz789.csv" in path

    call_kwargs = mock_client.put_object.call_args[1]
    assert call_kwargs["ContentType"] == "text/csv"

    body = call_kwargs["Body"].decode("utf-8")
    lines = body.strip().split("\n")
    assert len(lines) == 3  # header + 2 data rows
    assert "id,total,_cdc_captured_at" in lines[0]


@patch("app.services.s3_writer.boto3")
def test_s3_path_partitioning(mock_boto3):
    """Verify S3 paths use date-based partitioning."""
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    writer = S3Writer(bucket="b", region="us-east-1")
    path = writer.write_jsonl(
        prefix="cdc/",
        table_name="events",
        columns=["x"],
        rows=[[1]],
        batch_id="test",
    )

    assert "/year=" in path
    assert "/month=" in path
    assert "/day=" in path


@patch("app.services.s3_writer.boto3")
def test_test_access_success(mock_boto3):
    mock_client = MagicMock()
    mock_boto3.client.return_value = mock_client

    writer = S3Writer(bucket="test-bucket")
    assert writer.test_access() is True
    mock_client.head_bucket.assert_called_once_with(Bucket="test-bucket")


@patch("app.services.s3_writer.boto3")
def test_test_access_failure(mock_boto3):
    from botocore.exceptions import ClientError

    mock_client = MagicMock()
    mock_client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "404"}}, "HeadBucket"
    )
    mock_boto3.client.return_value = mock_client

    writer = S3Writer(bucket="nonexistent")
    assert writer.test_access() is False
