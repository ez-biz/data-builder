from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import catalog, cdc, connectors, health, monitoring, pipelines

# Configure structured logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("data_builder")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Data Builder starting up")
    from app.services.scheduler_service import start_scheduler, stop_scheduler

    start_scheduler()
    yield
    stop_scheduler()
    logger.info("Data Builder shutting down")


app = FastAPI(
    title="Data Builder",
    description="Visual ETL Pipeline Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.warning("Validation error on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s", request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.include_router(health.router, prefix="/api")
app.include_router(connectors.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")
app.include_router(pipelines.router, prefix="/api")
app.include_router(cdc.router, prefix="/api")
app.include_router(monitoring.router, prefix="/api")
