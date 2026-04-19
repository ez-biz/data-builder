from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.cdc_job import CDCStatus


class CDCJobCreate(BaseModel):
    name: str
    connector_id: uuid.UUID
    source_schema: str
    source_table: str
    tracking_column: str
    s3_bucket: str
    s3_prefix: str = "cdc/"
    s3_region: str = "us-east-1"
    output_format: str = "jsonl"
    sync_interval_seconds: int = 300


class CDCJobUpdate(BaseModel):
    name: Optional[str] = None
    tracking_column: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_prefix: Optional[str] = None
    s3_region: Optional[str] = None
    output_format: Optional[str] = None
    sync_interval_seconds: Optional[int] = None


class CDCJobResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_id: uuid.UUID
    status: CDCStatus
    source_schema: str
    source_table: str
    tracking_column: Optional[str] = None
    s3_bucket: str
    s3_prefix: str
    s3_region: str
    output_format: str
    sync_interval_seconds: int
    last_sync_at: Optional[datetime] = None
    last_value: Optional[str] = None
    total_rows_synced: int = 0
    error_message: Optional[str] = None
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
