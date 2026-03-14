"""Monitoring & observability schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RunStats(BaseModel):
    total_runs: int = 0
    completed: int = 0
    failed: int = 0
    cancelled: int = 0
    running: int = 0
    pending: int = 0
    success_rate: float = 0.0
    avg_duration_seconds: Optional[float] = None


class DailyRunStat(BaseModel):
    date: str
    completed: int = 0
    failed: int = 0
    total: int = 0


class CDCStats(BaseModel):
    total_jobs: int = 0
    idle: int = 0
    running: int = 0
    failed: int = 0
    paused: int = 0
    total_rows_synced: int = 0


class SystemStats(BaseModel):
    pipeline_stats: RunStats
    cdc_stats: CDCStats
    daily_runs: list[DailyRunStat] = []


class LogExportRequest(BaseModel):
    format: str = "json"  # json, csv
    days: int = 30  # how many days of logs to include
    include_pipeline_runs: bool = True
    include_cdc_logs: bool = True


class WebhookExportRequest(BaseModel):
    url: str
    secret: str = ""
    days: int = 30
    include_pipeline_runs: bool = True
    include_cdc_logs: bool = True


class WebhookTestRequest(BaseModel):
    url: str
    secret: str = ""
