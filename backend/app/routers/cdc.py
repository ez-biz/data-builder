from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.cdc import (
    CDCJobCreate,
    CDCJobResponse,
    CDCJobUpdate,
    CDCSyncLogResponse,
)
from app.services import cdc_service

router = APIRouter(prefix="/cdc", tags=["cdc"])


@router.get("/jobs", response_model=list[CDCJobResponse])
def list_jobs(db: Session = Depends(get_db)):
    return cdc_service.get_jobs(db)


@router.post("/jobs", response_model=CDCJobResponse, status_code=201)
def create_job(data: CDCJobCreate, db: Session = Depends(get_db)):
    return cdc_service.create_job(db, data)


@router.get("/jobs/{job_id}", response_model=CDCJobResponse)
def get_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return job


@router.put("/jobs/{job_id}", response_model=CDCJobResponse)
def update_job(
    job_id: uuid.UUID, data: CDCJobUpdate, db: Session = Depends(get_db)
):
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return cdc_service.update_job(db, job, data)


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    cdc_service.delete_job(db, job)


@router.post("/jobs/{job_id}/sync", response_model=CDCSyncLogResponse, status_code=202)
def trigger_sync(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Trigger an incremental sync (captures rows since last sync)."""
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return cdc_service.trigger_sync(db, job)


@router.post("/jobs/{job_id}/snapshot", response_model=CDCSyncLogResponse, status_code=202)
def trigger_snapshot(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Trigger a full table snapshot to S3."""
    job = cdc_service.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="CDC job not found")
    return cdc_service.trigger_snapshot(db, job)


@router.get("/jobs/{job_id}/logs", response_model=list[CDCSyncLogResponse])
def list_sync_logs(job_id: uuid.UUID, db: Session = Depends(get_db)):
    return cdc_service.get_sync_logs(db, job_id)
