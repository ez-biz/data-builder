from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.pipeline import PipelineStatus


class PipelineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    source_connector_id: Optional[uuid.UUID] = None
    definition: dict = {"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}


class PipelineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    definition: Optional[dict] = None
    source_connector_id: Optional[uuid.UUID] = None
    schedule_cron: Optional[str] = None


class PipelineResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    status: PipelineStatus
    definition: dict
    source_connector_id: Optional[uuid.UUID] = None
    schedule_cron: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PipelineListItem(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    status: PipelineStatus
    source_connector_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ValidationError(BaseModel):
    node_id: Optional[str] = None
    message: str


class PipelineValidationResult(BaseModel):
    valid: bool
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []
