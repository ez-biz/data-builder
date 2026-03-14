import type { Node, Edge } from "@xyflow/react";

export type PipelineNodeType =
  | "source"
  | "transform"
  | "filter"
  | "join"
  | "aggregate"
  | "destination";

export type PipelineStatus =
  | "draft"
  | "valid"
  | "invalid"
  | "running"
  | "completed"
  | "failed";

export interface SourceNodeData {
  label: string;
  connectorId: string;
  schema: string;
  table: string;
  columns: { name: string; data_type: string }[];
  selectedColumns: string[];
  [key: string]: unknown;
}

export interface FilterNodeData {
  label: string;
  conditions: {
    column: string;
    operator: string;
    value: string;
  }[];
  logicalOperator: "AND" | "OR";
  [key: string]: unknown;
}

export interface TransformNodeData {
  label: string;
  transformations: {
    sourceColumn: string;
    operation: "rename" | "cast" | "expression";
    targetColumn: string;
    expression?: string;
  }[];
  [key: string]: unknown;
}

export interface JoinNodeData {
  label: string;
  joinType: "inner" | "left" | "right" | "full" | "cross";
  leftKey: string;
  rightKey: string;
  [key: string]: unknown;
}

export interface AggregateNodeData {
  label: string;
  groupByColumns: string[];
  aggregations: {
    column: string;
    function: "count" | "sum" | "avg" | "min" | "max";
    alias: string;
  }[];
  [key: string]: unknown;
}

export interface DestinationNodeData {
  label: string;
  connectorId: string;
  schema: string;
  table: string;
  writeMode: "append" | "overwrite" | "upsert";
  [key: string]: unknown;
}

export type PipelineNodeData =
  | SourceNodeData
  | FilterNodeData
  | TransformNodeData
  | JoinNodeData
  | AggregateNodeData
  | DestinationNodeData;

export interface PipelineDefinition {
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  status: PipelineStatus;
  definition: PipelineDefinition;
  source_connector_id: string | null;
  schedule_cron: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineListItem {
  id: string;
  name: string;
  description: string | null;
  status: PipelineStatus;
  source_connector_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationError {
  node_id: string | null;
  message: string;
}

export interface PipelineValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface PipelineRun {
  id: string;
  pipeline_id: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  rows_processed: number | null;
  node_results: Record<string, { status: string; row_count?: number; error?: string }> | null;
  triggered_by: string;
  created_at: string;
  updated_at: string;
}

export interface PipelineRunListItem {
  id: string;
  pipeline_id: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  rows_processed: number | null;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
}
