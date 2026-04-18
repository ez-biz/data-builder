"""Celery task definitions.

Thin wrappers that accept JSON-serializable args and delegate to the service
layer's _run_pipeline / _run_sync functions. Kept in their own module to avoid
circular imports: services import tasks lazily at dispatch time, while workers
import tasks at startup (which pulls in services cleanly).
"""
from __future__ import annotations

import uuid

import psycopg2

from app.celery_app import celery_app


# Transient errors that warrant auto-retry. CDC sync is idempotent over its
# sync window (tracked by last_value), so retrying a failed sync is safe.
# Pipeline runs can have non-idempotent side effects (e.g. append-mode inserts),
# so their task does not auto-retry.
_TRANSIENT_ERRORS = (
    psycopg2.OperationalError,
    psycopg2.InterfaceError,
    ConnectionError,
    TimeoutError,
)


@celery_app.task(name="pipeline.run")
def run_pipeline_task(
    run_id: str,
    pipeline_id: str,
    pipeline_name: str,
    definition: dict,
    connector_configs: dict,
) -> None:
    from app.services.run_service import _run_pipeline

    normalized_configs = {
        cid: (ctype, cfg) for cid, (ctype, cfg) in connector_configs.items()
    }
    _run_pipeline(
        uuid.UUID(run_id),
        uuid.UUID(pipeline_id),
        pipeline_name,
        definition,
        normalized_configs,
    )


class _CDCSyncTask(celery_app.Task):
    """Custom task class so we can hook on_failure to mark the sync FAILED
    after all retries are exhausted."""

    autoretry_for = _TRANSIENT_ERRORS
    retry_backoff = True
    retry_backoff_max = 60
    retry_jitter = True
    max_retries = 3

    def on_failure(self, exc, task_id, args, kwargs, einfo):  # noqa: D401
        from app.services.cdc_service import mark_sync_failed

        # args = (log_id, job_id, connector_type, connector_config, job_snapshot)
        if len(args) >= 2:
            try:
                mark_sync_failed(uuid.UUID(args[0]), uuid.UUID(args[1]), str(exc))
            except Exception:
                pass  # Already logged in mark_sync_failed


@celery_app.task(base=_CDCSyncTask, name="cdc.sync")
def run_cdc_sync_task(
    log_id: str,
    job_id: str,
    connector_type: str,
    connector_config: dict,
    job_snapshot: dict,
) -> None:
    from app.services.cdc_service import _run_sync

    _run_sync(
        uuid.UUID(log_id),
        uuid.UUID(job_id),
        connector_type,
        connector_config,
        job_snapshot,
    )
