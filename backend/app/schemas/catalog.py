from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel


class SchemaInfo(BaseModel):
    name: str
    table_count: int = 0


class SchemasResponse(BaseModel):
    connector_id: uuid.UUID
    schemas: list[SchemaInfo]


class TableInfo(BaseModel):
    name: str
    table_type: str = "table"
    row_count_estimate: int | None = None


class TablesResponse(BaseModel):
    connector_id: uuid.UUID
    schema_name: str
    tables: list[TableInfo]


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False


class ColumnsResponse(BaseModel):
    connector_id: uuid.UUID
    schema_name: str
    table: str
    columns: list[ColumnInfo]
    row_count_estimate: int | None = None


class TablePreviewResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    total_rows_returned: int
