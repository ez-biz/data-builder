from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Enum as SQLEnum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ConnectorType(str, enum.Enum):
    POSTGRESQL = "postgresql"
    DATABRICKS = "databricks"


class Connector(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "connectors"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_type: Mapped[ConnectorType] = mapped_column(
        SQLEnum(ConnectorType), nullable=False
    )
    connection_config: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    last_tested_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    test_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    pipelines: Mapped[list["Pipeline"]] = relationship(back_populates="source_connector")
