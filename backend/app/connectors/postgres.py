from __future__ import annotations

import re
import time

import psycopg2
from psycopg2 import sql as pgsql
from psycopg2.extras import Json

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _adapt_value(value):
    """Wrap dict/list in psycopg2 Json so they can be inserted into JSON/JSONB columns."""
    if isinstance(value, (dict, list)):
        return Json(value)
    return value

from app.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionTestResult,
    PreviewResult,
    QueryResult,
    SchemaInfo,
    TableInfo,
)
from typing import Any
from app.connectors.registry import ConnectorRegistry
from app.models.connector import ConnectorType


@ConnectorRegistry.register(ConnectorType.POSTGRESQL)
class PostgreSQLConnector(BaseConnector):

    def _get_connection(self):
        return psycopg2.connect(
            host=self._config["host"],
            port=self._config.get("port", 5432),
            database=self._config["database"],
            user=self._config["username"],
            password=self._config["password"],
            sslmode=self._config.get("ssl_mode", "prefer"),
            connect_timeout=10,
        )

    def test_connection(self) -> ConnectionTestResult:
        start = time.time()
        try:
            conn = self._get_connection()
            cur = conn.cursor()
            cur.execute("SELECT version()")
            version = cur.fetchone()[0]
            cur.close()
            conn.close()
            latency = (time.time() - start) * 1000
            return ConnectionTestResult(
                success=True,
                message="Connected successfully",
                latency_ms=round(latency, 2),
                server_version=version,
            )
        except Exception as e:
            return ConnectionTestResult(success=False, message=str(e))

    def get_schemas(self) -> list[SchemaInfo]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT s.schema_name, COUNT(t.table_name)
            FROM information_schema.schemata s
            LEFT JOIN information_schema.tables t
                ON s.schema_name = t.table_schema AND t.table_type = 'BASE TABLE'
            WHERE s.schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
            GROUP BY s.schema_name
            ORDER BY s.schema_name
        """)
        schemas = [SchemaInfo(name=row[0], table_count=row[1]) for row in cur.fetchall()]
        cur.close()
        conn.close()
        return schemas

    def get_tables(self, schema: str) -> list[TableInfo]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT t.table_name, t.table_type,
                   pg_stat.n_live_tup AS row_estimate
            FROM information_schema.tables t
            LEFT JOIN pg_stat_user_tables pg_stat
                ON t.table_schema = pg_stat.schemaname AND t.table_name = pg_stat.relname
            WHERE t.table_schema = %s AND t.table_type IN ('BASE TABLE', 'VIEW')
            ORDER BY t.table_name
            """,
            (schema,),
        )
        tables = [
            TableInfo(
                name=row[0],
                table_type=row[1].lower(),
                row_count_estimate=row[2],
            )
            for row in cur.fetchall()
        ]
        cur.close()
        conn.close()
        return tables

    def get_columns(self, schema: str, table: str) -> list[ColumnInfo]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT c.column_name, c.data_type, c.is_nullable,
                   CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = %s AND tc.table_name = %s
            ) pk ON c.column_name = pk.column_name
            WHERE c.table_schema = %s AND c.table_name = %s
            ORDER BY c.ordinal_position
            """,
            (schema, table, schema, table),
        )
        columns = [
            ColumnInfo(
                name=row[0],
                data_type=row[1],
                is_nullable=row[2] == "YES",
                is_primary_key=row[3],
            )
            for row in cur.fetchall()
        ]
        cur.close()
        conn.close()
        return columns

    def preview_table(self, schema: str, table: str, limit: int = 50) -> PreviewResult:
        if not _IDENTIFIER_RE.match(schema) or not _IDENTIFIER_RE.match(table):
            raise ValueError("Invalid schema or table name")
        conn = self._get_connection()
        cur = conn.cursor()
        query = pgsql.SQL("SELECT * FROM {}.{} LIMIT %s").format(
            pgsql.Identifier(schema), pgsql.Identifier(table)
        )
        cur.execute(query, (limit,))
        columns = [desc[0] for desc in cur.description]
        rows = [list(row) for row in cur.fetchall()]
        cur.close()
        conn.close()
        return PreviewResult(
            columns=columns,
            rows=rows,
            total_rows_returned=len(rows),
        )

    def execute_query(self, query: str, params: dict | None = None) -> QueryResult:
        conn = self._get_connection()
        cur = conn.cursor()
        try:
            cur.execute(query, params)
            if cur.description:
                columns = [desc[0] for desc in cur.description]
                rows = [list(row) for row in cur.fetchall()]
            else:
                columns = []
                rows = []
            conn.commit()
            return QueryResult(columns=columns, rows=rows, row_count=len(rows))
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()

    def write_table(
        self, schema: str, table: str, columns: list[str],
        rows: list[list[Any]], mode: str = "append",
    ) -> int:
        if not _IDENTIFIER_RE.match(schema) or not _IDENTIFIER_RE.match(table):
            raise ValueError("Invalid schema or table name")
        for col in columns:
            if not _IDENTIFIER_RE.match(col):
                raise ValueError(f"Invalid column name: {col}")

        conn = self._get_connection()
        cur = conn.cursor()
        try:
            fq_table = pgsql.SQL("{}.{}").format(
                pgsql.Identifier(schema), pgsql.Identifier(table)
            )

            if mode == "overwrite":
                cur.execute(pgsql.SQL("TRUNCATE TABLE {}").format(fq_table))

            col_list = pgsql.SQL(", ").join(pgsql.Identifier(c) for c in columns)
            placeholders = pgsql.SQL(", ").join(pgsql.Placeholder() for _ in columns)
            insert = pgsql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                fq_table, col_list, placeholders
            )

            for row in rows:
                cur.execute(insert, [_adapt_value(v) for v in row])

            conn.commit()
            return len(rows)
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()
