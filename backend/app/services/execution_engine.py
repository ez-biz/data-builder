"""Pipeline execution engine.

Traverses the pipeline DAG in topological order, generating SQL
for each node and piping data from sources through transforms to destinations.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.connectors.base import BaseConnector, QueryResult

logger = logging.getLogger("data_builder.engine")

_IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def _validate_identifier(name: str) -> str:
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid identifier: {name!r}")
    return name


@dataclass
class NodeOutput:
    """Result of executing a single node."""
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


@dataclass
class ExecutionResult:
    """Result of running an entire pipeline."""
    success: bool
    rows_processed: int = 0
    node_results: dict[str, dict] = field(default_factory=dict)
    error: str | None = None


class PipelineExecutor:
    """Executes a validated pipeline definition."""

    def __init__(self, connectors: dict[str, BaseConnector]):
        """
        Args:
            connectors: mapping of connector_id -> instantiated BaseConnector
        """
        self._connectors = connectors
        self._node_outputs: dict[str, NodeOutput] = {}

    def execute(self, definition: dict) -> ExecutionResult:
        nodes = definition.get("nodes", [])
        edges = definition.get("edges", [])

        if not nodes:
            return ExecutionResult(success=False, error="Pipeline has no nodes")

        node_map = {n["id"]: n for n in nodes}
        execution_order = self._topological_sort(nodes, edges)

        # Build incoming edges map
        incoming: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            incoming[edge["target"]].append(edge["source"])

        result = ExecutionResult(success=True)
        total_rows = 0

        for node_id in execution_order:
            node = node_map[node_id]
            node_type = node.get("type", "")
            node_data = node.get("data", {})
            input_node_ids = incoming.get(node_id, [])

            try:
                logger.info("Executing node %s (type=%s)", node_id, node_type)

                if node_type == "source":
                    output = self._execute_source(node_data)
                elif node_type == "filter":
                    output = self._execute_filter(node_data, input_node_ids)
                elif node_type == "transform":
                    output = self._execute_transform(node_data, input_node_ids)
                elif node_type == "join":
                    output = self._execute_join(node_data, input_node_ids)
                elif node_type == "aggregate":
                    output = self._execute_aggregate(node_data, input_node_ids)
                elif node_type == "destination":
                    output = self._execute_destination(node_data, input_node_ids)
                    total_rows += output.row_count
                else:
                    raise ValueError(f"Unknown node type: {node_type}")

                self._node_outputs[node_id] = output
                result.node_results[node_id] = {
                    "status": "completed",
                    "row_count": output.row_count,
                }
                logger.info("Node %s completed: %d rows", node_id, output.row_count)

            except Exception as e:
                logger.error("Node %s failed: %s", node_id, e)
                result.success = False
                result.error = f"Node {node_data.get('label', node_id)} failed: {e}"
                result.node_results[node_id] = {
                    "status": "failed",
                    "error": str(e),
                }
                return result

        result.rows_processed = total_rows
        return result

    def _get_input(self, input_node_ids: list[str]) -> NodeOutput:
        if not input_node_ids:
            raise ValueError("Node requires at least one input")
        return self._node_outputs[input_node_ids[0]]

    def _execute_source(self, data: dict) -> NodeOutput:
        connector_id = data.get("connectorId")
        schema = _validate_identifier(data.get("schema", ""))
        table = _validate_identifier(data.get("table", ""))
        selected_columns = data.get("selectedColumns", [])

        if not connector_id or connector_id not in self._connectors:
            raise ValueError(f"Connector not found: {connector_id}")

        connector = self._connectors[connector_id]

        if selected_columns:
            for col in selected_columns:
                _validate_identifier(col)
            col_list = ", ".join(f'"{c}"' for c in selected_columns)
        else:
            col_list = "*"

        result = connector.execute_query(
            f'SELECT {col_list} FROM "{schema}"."{table}"'
        )
        return NodeOutput(
            columns=result.columns,
            rows=result.rows,
            row_count=result.row_count,
        )

    def _execute_filter(self, data: dict, input_node_ids: list[str]) -> NodeOutput:
        input_data = self._get_input(input_node_ids)
        conditions = data.get("conditions", [])
        logical_op = data.get("logicalOperator", "AND")

        if not conditions:
            return input_data

        col_index = {col: i for i, col in enumerate(input_data.columns)}
        filtered_rows = []

        for row in input_data.rows:
            results = []
            for cond in conditions:
                col = cond.get("column", "")
                op = cond.get("operator", "eq")
                value = cond.get("value", "")

                if col not in col_index:
                    results.append(False)
                    continue

                cell = row[col_index[col]]
                results.append(self._evaluate_condition(cell, op, value))

            if logical_op == "AND":
                if all(results):
                    filtered_rows.append(row)
            else:
                if any(results):
                    filtered_rows.append(row)

        return NodeOutput(
            columns=input_data.columns,
            rows=filtered_rows,
            row_count=len(filtered_rows),
        )

    def _evaluate_condition(self, cell: Any, op: str, value: str) -> bool:
        if op == "is_null":
            return cell is None
        if op == "is_not_null":
            return cell is not None
        if cell is None:
            return False

        cell_str = str(cell)
        if op == "eq":
            return cell_str == value
        elif op == "neq":
            return cell_str != value
        elif op == "contains":
            return value in cell_str
        elif op == "not_contains":
            return value not in cell_str

        # Numeric comparisons
        try:
            cell_num = float(cell)
            val_num = float(value)
            if op == "gt":
                return cell_num > val_num
            elif op == "lt":
                return cell_num < val_num
            elif op == "gte":
                return cell_num >= val_num
            elif op == "lte":
                return cell_num <= val_num
        except (ValueError, TypeError):
            pass

        if op == "in":
            values = [v.strip() for v in value.split(",")]
            return cell_str in values

        return False

    def _execute_transform(self, data: dict, input_node_ids: list[str]) -> NodeOutput:
        input_data = self._get_input(input_node_ids)
        transformations = data.get("transformations", [])

        if not transformations:
            return input_data

        columns = list(input_data.columns)
        col_index = {col: i for i, col in enumerate(columns)}
        rows = [list(row) for row in input_data.rows]

        for t in transformations:
            op = t.get("operation", "")
            source_col = t.get("sourceColumn", "")
            target_col = t.get("targetColumn", "")

            if op == "rename" and source_col in col_index:
                idx = col_index[source_col]
                columns[idx] = target_col
                col_index[target_col] = idx
                del col_index[source_col]

            elif op == "cast" and source_col in col_index:
                idx = col_index[source_col]
                cast_type = target_col.lower()
                for row in rows:
                    row[idx] = self._cast_value(row[idx], cast_type)

            elif op == "expression":
                # Add a new computed column
                columns.append(target_col)
                col_index[target_col] = len(columns) - 1
                expr = t.get("expression", "")
                for row in rows:
                    row.append(self._eval_expression(expr, columns[:-1], row))

        return NodeOutput(columns=columns, rows=rows, row_count=len(rows))

    def _cast_value(self, value: Any, cast_type: str) -> Any:
        if value is None:
            return None
        try:
            if cast_type in ("integer", "int", "bigint"):
                return int(float(str(value)))
            elif cast_type in ("float", "double", "numeric", "decimal"):
                return float(str(value))
            elif cast_type in ("text", "varchar", "string"):
                return str(value)
            elif cast_type == "boolean":
                return str(value).lower() in ("true", "1", "yes")
        except (ValueError, TypeError):
            return value
        return value

    def _eval_expression(self, expr: str, columns: list[str], row: list[Any]) -> Any:
        """Simple expression evaluator — supports column references as {col_name}."""
        result = expr
        col_index = {col: i for i, col in enumerate(columns)}
        for col, idx in col_index.items():
            result = result.replace(f"{{{col}}}", str(row[idx] if row[idx] is not None else ""))
        return result

    def _execute_join(self, data: dict, input_node_ids: list[str]) -> NodeOutput:
        if len(input_node_ids) != 2:
            raise ValueError(f"Join requires exactly 2 inputs, got {len(input_node_ids)}")

        left = self._node_outputs[input_node_ids[0]]
        right = self._node_outputs[input_node_ids[1]]
        join_type = data.get("joinType", "inner")
        left_key = data.get("leftKey", "")
        right_key = data.get("rightKey", "")

        if left_key not in left.columns:
            raise ValueError(f"Left key '{left_key}' not found in left input columns")
        if right_key not in right.columns:
            raise ValueError(f"Right key '{right_key}' not found in right input columns")

        left_idx = left.columns.index(left_key)
        right_idx = right.columns.index(right_key)

        # Build right index
        right_index: dict[Any, list[int]] = defaultdict(list)
        for i, row in enumerate(right.rows):
            right_index[row[right_idx]].append(i)

        # Combine columns (prefix right duplicates)
        out_columns = list(left.columns)
        for col in right.columns:
            out_columns.append(f"right_{col}" if col in left.columns else col)

        out_rows: list[list[Any]] = []
        right_matched: set[int] = set()
        null_right = [None] * len(right.columns)
        null_left = [None] * len(left.columns)

        for left_row in left.rows:
            key = left_row[left_idx]
            matches = right_index.get(key, [])
            if matches:
                for ri in matches:
                    out_rows.append(left_row + right.rows[ri])
                    right_matched.add(ri)
            elif join_type in ("left", "full"):
                out_rows.append(left_row + null_right)

        if join_type in ("right", "full"):
            for i, right_row in enumerate(right.rows):
                if i not in right_matched:
                    out_rows.append(null_left + right_row)

        return NodeOutput(columns=out_columns, rows=out_rows, row_count=len(out_rows))

    def _execute_aggregate(self, data: dict, input_node_ids: list[str]) -> NodeOutput:
        input_data = self._get_input(input_node_ids)
        group_by_cols = data.get("groupByColumns", [])
        aggregations = data.get("aggregations", [])

        col_index = {col: i for i, col in enumerate(input_data.columns)}

        # Group rows
        groups: dict[tuple, list[list[Any]]] = defaultdict(list)
        group_key_indices = [col_index[c] for c in group_by_cols if c in col_index]

        for row in input_data.rows:
            key = tuple(row[i] for i in group_key_indices)
            groups[key].append(row)

        # Build output
        out_columns = list(group_by_cols)
        for agg in aggregations:
            out_columns.append(agg.get("alias", f"{agg['function']}_{agg['column']}"))

        out_rows = []
        for key, group_rows in groups.items():
            out_row: list[Any] = list(key)
            for agg in aggregations:
                agg_col = agg.get("column", "")
                agg_func = agg.get("function", "count")
                if agg_func == "count":
                    out_row.append(len(group_rows))
                elif agg_col in col_index:
                    idx = col_index[agg_col]
                    values = [r[idx] for r in group_rows if r[idx] is not None]
                    numeric = []
                    for v in values:
                        try:
                            numeric.append(float(v))
                        except (ValueError, TypeError):
                            pass
                    if agg_func == "sum":
                        out_row.append(sum(numeric) if numeric else 0)
                    elif agg_func == "avg":
                        out_row.append(sum(numeric) / len(numeric) if numeric else None)
                    elif agg_func == "min":
                        out_row.append(min(numeric) if numeric else None)
                    elif agg_func == "max":
                        out_row.append(max(numeric) if numeric else None)
                    else:
                        out_row.append(None)
                else:
                    out_row.append(None)
            out_rows.append(out_row)

        return NodeOutput(columns=out_columns, rows=out_rows, row_count=len(out_rows))

    def _execute_destination(self, data: dict, input_node_ids: list[str]) -> NodeOutput:
        input_data = self._get_input(input_node_ids)
        connector_id = data.get("connectorId")
        schema = data.get("schema", "")
        table = data.get("table", "")
        mode = data.get("writeMode", "append")

        if not connector_id or connector_id not in self._connectors:
            raise ValueError(f"Destination connector not found: {connector_id}")
        if not schema or not table:
            raise ValueError("Destination requires schema and table")

        connector = self._connectors[connector_id]
        written = connector.write_table(
            schema=schema,
            table=table,
            columns=input_data.columns,
            rows=input_data.rows,
            mode=mode,
        )

        return NodeOutput(
            columns=input_data.columns,
            rows=input_data.rows,
            row_count=written,
        )

    @staticmethod
    def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[str]:
        adj: dict[str, list[str]] = defaultdict(list)
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            src = edge.get("source", "")
            tgt = edge.get("target", "")
            if src and tgt:
                adj[src].append(tgt)
                in_degree[tgt] = in_degree.get(tgt, 0) + 1

        queue = [nid for nid, deg in in_degree.items() if deg == 0]
        order = []
        while queue:
            current = queue.pop(0)
            order.append(current)
            for neighbor in adj.get(current, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) != len(nodes):
            raise ValueError("Pipeline contains a cycle")

        return order
