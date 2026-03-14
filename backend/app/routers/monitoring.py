"""Monitoring, stats, and log export endpoints."""
from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cdc_job import CDCJob, CDCStatus, CDCSyncLog
from app.models.pipeline_run import PipelineRun, RunStatus
from app.schemas.monitoring import (
    CDCStats,
    DailyRunStat,
    LogExportRequest,
    RunStats,
    SystemStats,
    WebhookExportRequest,
    WebhookTestRequest,
)
from app.services.notification_service import send_to_external

router = APIRouter(prefix="/monitoring", tags=["monitoring"])


@router.get("/stats", response_model=SystemStats)
def get_stats(days: int = 30, db: Session = Depends(get_db)):
    """Get system-wide stats for the monitoring dashboard."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Pipeline run stats
    runs = (
        db.query(PipelineRun)
        .filter(PipelineRun.created_at >= cutoff)
        .all()
    )

    completed = sum(1 for r in runs if r.status == RunStatus.COMPLETED)
    failed = sum(1 for r in runs if r.status == RunStatus.FAILED)
    cancelled = sum(1 for r in runs if r.status == RunStatus.CANCELLED)
    running = sum(1 for r in runs if r.status == RunStatus.RUNNING)
    pending = sum(1 for r in runs if r.status == RunStatus.PENDING)
    total = len(runs)

    finished = completed + failed
    success_rate = (completed / finished * 100) if finished > 0 else 0.0

    durations = []
    for r in runs:
        if r.started_at and r.finished_at:
            dur = (r.finished_at - r.started_at).total_seconds()
            durations.append(dur)
    avg_duration = sum(durations) / len(durations) if durations else None

    pipeline_stats = RunStats(
        total_runs=total,
        completed=completed,
        failed=failed,
        cancelled=cancelled,
        running=running,
        pending=pending,
        success_rate=round(success_rate, 1),
        avg_duration_seconds=round(avg_duration, 2) if avg_duration else None,
    )

    # Daily breakdown (last N days)
    daily_runs: list[DailyRunStat] = []
    for i in range(min(days, 30)):
        day = (datetime.now(timezone.utc) - timedelta(days=i)).date()
        day_runs = [
            r for r in runs
            if r.created_at.date() == day
        ]
        daily_runs.append(DailyRunStat(
            date=day.isoformat(),
            completed=sum(1 for r in day_runs if r.status == RunStatus.COMPLETED),
            failed=sum(1 for r in day_runs if r.status == RunStatus.FAILED),
            total=len(day_runs),
        ))
    daily_runs.reverse()

    # CDC stats
    jobs = db.query(CDCJob).all()
    cdc_stats = CDCStats(
        total_jobs=len(jobs),
        idle=sum(1 for j in jobs if j.status == CDCStatus.IDLE),
        running=sum(1 for j in jobs if j.status == CDCStatus.RUNNING),
        failed=sum(1 for j in jobs if j.status == CDCStatus.FAILED),
        paused=sum(1 for j in jobs if j.status == CDCStatus.PAUSED),
        total_rows_synced=sum(j.total_rows_synced or 0 for j in jobs),
    )

    return SystemStats(
        pipeline_stats=pipeline_stats,
        cdc_stats=cdc_stats,
        daily_runs=daily_runs,
    )


@router.post("/export")
def export_logs(data: LogExportRequest, db: Session = Depends(get_db)):
    """Export logs as JSON or CSV file download."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=data.days)
    logs = _collect_logs(db, cutoff, data.include_pipeline_runs, data.include_cdc_logs)

    if data.format == "csv":
        return _export_csv(logs)
    return _export_json(logs)


@router.post("/export/webhook")
def export_to_webhook(data: WebhookExportRequest, db: Session = Depends(get_db)):
    """Push logs to an external webhook URL (3rd party integration)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=data.days)
    logs = _collect_logs(db, cutoff, data.include_pipeline_runs, data.include_cdc_logs)

    payload = {
        "event": "log_export",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": logs,
    }

    result = send_to_external(data.url, payload, data.secret)
    return result


@router.post("/webhook/test")
def test_webhook(data: WebhookTestRequest):
    """Send a test ping to a webhook URL."""
    payload = {
        "event": "webhook.test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {"message": "Test ping from Data Builder"},
    }
    return send_to_external(data.url, payload, data.secret)


def _collect_logs(
    db: Session,
    cutoff: datetime,
    include_pipeline_runs: bool,
    include_cdc_logs: bool,
) -> list[dict]:
    """Collect run + CDC logs into a unified list."""
    logs: list[dict] = []

    if include_pipeline_runs:
        runs = (
            db.query(PipelineRun)
            .filter(PipelineRun.created_at >= cutoff)
            .order_by(PipelineRun.created_at.desc())
            .all()
        )
        for r in runs:
            logs.append({
                "type": "pipeline_run",
                "id": str(r.id),
                "pipeline_id": str(r.pipeline_id),
                "status": r.status.value,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "rows_processed": r.rows_processed,
                "error_message": r.error_message,
                "triggered_by": r.triggered_by,
                "created_at": r.created_at.isoformat(),
            })

    if include_cdc_logs:
        sync_logs = (
            db.query(CDCSyncLog)
            .filter(CDCSyncLog.created_at >= cutoff)
            .order_by(CDCSyncLog.created_at.desc())
            .all()
        )
        for s in sync_logs:
            logs.append({
                "type": "cdc_sync",
                "id": str(s.id),
                "job_id": str(s.job_id),
                "status": s.status,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                "rows_captured": s.rows_captured,
                "s3_path": s.s3_path,
                "error_message": s.error_message,
                "created_at": s.created_at.isoformat(),
            })

    return logs


def _export_json(logs: list[dict]) -> StreamingResponse:
    content = json.dumps(logs, indent=2)
    return StreamingResponse(
        iter([content]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=data-builder-logs.json"},
    )


def _export_csv(logs: list[dict]) -> StreamingResponse:
    if not logs:
        return StreamingResponse(
            iter([""]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=data-builder-logs.csv"},
        )

    all_keys = set()
    for log in logs:
        all_keys.update(log.keys())
    fieldnames = sorted(all_keys)

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for log in logs:
        writer.writerow(log)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data-builder-logs.csv"},
    )
