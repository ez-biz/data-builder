import { useState } from "react";
import { ChevronRight, ChevronDown, Database, Table2, Columns3, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useConnectors } from "@/api/connectors";
import { useSchemas, useTables, useColumns, useTablePreview } from "@/api/catalog";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function CatalogPage() {
  useDocumentTitle("Catalog Browser");
  const { data: connectors } = useConnectors();
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<{
    connectorId: string;
    schema: string;
    table: string;
  } | null>(null);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Tree panel */}
      <div className="w-80 rounded-lg border">
        <div className="border-b p-3">
          <h3 className="text-sm font-semibold">Data Sources</h3>
        </div>
        <ScrollArea className="h-[calc(100%-3rem)]">
          <div className="p-2">
            {connectors?.map((connector) => (
              <ConnectorTreeNode
                key={connector.id}
                connectorId={connector.id}
                connectorName={connector.name}
                connectorType={connector.connector_type}
                expanded={expandedConnector === connector.id}
                onToggle={() =>
                  setExpandedConnector(
                    expandedConnector === connector.id ? null : connector.id,
                  )
                }
                expandedSchema={
                  expandedConnector === connector.id ? expandedSchema : null
                }
                onSchemaToggle={(schema) =>
                  setExpandedSchema(expandedSchema === schema ? null : schema)
                }
                onTableSelect={(schema, table) =>
                  setSelectedTable({
                    connectorId: connector.id,
                    schema,
                    table,
                  })
                }
              />
            ))}
            {(!connectors || connectors.length === 0) && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No connectors. Add one first.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel */}
      <div className="flex-1 rounded-lg border">
        {selectedTable ? (
          <ColumnDetail
            connectorId={selectedTable.connectorId}
            schema={selectedTable.schema}
            table={selectedTable.table}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <Columns3 className="mb-2 h-12 w-12" />
            <p>Select a table to view its columns</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectorTreeNode({
  connectorId,
  connectorName,
  connectorType,
  expanded,
  onToggle,
  expandedSchema,
  onSchemaToggle,
  onTableSelect,
}: {
  connectorId: string;
  connectorName: string;
  connectorType: string;
  expanded: boolean;
  onToggle: () => void;
  expandedSchema: string | null;
  onSchemaToggle: (schema: string) => void;
  onTableSelect: (schema: string, table: string) => void;
}) {
  const { data: schemasData, isLoading } = useSchemas(expanded ? connectorId : "");

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Database className="h-4 w-4 text-primary" />
        <span className="flex-1 text-left font-medium">{connectorName}</span>
        <Badge variant="outline" className="text-[10px]">
          {connectorType}
        </Badge>
      </button>
      {expanded && (
        <div className="ml-5">
          {isLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading schemas...
            </div>
          ) : (
            schemasData?.schemas.map((schema) => (
              <SchemaTreeNode
                key={schema.name}
                connectorId={connectorId}
                schemaName={schema.name}
                tableCount={schema.table_count}
                expanded={expandedSchema === schema.name}
                onToggle={() => onSchemaToggle(schema.name)}
                onTableSelect={(table) => onTableSelect(schema.name, table)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SchemaTreeNode({
  connectorId,
  schemaName,
  tableCount,
  expanded,
  onToggle,
  onTableSelect,
}: {
  connectorId: string;
  schemaName: string;
  tableCount: number;
  expanded: boolean;
  onToggle: () => void;
  onTableSelect: (table: string) => void;
}) {
  const { data: tablesData, isLoading } = useTables(
    expanded ? connectorId : "",
    expanded ? schemaName : "",
  );

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="flex-1 text-left">{schemaName}</span>
        <span className="text-xs text-muted-foreground">{tableCount}</span>
      </button>
      {expanded && (
        <div className="ml-4">
          {isLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : (
            tablesData?.tables.map((table) => (
              <button
                key={table.name}
                onClick={() => onTableSelect(table.name)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/data-builder-table",
                    JSON.stringify({
                      connectorId,
                      schema: schemaName,
                      table: table.name,
                    }),
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent cursor-grab active:cursor-grabbing"
              >
                <Table2 className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 text-left">{table.name}</span>
                {table.row_count_estimate != null && (
                  <span className="text-[10px] text-muted-foreground">
                    ~{table.row_count_estimate.toLocaleString()}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ColumnDetail({
  connectorId,
  schema,
  table,
}: {
  connectorId: string;
  schema: string;
  table: string;
}) {
  const [tab, setTab] = useState<"schema" | "preview">("schema");
  const { data, isLoading } = useColumns(connectorId, schema, table);
  const {
    data: previewData,
    isLoading: previewLoading,
    refetch: fetchPreview,
  } = useTablePreview(connectorId, schema, table, tab === "preview");

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4 pb-3">
        <div>
          <h3 className="text-lg font-semibold">
            {schema}.{table}
          </h3>
          {data?.row_count_estimate != null && (
            <p className="text-sm text-muted-foreground">
              ~{data.row_count_estimate.toLocaleString()} rows
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-4">
        <button
          onClick={() => setTab("schema")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "schema"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Schema
        </button>
        <button
          onClick={() => {
            setTab("preview");
            if (!previewData) fetchPreview();
          }}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "preview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Preview
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {tab === "schema" ? (
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Column</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Nullable</th>
                  <th className="px-4 py-2 text-left font-medium">PK</th>
                </tr>
              </thead>
              <tbody>
                {data?.columns.map((col) => (
                  <tr key={col.name} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{col.name}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {col.data_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {col.is_nullable ? "yes" : "no"}
                    </td>
                    <td className="px-4 py-2">
                      {col.is_primary_key && (
                        <Badge variant="default" className="text-[10px]">
                          PK
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : previewData ? (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {previewData.columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-xs">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, ri) => (
                  <tr key={ri} className="border-b last:border-0 hover:bg-accent/30">
                    {row.map((cell, ci) => (
                      <td key={ci} className="whitespace-nowrap px-3 py-1.5 font-mono text-xs max-w-[200px] truncate tabular-nums">
                        {cell == null ? (
                          <span className="text-muted-foreground italic">NULL</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              Showing {previewData.total_rows_returned} rows
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Click Preview to load sample data</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => fetchPreview()}
            >
              Load Preview
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
