import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useConnectors } from "@/api/connectors";
import { useSchemas, useTables } from "@/api/catalog";

export function CatalogSidebar() {
  const { data: connectors } = useConnectors();
  const [expandedConnector, setExpandedConnector] = useState<string | null>(
    null,
  );
  const [expandedSchema, setExpandedSchema] = useState<string | null>(null);

  return (
    <div className="w-64 border-r bg-white">
      <div className="border-b p-3">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Data Catalog
        </h3>
        <p className="text-[10px] text-muted-foreground">
          Drag tables onto the canvas
        </p>
      </div>
      <ScrollArea className="h-[calc(100%-4rem)]">
        <div className="p-2">
          {connectors?.map((connector) => (
            <SidebarConnector
              key={connector.id}
              connectorId={connector.id}
              name={connector.name}
              type={connector.connector_type}
              expanded={expandedConnector === connector.id}
              onToggle={() =>
                setExpandedConnector(
                  expandedConnector === connector.id ? null : connector.id,
                )
              }
              expandedSchema={
                expandedConnector === connector.id ? expandedSchema : null
              }
              onSchemaToggle={(s) =>
                setExpandedSchema(expandedSchema === s ? null : s)
              }
            />
          ))}
          {(!connectors || connectors.length === 0) && (
            <p className="p-3 text-center text-xs text-muted-foreground">
              No connectors added yet.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SidebarConnector({
  connectorId,
  name,
  type,
  expanded,
  onToggle,
  expandedSchema,
  onSchemaToggle,
}: {
  connectorId: string;
  name: string;
  type: string;
  expanded: boolean;
  onToggle: () => void;
  expandedSchema: string | null;
  onSchemaToggle: (schema: string) => void;
}) {
  const { data, isLoading } = useSchemas(expanded ? connectorId : "");

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Database className="h-3 w-3 text-primary" />
        <span className="flex-1 text-left font-medium truncate">{name}</span>
        <Badge variant="outline" className="text-[8px] px-1 py-0">
          {type}
        </Badge>
      </button>
      {expanded && (
        <div className="ml-4">
          {isLoading ? (
            <div className="flex items-center gap-1 p-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading...
            </div>
          ) : (
            data?.schemas.map((schema) => (
              <SidebarSchema
                key={schema.name}
                connectorId={connectorId}
                schemaName={schema.name}
                expanded={expandedSchema === schema.name}
                onToggle={() => onSchemaToggle(schema.name)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SidebarSchema({
  connectorId,
  schemaName,
  expanded,
  onToggle,
}: {
  connectorId: string;
  schemaName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data, isLoading } = useTables(
    expanded ? connectorId : "",
    expanded ? schemaName : "",
  );

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent"
      >
        {expanded ? (
          <ChevronDown className="h-2.5 w-2.5" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" />
        )}
        <span className="flex-1 text-left truncate">{schemaName}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {isLoading ? (
            <div className="flex items-center gap-1 p-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading...
            </div>
          ) : (
            data?.tables.map((table) => (
              <div
                key={table.name}
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
                className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent cursor-grab active:cursor-grabbing"
              >
                <Table2 className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 truncate">{table.name}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
