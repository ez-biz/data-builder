from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.exceptions import ConnectorNotFoundError
from app.database import get_db
from app.schemas.connector import (
    ConnectionTestResult,
    ConnectorCreate,
    ConnectorResponse,
    ConnectorUpdate,
)
from app.services import connector_service

router = APIRouter(prefix="/connectors", tags=["connectors"])


@router.get("", response_model=list[ConnectorResponse])
def list_connectors(db: Session = Depends(get_db)):
    return connector_service.get_connectors(db)


@router.post("", response_model=ConnectorResponse, status_code=201)
def create_connector(data: ConnectorCreate, db: Session = Depends(get_db)):
    return connector_service.create_connector(db, data)


@router.get("/{connector_id}", response_model=ConnectorResponse)
def get_connector(connector_id: uuid.UUID, db: Session = Depends(get_db)):
    connector = connector_service.get_connector(db, connector_id)
    if not connector:
        raise ConnectorNotFoundError(str(connector_id))
    return connector


@router.put("/{connector_id}", response_model=ConnectorResponse)
def update_connector(
    connector_id: uuid.UUID, data: ConnectorUpdate, db: Session = Depends(get_db)
):
    connector = connector_service.get_connector(db, connector_id)
    if not connector:
        raise ConnectorNotFoundError(str(connector_id))
    return connector_service.update_connector(db, connector, data)


@router.delete("/{connector_id}", status_code=204)
def delete_connector(connector_id: uuid.UUID, db: Session = Depends(get_db)):
    connector = connector_service.get_connector(db, connector_id)
    if not connector:
        raise ConnectorNotFoundError(str(connector_id))
    connector_service.delete_connector(db, connector)


@router.post("/{connector_id}/test", response_model=ConnectionTestResult)
def test_connector(connector_id: uuid.UUID, db: Session = Depends(get_db)):
    connector = connector_service.get_connector(db, connector_id)
    if not connector:
        raise ConnectorNotFoundError(str(connector_id))
    result = connector_service.test_connector(db, connector)
    return ConnectionTestResult(
        success=result.success,
        message=result.message,
        latency_ms=result.latency_ms,
        server_version=result.server_version,
    )
