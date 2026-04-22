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


class CDCKind(str, enum.Enum):
    """Which kind of CDC mechanism this job uses.

    poll                 — tracking-column polling (Phase 3a, shipped)
    pg_wal               — PostgreSQL logical replication (future Spec #2)
    mongo_change_stream  — MongoDB Change Streams (future Spec #3)
    """
    POLL = "poll"
    PG_WAL = "pg_wal"
    MONGO_CHANGE_STREAM = "mongo_change_stream"


class CDCJob(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "cdc_jobs"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("connectors.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[CDCStatus] = mapped_column(
        SQLEnum(CDCStatus), default=CDCStatus.IDLE
    )

    cdc_kind: Mapped[CDCKind] = mapped_column(
        SQLEnum(CDCKind), nullable=False, default=CDCKind.POLL
    )

    # Source config
    source_schema: Mapped[str] = mapped_column(String(255), nullable=False)
    source_table: Mapped[str] = mapped_column(String(255), nullable=False)
    # Required only for poll kind; API validates per kind.
    tracking_column: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

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

    # v2 foundation additions
    resume_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operation_filter: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    checkpoint_interval_seconds: Mapped[int] = mapped_column(default=10)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

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
