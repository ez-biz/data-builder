from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ConnectionTestResult:
    success: bool
    message: str
    latency_ms: float | None = None
    server_version: str | None = None


@dataclass
class SchemaInfo:
    name: str
    table_count: int = 0


@dataclass
class TableInfo:
    name: str
    table_type: str = "table"
    row_count_estimate: int | None = None


@dataclass
class ColumnInfo:
    name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False


@dataclass
class PreviewResult:
    columns: list[str]
    rows: list[list[Any]]
    total_rows_returned: int


@dataclass
class QueryResult:
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class BaseConnector(ABC):
    """Abstract interface all database connectors must implement."""

    def __init__(self, config: dict):
        self._config = config

    @abstractmethod
    def test_connection(self) -> ConnectionTestResult:
        ...

    @abstractmethod
    def get_schemas(self) -> list[SchemaInfo]:
        ...

    @abstractmethod
    def get_tables(self, schema: str) -> list[TableInfo]:
        ...

    @abstractmethod
    def get_columns(self, schema: str, table: str) -> list[ColumnInfo]:
        ...

    @abstractmethod
    def preview_table(self, schema: str, table: str, limit: int = 50) -> PreviewResult:
        ...

    @abstractmethod
    def execute_query(self, query: str, params: dict | None = None) -> QueryResult:
        """Execute a SQL query and return results."""
        ...

    @abstractmethod
    def write_table(
        self, schema: str, table: str, columns: list[str],
        rows: list[list[Any]], mode: str = "append",
    ) -> int:
        """Write rows to a table. Returns rows written. mode: append|overwrite"""
        ...
