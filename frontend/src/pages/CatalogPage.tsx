import { useState } from "react";
import { ChevronRight, ChevronDown, Database, Table2, Loader2, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { useConnectors } from "@/api/connectors";
import { useSchemas, useTables, useColumns, useTablePreview } from "@/api/catalog";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { ColumnInfo } from "@/types/catalog";
import { cn } from "@/lib/utils";

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
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Browse schemas, tables, and columns from your connected databases."
      />

      <div className="flex h-[calc(100vh-14rem)] gap-4">
        {/* Tree panel */}
        <div className="w-80 rounded-md border border-border bg-card">
          <div className="border-b border-border p-3">
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
                  selectedTable={
                    selectedTable?.connectorId === connector.id ? selectedTable : null
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
        <div className="flex-1 rounded-md border border-border bg-card overflow-hidden">
          {selectedTable ? (
            <TableDetail
              connectorId={selectedTable.connectorId}
              schema={selectedTable.schema}
              table={selectedTable.table}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <EmptyState
                title="Select a table"
                body="Choose a connector, schema, and table from the sidebar to view its schema and preview data."
              />
            </div>
          )}
        </div>
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
  selectedTable,
  onTableSelect,
}: {
  connectorId: string;
  connectorName: string;
  connectorType: string;
  expanded: boolean;
  onToggle: () => void;
  expandedSchema: string | null;
  onSchemaToggle: (schema: string) => void;
  selectedTable: { schema: string; table: string } | null;
  onTableSelect: (schema: string, table: string) => void;
}) {
  const { data: schemasData, isLoading } = useSchemas(expanded ? connectorId : "");

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Database className="h-4 w-4 text-primary" />
        <span className="flex-1 text-left font-medium text-foreground">{connectorName}</span>
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
                selectedTable={
                  selectedTable?.schema === schema.name ? selectedTable.table : null
                }
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
  selectedTable,
  onTableSelect,
}: {
  connectorId: string;
  schemaName: string;
  tableCount: number;
  expanded: boolean;
  onToggle: () => void;
  selectedTable: string | null;
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
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
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
            tablesData?.tables.map((table) => {
              const isSelected = selectedTable === table.name;
              return (
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
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm cursor-grab active:cursor-grabbing",
                    isSelected
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Table2 className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1 text-left font-mono text-xs">{table.name}</span>
                  {table.row_count_estimate != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      ~{table.row_count_estimate.toLocaleString()}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function TableDetail({
  connectorId,
  schema,
  table,
}: {
  connectorId: string;
  schema: string;
  table: string;
}) {
  const { data, isLoading } = useColumns(connectorId, schema, table);
  const {
    data: previewData,
    isLoading: previewLoading,
    isFetching: previewFetching,
    refetch: refetchPreview,
  } = useTablePreview(connectorId, schema, table, true);

  const schemaColumns: DataTableColumn<ColumnInfo>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => <span className="font-mono text-xs">{c.name}</span>,
      sortable: true,
    },
    {
      key: "data_type",
      header: "Type",
      cell: (c) => (
        <span className="font-mono text-xs text-muted-foreground">{c.data_type}</span>
      ),
      sortable: true,
    },
    {
      key: "is_nullable",
      header: "Nullable",
      cell: (c) => (
        <span className="text-muted-foreground">{c.is_nullable ? "yes" : "no"}</span>
      ),
      sortable: true,
    },
    {
      key: "is_primary_key",
      header: "PK",
      cell: (c) =>
        c.is_primary_key ? (
          <Badge variant="outline" className="text-[10px]">
            PK
          </Badge>
        ) : null,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h3 className="text-lg font-semibold">
            <span className="font-mono">{schema}.{table}</span>
          </h3>
          {data?.row_count_estimate != null && (
            <p className="text-sm text-muted-foreground">
              ~{data.row_count_estimate.toLocaleString()} rows
            </p>
          )}
        </div>
      </div>

      <Tabs defaultValue="schema" className="flex flex-1 flex-col overflow-hidden">
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="schema"
          className="mt-0 flex-1 overflow-auto p-4"
        >
          <DataTable<ColumnInfo>
            columns={schemaColumns}
            rows={data?.columns}
            getRowId={(c) => c.name}
            loading={isLoading}
            empty={
              <EmptyState
                title="No columns"
                body="This table has no columns to display."
              />
            }
          />
        </TabsContent>

        <TabsContent
          value="preview"
          className="mt-0 flex-1 overflow-auto p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {previewData
                ? `Showing ${previewData.total_rows_returned} rows`
                : previewLoading
                  ? "Loading preview..."
                  : "No preview data"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchPreview()}
              disabled={previewFetching}
            >
              <RefreshCw
                className={cn(
                  "mr-1 h-3 w-3",
                  previewFetching && "animate-spin",
                )}
              />
              Refresh
            </Button>
          </div>
          {previewData ? (
            <PreviewTable columns={previewData.columns} rows={previewData.rows} />
          ) : (
            <DataTable
              columns={[]}
              rows={previewLoading ? undefined : []}
              getRowId={() => ""}
              loading={previewLoading}
              empty={
                <EmptyState
                  title="No preview data"
                  body="This table has no rows to preview."
                />
              }
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: unknown[][];
}) {
  type PreviewRow = { __id: string; cells: unknown[] };
  const tableRows: PreviewRow[] = rows.map((r, i) => ({ __id: String(i), cells: r }));

  const tableColumns: DataTableColumn<PreviewRow>[] = columns.map((col, idx) => ({
    key: `col-${idx}`,
    header: <span className="font-mono text-[11px]">{col}</span>,
    cell: (row) => {
      const v = row.cells[idx];
      const display =
        v == null
          ? null
          : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
      return (
        <span className="font-mono text-xs">
          {display == null ? (
            <span className="text-muted-foreground italic">—</span>
          ) : (
            <span className="block max-w-[320px] truncate" title={display}>
              {display}
            </span>
          )}
        </span>
      );
    },
  }));

  return (
    <DataTable<PreviewRow>
      columns={tableColumns}
      rows={tableRows}
      getRowId={(r) => r.__id}
      empty={
        <EmptyState
          title="No rows"
          body="This table has no rows to preview."
        />
      }
    />
  );
}
