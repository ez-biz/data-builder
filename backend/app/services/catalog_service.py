from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.connectors.base import BaseConnector, ColumnInfo, PreviewResult, SchemaInfo, TableInfo
from app.connectors.registry import ConnectorRegistry
from app.core.exceptions import ConnectorNotFoundError
from app.models.connector import Connector
from app.services.connector_service import get_decrypted_config


def _get_connector_instance(db: Session, connector_id: uuid.UUID) -> BaseConnector:
    connector = db.query(Connector).filter(Connector.id == connector_id).first()
    if not connector:
        raise ConnectorNotFoundError(str(connector_id))
    config = get_decrypted_config(connector)
    return ConnectorRegistry.create(connector.connector_type, config)


def get_schemas(db: Session, connector_id: uuid.UUID) -> list[SchemaInfo]:
    instance = _get_connector_instance(db, connector_id)
    return instance.get_schemas()


def get_tables(db: Session, connector_id: uuid.UUID, schema: str) -> list[TableInfo]:
    instance = _get_connector_instance(db, connector_id)
    return instance.get_tables(schema)


def get_columns(
    db: Session, connector_id: uuid.UUID, schema: str, table: str
) -> list[ColumnInfo]:
    instance = _get_connector_instance(db, connector_id)
    return instance.get_columns(schema, table)


def preview_table(
    db: Session, connector_id: uuid.UUID, schema: str, table: str, limit: int = 50
) -> PreviewResult:
    instance = _get_connector_instance(db, connector_id)
    return instance.preview_table(schema, table, limit)
