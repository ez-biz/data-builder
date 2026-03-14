export interface SchemaInfo {
  name: string;
  table_count: number;
}

export interface SchemasResponse {
  connector_id: string;
  schemas: SchemaInfo[];
}

export interface TableInfo {
  name: string;
  table_type: string;
  row_count_estimate: number | null;
}

export interface TablesResponse {
  connector_id: string;
  schema_name: string;
  tables: TableInfo[];
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key: boolean;
}

export interface ColumnsResponse {
  connector_id: string;
  schema_name: string;
  table: string;
  columns: ColumnInfo[];
  row_count_estimate: number | null;
}

export interface TablePreviewResponse {
  columns: string[];
  rows: unknown[][];
  total_rows_returned: number;
}
