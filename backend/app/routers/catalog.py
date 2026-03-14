from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.catalog import (
    ColumnsResponse,
    SchemasResponse,
    TablePreviewResponse,
    TablesResponse,
)
from app.services import catalog_service

router = APIRouter(prefix="/catalog", tags=["catalog"])

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,127}$")


def _validate_identifier(name: str, label: str) -> str:
    if not _IDENTIFIER_RE.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label} name: must be alphanumeric/underscore, max 128 chars",
        )
    return name


@router.get("/{connector_id}/schemas", response_model=SchemasResponse)
def list_schemas(connector_id: uuid.UUID, db: Session = Depends(get_db)):
    schemas = catalog_service.get_schemas(db, connector_id)
    return SchemasResponse(
        connector_id=connector_id,
        schemas=[{"name": s.name, "table_count": s.table_count} for s in schemas],
    )


@router.get("/{connector_id}/schemas/{schema}/tables", response_model=TablesResponse)
def list_tables(
    connector_id: uuid.UUID, schema: str, db: Session = Depends(get_db)
):
    _validate_identifier(schema, "schema")
    tables = catalog_service.get_tables(db, connector_id, schema)
    return TablesResponse(
        connector_id=connector_id,
        schema_name=schema,
        tables=[
            {"name": t.name, "table_type": t.table_type, "row_count_estimate": t.row_count_estimate}
            for t in tables
        ],
    )


@router.get(
    "/{connector_id}/schemas/{schema}/tables/{table}/columns",
    response_model=ColumnsResponse,
)
def list_columns(
    connector_id: uuid.UUID,
    schema: str,
    table: str,
    db: Session = Depends(get_db),
):
    _validate_identifier(schema, "schema")
    _validate_identifier(table, "table")
    columns = catalog_service.get_columns(db, connector_id, schema, table)
    return ColumnsResponse(
        connector_id=connector_id,
        schema_name=schema,
        table=table,
        columns=[
            {
                "name": c.name,
                "data_type": c.data_type,
                "is_nullable": c.is_nullable,
                "is_primary_key": c.is_primary_key,
            }
            for c in columns
        ],
    )


@router.get(
    "/{connector_id}/schemas/{schema}/tables/{table}/preview",
    response_model=TablePreviewResponse,
)
def preview_table(
    connector_id: uuid.UUID,
    schema: str,
    table: str,
    limit: int = Query(default=50, le=500),
    db: Session = Depends(get_db),
):
    _validate_identifier(schema, "schema")
    _validate_identifier(table, "table")
    result = catalog_service.preview_table(db, connector_id, schema, table, limit)
    return TablePreviewResponse(
        columns=result.columns,
        rows=result.rows,
        total_rows_returned=result.total_rows_returned,
    )
