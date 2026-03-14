export type CDCStatus = "idle" | "running" | "paused" | "failed";

export interface CDCJob {
  id: string;
  name: string;
  connector_id: string;
  status: CDCStatus;
  source_schema: string;
  source_table: string;
  tracking_column: string;
  s3_bucket: string;
  s3_prefix: string;
  s3_region: string;
  output_format: "jsonl" | "csv";
  sync_interval_seconds: number;
  last_sync_at: string | null;
  last_value: string | null;
  total_rows_synced: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CDCJobCreate {
  name: string;
  connector_id: string;
  source_schema: string;
  source_table: string;
  tracking_column: string;
  s3_bucket: string;
  s3_prefix?: string;
  s3_region?: string;
  output_format?: "jsonl" | "csv";
  sync_interval_seconds?: number;
}

export interface CDCSyncLog {
  id: string;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  rows_captured: number;
  s3_path: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}
