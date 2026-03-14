from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.pipeline_run import RunStatus


class PipelineRunResponse(BaseModel):
    id: uuid.UUID
    pipeline_id: uuid.UUID
    status: RunStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error_message: Optional[str] = None
    rows_processed: Optional[int] = None
    node_results: Optional[dict] = None
    triggered_by: str = "manual"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineRunListItem(BaseModel):
    id: uuid.UUID
    pipeline_id: uuid.UUID
    status: RunStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    rows_processed: Optional[int] = None
    error_message: Optional[str] = None
    triggered_by: str = "manual"
    created_at: datetime

    model_config = {"from_attributes": True}
