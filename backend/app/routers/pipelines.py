from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.exceptions import PipelineNotFoundError
from app.database import get_db
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineListItem,
    PipelineResponse,
    PipelineUpdate,
    PipelineValidationResult,
)
from app.schemas.pipeline_run import PipelineRunListItem, PipelineRunResponse
from app.services import pipeline_service, run_service

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineListItem])
def list_pipelines(db: Session = Depends(get_db)):
    return pipeline_service.get_pipelines(db)


@router.post("", response_model=PipelineResponse, status_code=201)
def create_pipeline(data: PipelineCreate, db: Session = Depends(get_db)):
    return pipeline_service.create_pipeline(db, data)


@router.get("/{pipeline_id}", response_model=PipelineResponse)
def get_pipeline(pipeline_id: uuid.UUID, db: Session = Depends(get_db)):
    pipeline = pipeline_service.get_pipeline(db, pipeline_id)
    if not pipeline:
        raise PipelineNotFoundError(str(pipeline_id))
    return pipeline


@router.put("/{pipeline_id}", response_model=PipelineResponse)
def update_pipeline(
    pipeline_id: uuid.UUID, data: PipelineUpdate, db: Session = Depends(get_db)
):
    pipeline = pipeline_service.get_pipeline(db, pipeline_id)
    if not pipeline:
        raise PipelineNotFoundError(str(pipeline_id))
    return pipeline_service.update_pipeline(db, pipeline, data)


@router.delete("/{pipeline_id}", status_code=204)
def delete_pipeline(pipeline_id: uuid.UUID, db: Session = Depends(get_db)):
    pipeline = pipeline_service.get_pipeline(db, pipeline_id)
    if not pipeline:
        raise PipelineNotFoundError(str(pipeline_id))
    pipeline_service.delete_pipeline(db, pipeline)


@router.post("/{pipeline_id}/validate", response_model=PipelineValidationResult)
def validate_pipeline(pipeline_id: uuid.UUID, db: Session = Depends(get_db)):
    pipeline = pipeline_service.get_pipeline(db, pipeline_id)
    if not pipeline:
        raise PipelineNotFoundError(str(pipeline_id))
    return pipeline_service.validate_pipeline(db, pipeline)


# --- Pipeline Runs ---


@router.post("/{pipeline_id}/run", response_model=PipelineRunResponse, status_code=202)
def trigger_run(pipeline_id: uuid.UUID, db: Session = Depends(get_db)):
    pipeline = pipeline_service.get_pipeline(db, pipeline_id)
    if not pipeline:
        raise PipelineNotFoundError(str(pipeline_id))
    return run_service.start_run(db, pipeline)


@router.get("/{pipeline_id}/runs", response_model=list[PipelineRunListItem])
def list_runs(pipeline_id: uuid.UUID, db: Session = Depends(get_db)):
    return run_service.get_runs(db, pipeline_id)


@router.get("/{pipeline_id}/runs/{run_id}", response_model=PipelineRunResponse)
def get_run(pipeline_id: uuid.UUID, run_id: uuid.UUID, db: Session = Depends(get_db)):
    run = run_service.get_run(db, run_id)
    if not run or run.pipeline_id != pipeline_id:
        raise PipelineNotFoundError(str(run_id))
    return run


@router.post("/{pipeline_id}/runs/{run_id}/retry", response_model=PipelineRunResponse, status_code=202)
def retry_run(pipeline_id: uuid.UUID, run_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retry a failed run by creating a new run with the same pipeline."""
    run = run_service.get_run(db, run_id)
    if not run or run.pipeline_id != pipeline_id:
        raise PipelineNotFoundError(str(run_id))
    if run.status.value not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled runs can be retried")
    return run_service.retry_run(db, run)


@router.post("/{pipeline_id}/runs/{run_id}/cancel", response_model=PipelineRunResponse)
def cancel_run(pipeline_id: uuid.UUID, run_id: uuid.UUID, db: Session = Depends(get_db)):
    """Cancel a pending or running pipeline run."""
    run = run_service.get_run(db, run_id)
    if not run or run.pipeline_id != pipeline_id:
        raise PipelineNotFoundError(str(run_id))
    if run.status.value not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="Only pending or running runs can be cancelled")
    return run_service.cancel_run(db, run)
