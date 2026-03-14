from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.connectors.base import ConnectionTestResult
from app.connectors.registry import ConnectorRegistry
from app.core.encryption import decrypt_config, encrypt_config
from app.models.connector import Connector
from app.schemas.connector import ConnectorCreate, ConnectorUpdate


def create_connector(db: Session, data: ConnectorCreate) -> Connector:
    connector = Connector(
        name=data.name,
        connector_type=data.connector_type,
        connection_config={"encrypted": encrypt_config(data.connection_config)},
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    return connector


def get_connectors(db: Session) -> list[Connector]:
    return db.query(Connector).order_by(Connector.created_at.desc()).all()


def get_connector(db: Session, connector_id: uuid.UUID) -> Connector | None:
    return db.query(Connector).filter(Connector.id == connector_id).first()


def update_connector(db: Session, connector: Connector, data: ConnectorUpdate) -> Connector:
    if data.name is not None:
        connector.name = data.name
    if data.is_active is not None:
        connector.is_active = data.is_active
    if data.connection_config is not None:
        connector.connection_config = {"encrypted": encrypt_config(data.connection_config)}
    db.commit()
    db.refresh(connector)
    return connector


def delete_connector(db: Session, connector: Connector) -> None:
    db.delete(connector)
    db.commit()


def get_decrypted_config(connector: Connector) -> dict:
    return decrypt_config(connector.connection_config["encrypted"])


def test_connector(db: Session, connector: Connector) -> ConnectionTestResult:
    config = get_decrypted_config(connector)
    instance = ConnectorRegistry.create(connector.connector_type, config)
    result = instance.test_connection()
    connector.last_tested_at = datetime.now(timezone.utc)
    connector.test_status = "success" if result.success else "failed"
    db.commit()
    return result
