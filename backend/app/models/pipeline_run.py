from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Enum as SQLEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PipelineRun(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "pipeline_runs"

    pipeline_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[RunStatus] = mapped_column(
        SQLEnum(RunStatus), default=RunStatus.PENDING
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rows_processed: Mapped[Optional[int]] = mapped_column(nullable=True)
    node_results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(50), default="manual")

    pipeline: Mapped["Pipeline"] = relationship(back_populates="runs")
