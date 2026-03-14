from __future__ import annotations

import enum
import uuid
from typing import Optional

from sqlalchemy import JSON, Enum as SQLEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class PipelineStatus(str, enum.Enum):
    DRAFT = "draft"
    VALID = "valid"
    INVALID = "invalid"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Pipeline(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pipelines"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[PipelineStatus] = mapped_column(
        SQLEnum(PipelineStatus), default=PipelineStatus.DRAFT
    )
    definition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_connector_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("connectors.id"), nullable=True
    )
    schedule_cron: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    source_connector: Mapped[Optional["Connector"]] = relationship(
        back_populates="pipelines"
    )
    runs: Mapped[list["PipelineRun"]] = relationship(
        back_populates="pipeline", cascade="all, delete-orphan"
    )
