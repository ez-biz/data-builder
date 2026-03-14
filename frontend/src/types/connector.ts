export type ConnectorType = "postgresql" | "databricks";

export interface Connector {
  id: string;
  name: string;
  connector_type: ConnectorType;
  is_active: boolean;
  last_tested_at: string | null;
  test_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectorCreate {
  name: string;
  connector_type: ConnectorType;
  connection_config: Record<string, unknown>;
}

export interface ConnectorUpdate {
  name?: string;
  connection_config?: Record<string, unknown>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
  server_version: string | null;
}
