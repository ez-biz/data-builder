from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, Enum as SQLEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class CDCStatus(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    FAILED = "failed"


class CDCJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cdc_jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[CDCStatus] = mapped_column(
        SQLEnum(CDCStatus), default=CDCStatus.IDLE
    )

    # Source config
    source_schema: Mapped[str] = mapped_column(String(255), nullable=False)
    source_table: Mapped[str] = mapped_column(String(255), nullable=False)
    tracking_column: Mapped[str] = mapped_column(String(255), nullable=False)

    # S3 destination config
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_prefix: Mapped[str] = mapped_column(String(500), nullable=False, default="cdc/")
    s3_region: Mapped[str] = mapped_column(String(50), nullable=False, default="us-east-1")
    output_format: Mapped[str] = mapped_column(String(20), nullable=False, default="jsonl")

    # State tracking
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_rows_synced: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sync_interval_seconds: Mapped[int] = mapped_column(default=300)

    connector: Mapped["Connector"] = relationship()


class CDCSyncLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cdc_sync_logs"

    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("cdc_jobs.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    rows_captured: Mapped[int] = mapped_column(default=0)
    s3_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="running")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    job: Mapped["CDCJob"] = relationship()
