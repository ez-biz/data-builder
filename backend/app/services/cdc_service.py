"""CDC (Change Data Capture) service.

Implements poll-based CDC: tracks changes using a monotonically increasing
tracking column (e.g. updated_at timestamp, auto-increment ID) and writes
new/changed rows to S3 in JSONL or CSV format.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.connectors.registry import ConnectorRegistry
from app.database import SessionLocal
from app.models.cdc_job import CDCJob, CDCStatus, CDCSyncLog
from app.models.connector import Connector
from app.schemas.cdc import CDCJobCreate, CDCJobUpdate
from app.services.connector_service import get_connector, get_decrypted_config
from app.services.notification_service import notify_cdc_failure
from app.services.s3_writer import S3Writer

logger = logging.getLogger("data_builder.cdc")


# --- CRUD ---


def create_job(db: Session, data: CDCJobCreate) -> CDCJob:
    job = CDCJob(
        name=data.name,
        connector_id=data.connector_id,
        source_schema=data.source_schema,
        source_table=data.source_table,
        tracking_column=data.tracking_column,
        s3_bucket=data.s3_bucket,
        s3_prefix=data.s3_prefix,
        s3_region=data.s3_region,
        output_format=data.output_format,
        sync_interval_seconds=data.sync_interval_seconds,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_jobs(db: Session) -> list[CDCJob]:
    return db.query(CDCJob).order_by(CDCJob.created_at.desc()).all()


def get_job(db: Session, job_id: uuid.UUID) -> CDCJob | None:
    return db.query(CDCJob).filter(CDCJob.id == job_id).first()


def update_job(db: Session, job: CDCJob, data: CDCJobUpdate) -> CDCJob:
    for field in ("name", "tracking_column", "s3_bucket", "s3_prefix",
                   "s3_region", "output_format", "sync_interval_seconds"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(job, field, val)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job: CDCJob) -> None:
    db.delete(job)
    db.commit()


def get_sync_logs(db: Session, job_id: uuid.UUID) -> list[CDCSyncLog]:
    return (
        db.query(CDCSyncLog)
        .filter(CDCSyncLog.job_id == job_id)
        .order_by(CDCSyncLog.created_at.desc())
        .limit(50)
        .all()
    )


# --- Sync execution ---


def trigger_sync(db: Session, job: CDCJob) -> CDCSyncLog:
    """Create a sync log and dispatch sync to background thread."""
    log = CDCSyncLog(
        job_id=job.id,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(log)
    job.status = CDCStatus.RUNNING
    db.commit()
    db.refresh(log)

    # Snapshot state for the background thread
    log_id = log.id
    job_id = job.id
    connector_id = job.connector_id

    connector = get_connector(db, connector_id)
    if not connector:
        log.status = "failed"
        log.error_message = "Connector not found"
        log.finished_at = datetime.now(timezone.utc)
        job.status = CDCStatus.FAILED
        job.error_message = "Connector not found"
        db.commit()
        return log

    config = get_decrypted_config(connector)
    connector_type = connector.connector_type

    job_snapshot = {
        "source_schema": job.source_schema,
        "source_table": job.source_table,
        "tracking_column": job.tracking_column,
        "last_value": job.last_value,
        "s3_bucket": job.s3_bucket,
        "s3_prefix": job.s3_prefix,
        "s3_region": job.s3_region,
        "output_format": job.output_format,
    }

    from app.tasks import run_cdc_sync_task

    run_cdc_sync_task.delay(
        str(log_id), str(job_id), connector_type, config, job_snapshot
    )
    return log


def trigger_snapshot(db: Session, job: CDCJob) -> CDCSyncLog:
    """Full table snapshot to S3 (initial load)."""
    log = CDCSyncLog(
        job_id=job.id,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    db.add(log)
    job.status = CDCStatus.RUNNING
    db.commit()
    db.refresh(log)

    log_id = log.id
    job_id = job.id

    connector = get_connector(db, job.connector_id)
    if not connector:
        log.status = "failed"
        log.error_message = "Connector not found"
        log.finished_at = datetime.now(timezone.utc)
        job.status = CDCStatus.FAILED
        db.commit()
        return log

    config = get_decrypted_config(connector)
    connector_type = connector.connector_type

    job_snapshot = {
        "source_schema": job.source_schema,
        "source_table": job.source_table,
        "tracking_column": job.tracking_column,
        "last_value": None,  # Full snapshot
        "s3_bucket": job.s3_bucket,
        "s3_prefix": job.s3_prefix,
        "s3_region": job.s3_region,
        "output_format": job.output_format,
    }

    from app.tasks import run_cdc_sync_task

    run_cdc_sync_task.delay(
        str(log_id), str(job_id), connector_type, config, job_snapshot
    )
    return log


def _run_sync(
    log_id: uuid.UUID,
    job_id: uuid.UUID,
    connector_type: str,
    connector_config: dict,
    job_snapshot: dict,
) -> None:
    """Background thread: query for changes and write to S3."""
    db = SessionLocal()
    try:
        log = db.query(CDCSyncLog).filter(CDCSyncLog.id == log_id).first()
        job = db.query(CDCJob).filter(CDCJob.id == job_id).first()
        if not log or not job:
            return

        connector = ConnectorRegistry.create(connector_type, connector_config)
        schema = job_snapshot["source_schema"]
        table = job_snapshot["source_table"]
        tracking_col = job_snapshot["tracking_column"]
        last_value = job_snapshot["last_value"]

        # Build query
        if last_value:
            query = (
                f'SELECT * FROM "{schema}"."{table}" '
                f'WHERE "{tracking_col}" > %s '
                f'ORDER BY "{tracking_col}" ASC'
            )
            result = connector.execute_query(query, (last_value,))
        else:
            query = (
                f'SELECT * FROM "{schema}"."{table}" '
                f'ORDER BY "{tracking_col}" ASC'
            )
            result = connector.execute_query(query)

        if not result.rows:
            log.status = "completed"
            log.rows_captured = 0
            log.finished_at = datetime.now(timezone.utc)
            job.status = CDCStatus.IDLE
            db.commit()
            logger.info("CDC sync %s: no new rows", log_id)
            return

        # Write to S3
        s3 = S3Writer(
            bucket=job_snapshot["s3_bucket"],
            region=job_snapshot["s3_region"],
        )

        batch_id = str(log_id)[:8]
        fmt = job_snapshot.get("output_format", "jsonl")

        if fmt == "csv":
            s3_path = s3.write_csv(
                prefix=job_snapshot["s3_prefix"],
                table_name=table,
                columns=result.columns,
                rows=result.rows,
                batch_id=batch_id,
            )
        else:
            s3_path = s3.write_jsonl(
                prefix=job_snapshot["s3_prefix"],
                table_name=table,
                columns=result.columns,
                rows=result.rows,
                batch_id=batch_id,
            )

        # Update tracking value (last row, tracking column)
        tracking_col_idx = result.columns.index(tracking_col) if tracking_col in result.columns else None
        if tracking_col_idx is not None:
            new_last_value = str(result.rows[-1][tracking_col_idx])
        else:
            new_last_value = last_value

        log.status = "completed"
        log.rows_captured = result.row_count
        log.s3_path = s3_path
        log.finished_at = datetime.now(timezone.utc)

        job.status = CDCStatus.IDLE
        job.last_sync_at = datetime.now(timezone.utc)
        job.last_value = new_last_value
        job.total_rows_synced = (job.total_rows_synced or 0) + result.row_count
        job.error_message = None

        db.commit()
        logger.info("CDC sync %s completed: %d rows → %s", log_id, result.row_count, s3_path)

    except Exception as e:
        # Transient infra errors are re-raised so Celery can retry with backoff.
        # The on_failure hook on the task will mark FAILED if retries are exhausted.
        import psycopg2

        if isinstance(e, (psycopg2.OperationalError, psycopg2.InterfaceError, ConnectionError, TimeoutError)):
            logger.warning("CDC sync %s hit transient error, will retry: %s", log_id, e)
            raise

        logger.exception("CDC sync %s failed", log_id)
        try:
            log = db.query(CDCSyncLog).filter(CDCSyncLog.id == log_id).first()
            if log:
                log.status = "failed"
                log.error_message = str(e)
                log.finished_at = datetime.now(timezone.utc)

            job = db.query(CDCJob).filter(CDCJob.id == job_id).first()
            if job:
                job.status = CDCStatus.FAILED
                job.error_message = str(e)
                notify_cdc_failure(job.name, str(job_id), str(e))
            db.commit()
        except Exception:
            logger.exception("Failed to update CDC sync status after crash")
    finally:
        db.close()


def mark_sync_failed(log_id: uuid.UUID, job_id: uuid.UUID, error_message: str) -> None:
    """Mark a sync as failed — used by the Celery task's on_failure hook when
    retries are exhausted."""
    db = SessionLocal()
    try:
        log = db.query(CDCSyncLog).filter(CDCSyncLog.id == log_id).first()
        if log and log.status == "running":
            log.status = "failed"
            log.error_message = error_message
            log.finished_at = datetime.now(timezone.utc)
        job = db.query(CDCJob).filter(CDCJob.id == job_id).first()
        if job:
            job.status = CDCStatus.FAILED
            job.error_message = error_message
            notify_cdc_failure(job.name, str(job_id), error_message)
        db.commit()
    except Exception:
        logger.exception("mark_sync_failed failed for log %s", log_id)
    finally:
        db.close()
