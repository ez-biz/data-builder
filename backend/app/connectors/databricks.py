from __future__ import annotations

import re
import time

from typing import Any

from app.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionTestResult,
    PreviewResult,
    QueryResult,
    SchemaInfo,
    TableInfo,
)
from app.connectors.registry import ConnectorRegistry
from app.models.connector import ConnectorType

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _safe_identifier(name: str) -> str:
    """Validate and quote a SQL identifier to prevent injection."""
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name!r}")
    return f"`{name}`"


@ConnectorRegistry.register(ConnectorType.DATABRICKS)
class DatabricksConnector(BaseConnector):

    def _get_connection(self):
        from databricks import sql as databricks_sql

        return databricks_sql.connect(
            server_hostname=self._config["server_hostname"],
            http_path=self._config["http_path"],
            access_token=self._config["access_token"],
        )

    @property
    def _catalog(self) -> str:
        return _safe_identifier(self._config.get("catalog", "main"))

    def test_connection(self) -> ConnectionTestResult:
        start = time.time()
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT current_version()")
            version = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            latency = (time.time() - start) * 1000
            return ConnectionTestResult(
                success=True,
                message="Connected successfully",
                latency_ms=round(latency, 2),
                server_version=f"Databricks {version}",
            )
        except Exception as e:
            return ConnectionTestResult(success=False, message=str(e))

    def get_schemas(self) -> list[SchemaInfo]:
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SHOW SCHEMAS IN {self._catalog}")
        schemas = []
        for row in cursor.fetchall():
            schema_name = row[0]
            safe_schema = _safe_identifier(schema_name)
            cursor.execute(f"SHOW TABLES IN {self._catalog}.{safe_schema}")
            table_count = len(cursor.fetchall())
            schemas.append(SchemaInfo(name=schema_name, table_count=table_count))
        cursor.close()
        conn.close()
        return schemas

    def get_tables(self, schema: str) -> list[TableInfo]:
        safe_schema = _safe_identifier(schema)
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(f"SHOW TABLES IN {self._catalog}.{safe_schema}")
        tables = [
            TableInfo(name=row[1], table_type=row[3] if len(row) > 3 else "table")
            for row in cursor.fetchall()
        ]
        cursor.close()
        conn.close()
        return tables

    def get_columns(self, schema: str, table: str) -> list[ColumnInfo]:
        safe_schema = _safe_identifier(schema)
        safe_table = _safe_identifier(table)
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"DESCRIBE TABLE {self._catalog}.{safe_schema}.{safe_table}"
        )
        columns = [
            ColumnInfo(
                name=row[0],
                data_type=row[1],
                is_nullable=True,
                is_primary_key=False,
            )
            for row in cursor.fetchall()
            if not row[0].startswith("#")  # Skip partition info rows
        ]
        cursor.close()
        conn.close()
        return columns

    def preview_table(self, schema: str, table: str, limit: int = 50) -> PreviewResult:
        safe_schema = _safe_identifier(schema)
        safe_table = _safe_identifier(table)
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            f"SELECT * FROM {self._catalog}.{safe_schema}.{safe_table} LIMIT {int(limit)}"
        )
        columns = [desc[0] for desc in cursor.description]
        rows = [list(row) for row in cursor.fetchall()]
        cursor.close()
        conn.close()
        return PreviewResult(
            columns=columns,
            rows=rows,
            total_rows_returned=len(rows),
        )

    def execute_query(self, query: str, params: dict | None = None) -> QueryResult:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(query, params)
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                rows = [list(row) for row in cursor.fetchall()]
            else:
                columns = []
                rows = []
            return QueryResult(columns=columns, rows=rows, row_count=len(rows))
        finally:
            cursor.close()
            conn.close()

    def write_table(
        self, schema: str, table: str, columns: list[str],
        rows: list[list[Any]], mode: str = "append",
    ) -> int:
        safe_schema = _safe_identifier(schema)
        safe_table = _safe_identifier(table)
        fq_table = f"{self._catalog}.{safe_schema}.{safe_table}"

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            if mode == "overwrite":
                cursor.execute(f"TRUNCATE TABLE {fq_table}")

            safe_cols = ", ".join(_safe_identifier(c) for c in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            insert_sql = f"INSERT INTO {fq_table} ({safe_cols}) VALUES ({placeholders})"

            for row in rows:
                cursor.execute(insert_sql, row)
            return len(rows)
        finally:
            cursor.close()
            conn.close()
