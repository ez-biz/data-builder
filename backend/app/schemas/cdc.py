from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.models.cdc_job import CDCKind, CDCStatus

_POLL_FORMATS = {"jsonl", "csv", "event-jsonl"}
_EVENT_ONLY_FORMATS = {"event-jsonl"}
_PG_WAL_DEFAULT_OPS = ["insert", "update", "delete"]
_MONGO_DEFAULT_OPS = ["insert", "update", "replace", "delete"]


class CDCJobCreate(BaseModel):
    name: str
    connector_id: uuid.UUID
    cdc_kind: CDCKind = CDCKind.POLL
    source_schema: str
    source_table: str
    tracking_column: Optional[str] = None
    s3_bucket: str
    s3_prefix: str = "cdc/"
    s3_region: str = "us-east-1"
    output_format: Optional[str] = None
    sync_interval_seconds: int = 300
    checkpoint_interval_seconds: int = 10
    operation_filter: Optional[list[str]] = None

    @model_validator(mode="after")
    def _validate_per_kind(self) -> "CDCJobCreate":
        kind = self.cdc_kind
        if kind == CDCKind.POLL:
            if not self.tracking_column:
                raise ValueError(
                    "tracking_column is required for cdc_kind=poll"
                )
            fmt = self.output_format or "jsonl"
            if fmt not in _POLL_FORMATS:
                raise ValueError(
                    f"output_format must be one of {sorted(_POLL_FORMATS)} for poll kind"
                )
            self.output_format = fmt
            self.operation_filter = None
        elif kind == CDCKind.PG_WAL:
            if self.tracking_column:
                raise ValueError(
                    "tracking_column must be None for cdc_kind=pg_wal"
                )
            fmt = self.output_format or "event-jsonl"
            if fmt not in _EVENT_ONLY_FORMATS:
                raise ValueError(
                    "output_format must be 'event-jsonl' for pg_wal kind"
                )
            self.output_format = fmt
            if self.operation_filter is None:
                self.operation_filter = list(_PG_WAL_DEFAULT_OPS)
        elif kind == CDCKind.MONGO_CHANGE_STREAM:
            if self.tracking_column:
                raise ValueError(
                    "tracking_column must be None for cdc_kind=mongo_change_stream"
                )
            fmt = self.output_format or "event-jsonl"
            if fmt not in _EVENT_ONLY_FORMATS:
                raise ValueError(
                    "output_format must be 'event-jsonl' for mongo_change_stream kind"
                )
            self.output_format = fmt
            if self.operation_filter is None:
                self.operation_filter = list(_MONGO_DEFAULT_OPS)
        return self


class CDCJobUpdate(BaseModel):
    name: Optional[str] = None
    tracking_column: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_prefix: Optional[str] = None
    s3_region: Optional[str] = None
    output_format: Optional[str] = None
    sync_interval_seconds: Optional[int] = None
    checkpoint_interval_seconds: Optional[int] = None
    operation_filter: Optional[list[str]] = None


class CDCJobResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_id: uuid.UUID
    status: CDCStatus
    cdc_kind: CDCKind
    source_schema: str
    source_table: str
    tracking_column: Optional[str] = None
    s3_bucket: str
    s3_prefix: str
    s3_region: str
    output_format: str
    sync_interval_seconds: int
    checkpoint_interval_seconds: int
    last_sync_at: Optional[datetime] = None
    last_value: Optional[str] = None
    resume_token: Optional[str] = None
    operation_filter: Optional[list[str]] = None
    total_rows_synced: int = 0
    error_message: Optional[str] = None
    celery_task_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CDCSyncLogResponse(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    started_at: datetime
    finished_at: Optional[datetime] = None
    rows_captured: int = 0
    s3_path: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
