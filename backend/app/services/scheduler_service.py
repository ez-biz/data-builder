"""Pipeline scheduler — checks cron expressions and triggers runs."""
from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

from croniter import croniter

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.cdc_job import CDCJob, CDCStatus
from app.models.pipeline import Pipeline
from app.services import run_service

logger = logging.getLogger("data_builder.scheduler")

_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()

CHECK_INTERVAL_SECONDS = 30  # how often the scheduler loop checks for due pipelines


def start_scheduler() -> None:
    """Start the background scheduler thread (idempotent)."""
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        return
    _stop_event.clear()
    _scheduler_thread = threading.Thread(
        target=_scheduler_loop, name="pipeline-scheduler", daemon=True
    )
    _scheduler_thread.start()
    logger.info("Pipeline scheduler started (interval=%ds)", CHECK_INTERVAL_SECONDS)


def stop_scheduler() -> None:
    """Signal the scheduler to stop."""
    _stop_event.set()
    logger.info("Pipeline scheduler stop requested")


def _scheduler_loop() -> None:
    """Main loop: every CHECK_INTERVAL_SECONDS, find due pipelines and trigger runs."""
    while not _stop_event.is_set():
        try:
            _check_and_trigger()
        except Exception:
            logger.exception("Scheduler loop error")
        _stop_event.wait(CHECK_INTERVAL_SECONDS)


def _check_and_trigger() -> None:
    db = SessionLocal()
    try:
        pipelines = (
            db.query(Pipeline)
            .filter(Pipeline.schedule_cron.isnot(None))
            .filter(Pipeline.schedule_cron != "")
            .all()
        )

        now = datetime.now(timezone.utc)

        for pipeline in pipelines:
            try:
                if not croniter.is_valid(pipeline.schedule_cron):
                    logger.warning(
                        "Pipeline %s has invalid cron: %s",
                        pipeline.id,
                        pipeline.schedule_cron,
                    )
                    continue

                cron = croniter(pipeline.schedule_cron, now)
                prev_fire = cron.get_prev(datetime).replace(tzinfo=timezone.utc)

                # If the previous fire time is within the last CHECK_INTERVAL_SECONDS,
                # that means the cron was due in this check window — trigger a run.
                seconds_since_fire = (now - prev_fire).total_seconds()
                if seconds_since_fire <= CHECK_INTERVAL_SECONDS:
                    # Avoid duplicate runs: check if a run was already triggered
                    # recently (within 2x the interval)
                    from app.models.pipeline_run import PipelineRun

                    recent_scheduled = (
                        db.query(PipelineRun)
                        .filter(PipelineRun.pipeline_id == pipeline.id)
                        .filter(PipelineRun.triggered_by == "schedule")
                        .order_by(PipelineRun.created_at.desc())
                        .first()
                    )
                    if recent_scheduled:
                        since_last = (now - recent_scheduled.created_at.replace(tzinfo=timezone.utc)).total_seconds()
                        if since_last < CHECK_INTERVAL_SECONDS * 2:
                            continue

                    logger.info("Triggering scheduled run for pipeline %s", pipeline.id)
                    run_service.start_run(db, pipeline, triggered_by="schedule")

            except Exception:
                logger.exception("Error checking schedule for pipeline %s", pipeline.id)
    finally:
        db.close()

    try:
        _dispatch_orphaned_watchers()
    except Exception:
        logger.exception("Scheduler: orphan dispatch failed")


def _celery_control():
    """Indirection for test mocking."""
    return celery_app.control


def _collect_active_task_ids(inspector) -> Optional[set]:
    """Gather active+reserved+scheduled task IDs across workers.

    Returns None if the inspector reports no response (broker likely down)
    so the caller can skip this tick rather than re-dispatch blind.
    """
    collected = set()
    for getter in ("active", "reserved", "scheduled"):
        try:
            resp = getattr(inspector, getter)()
        except Exception:
            return None
        if resp is None:
            return None
        for _worker, tasks in resp.items():
            for t in tasks or []:
                tid = t.get("id") if isinstance(t, dict) else None
                if tid:
                    collected.add(tid)
    return collected


def _dispatch_orphaned_watchers() -> None:
    """Find CDC jobs in RUNNING state whose celery_task_id is missing or
    not actively processed, and re-dispatch a cdc.watch task for each."""
    control = _celery_control()
    try:
        inspector = control.inspect(timeout=1.0)
    except Exception:
        logger.exception("Scheduler: celery inspect failed, skipping orphan check")
        return

    active_ids = _collect_active_task_ids(inspector)
    if active_ids is None:
        logger.warning("Scheduler: celery inspect returned no response; skipping")
        return

    from app.tasks import cdc_watch_task

    db = SessionLocal()
    try:
        orphans = (
            db.query(CDCJob)
            .filter(CDCJob.status == CDCStatus.RUNNING)
            .all()
        )
        for job in orphans:
            if job.celery_task_id and job.celery_task_id in active_ids:
                continue
            task_id = str(uuid.uuid4())
            job.celery_task_id = task_id
            db.commit()
            cdc_watch_task.apply_async(args=(str(job.id),), task_id=task_id)
            logger.info("Scheduler: dispatched cdc.watch for orphan job %s (task_id=%s)",
                        job.id, task_id)
    finally:
        db.close()
