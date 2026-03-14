"""S3 writer for CDC output files."""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timezone
from typing import Any

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("data_builder.s3")


class S3Writer:
    """Writes data to S3 in JSONL or CSV format."""

    def __init__(self, bucket: str, region: str = "us-east-1"):
        self._bucket = bucket
        self._s3 = boto3.client("s3", region_name=region)

    def write_jsonl(
        self,
        prefix: str,
        table_name: str,
        columns: list[str],
        rows: list[list[Any]],
        batch_id: str,
    ) -> str:
        """Write rows as JSONL to S3. Returns the S3 path."""
        now = datetime.now(timezone.utc)
        key = (
            f"{prefix.rstrip('/')}/{table_name}/"
            f"year={now.year}/month={now.month:02d}/day={now.day:02d}/"
            f"{batch_id}.jsonl"
        )

        buf = io.StringIO()
        for row in rows:
            record = {}
            for col, val in zip(columns, row):
                record[col] = _serialize_value(val)
            record["_cdc_captured_at"] = now.isoformat()
            buf.write(json.dumps(record, default=str) + "\n")

        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=buf.getvalue().encode("utf-8"),
            ContentType="application/x-ndjson",
        )
        logger.info("Wrote %d rows to s3://%s/%s", len(rows), self._bucket, key)
        return f"s3://{self._bucket}/{key}"

    def write_csv(
        self,
        prefix: str,
        table_name: str,
        columns: list[str],
        rows: list[list[Any]],
        batch_id: str,
    ) -> str:
        """Write rows as CSV to S3. Returns the S3 path."""
        import csv

        now = datetime.now(timezone.utc)
        key = (
            f"{prefix.rstrip('/')}/{table_name}/"
            f"year={now.year}/month={now.month:02d}/day={now.day:02d}/"
            f"{batch_id}.csv"
        )

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(columns + ["_cdc_captured_at"])
        for row in rows:
            writer.writerow([_serialize_value(v) for v in row] + [now.isoformat()])

        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=buf.getvalue().encode("utf-8"),
            ContentType="text/csv",
        )
        logger.info("Wrote %d rows to s3://%s/%s", len(rows), self._bucket, key)
        return f"s3://{self._bucket}/{key}"

    def test_access(self) -> bool:
        """Verify we can write to the bucket."""
        try:
            self._s3.head_bucket(Bucket=self._bucket)
            return True
        except ClientError:
            return False


def _serialize_value(val: Any) -> Any:
    """Convert non-serializable types for JSON/CSV output."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, bytes):
        return val.hex()
    if isinstance(val, (dict, list)):
        return json.dumps(val, default=str)
    return val
