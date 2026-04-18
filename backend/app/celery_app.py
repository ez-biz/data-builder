"""Celery application — orchestrates pipeline runs and CDC syncs."""
from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "data_builder",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True,
)
