"""Pipeline run management and background execution."""
from __future__ import annotations

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.connectors.registry import ConnectorRegistry
from app.database import SessionLocal
from app.models.pipeline import Pipeline, PipelineStatus
from app.models.pipeline_run import PipelineRun, RunStatus
from app.services.connector_service import get_connector, get_decrypted_config
from app.services.execution_engine import PipelineExecutor
from app.services.notification_service import notify_run_failure

logger = logging.getLogger("data_builder.runs")

# Thread pool for background pipeline execution
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="pipeline-worker")


def retry_run(db: Session, run: PipelineRun) -> PipelineRun:
    """Re-run a failed pipeline run with the same configuration."""
    pipeline = run.pipeline
    return start_run(db, pipeline, triggered_by="retry")


def get_runs(db: Session, pipeline_id: uuid.UUID) -> list[PipelineRun]:
    return (
        db.query(PipelineRun)
        .filter(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(50)
        .all()
    )


def get_run(db: Session, run_id: uuid.UUID) -> PipelineRun | None:
    return db.query(PipelineRun).filter(PipelineRun.id == run_id).first()


def start_run(db: Session, pipeline: Pipeline, triggered_by: str = "manual") -> PipelineRun:
    """Create a run record and dispatch execution to background thread."""
    run = PipelineRun(
        pipeline_id=pipeline.id,
        status=RunStatus.PENDING,
        triggered_by=triggered_by,
    )
    db.add(run)

    pipeline.status = PipelineStatus.RUNNING
    db.commit()
    db.refresh(run)

    run_id = run.id
    pipeline_id = pipeline.id
    definition = dict(pipeline.definition)

    # Collect connector IDs from nodes
    connector_ids: set[str] = set()
    for node in definition.get("nodes", []):
        cid = node.get("data", {}).get("connectorId")
        if cid:
            connector_ids.add(cid)

    # Resolve connectors while we have the DB session
    connector_configs: dict[str, tuple[str, dict]] = {}
    for cid in connector_ids:
        connector_model = get_connector(db, uuid.UUID(cid))
        if connector_model:
            config = get_decrypted_config(connector_model)
            connector_configs[cid] = (connector_model.connector_type, config)

    pipeline_name = pipeline.name
    _executor.submit(_run_pipeline, run_id, pipeline_id, pipeline_name, definition, connector_configs)
    return run


def _run_pipeline(
    run_id: uuid.UUID,
    pipeline_id: uuid.UUID,
    pipeline_name: str,
    definition: dict,
    connector_configs: dict[str, tuple[str, dict]],
) -> None:
    """Background thread: execute the pipeline and update run status."""
    db = SessionLocal()
    try:
        run = db.query(PipelineRun).filter(PipelineRun.id == run_id).first()
        if not run:
            return

        run.status = RunStatus.RUNNING
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        # Build connector instances
        connectors = {}
        for cid, (ctype, config) in connector_configs.items():
            connectors[cid] = ConnectorRegistry.create(ctype, config)

        executor = PipelineExecutor(connectors)
        result = executor.execute(definition)

        run.finished_at = datetime.now(timezone.utc)
        run.rows_processed = result.rows_processed
        run.node_results = result.node_results

        pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()

        if result.success:
            run.status = RunStatus.COMPLETED
            if pipeline:
                pipeline.status = PipelineStatus.COMPLETED
            logger.info("Run %s completed: %d rows", run_id, result.rows_processed)
        else:
            run.status = RunStatus.FAILED
            run.error_message = result.error
            if pipeline:
                pipeline.status = PipelineStatus.FAILED
            logger.error("Run %s failed: %s", run_id, result.error)
            notify_run_failure(pipeline_name, str(run_id), result.error or "Unknown error", run.triggered_by)

        db.commit()

    except Exception as e:
        logger.exception("Run %s crashed", run_id)
        try:
            run = db.query(PipelineRun).filter(PipelineRun.id == run_id).first()
            if run:
                run.status = RunStatus.FAILED
                run.error_message = str(e)
                run.finished_at = datetime.now(timezone.utc)

            pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
            if pipeline:
                pipeline.status = PipelineStatus.FAILED
            db.commit()
            notify_run_failure(pipeline_name, str(run_id), str(e))
        except Exception:
            logger.exception("Failed to update run status after crash")
    finally:
        db.close()
