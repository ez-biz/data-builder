from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.connector import ConnectorType


class ConnectorCreate(BaseModel):
    name: str
    connector_type: ConnectorType
    connection_config: dict


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    connection_config: Optional[dict] = None
    is_active: Optional[bool] = None


class ConnectorResponse(BaseModel):
    id: uuid.UUID
    name: str
    connector_type: ConnectorType
    is_active: bool
    last_tested_at: Optional[datetime] = None
    test_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    latency_ms: Optional[float] = None
    server_version: Optional[str] = None
