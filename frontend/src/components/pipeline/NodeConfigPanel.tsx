import { useEffect } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useConnectors } from "@/api/connectors";
import { useSchemas, useTables, useColumns } from "@/api/catalog";

export function NodeConfigPanel() {
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const nodes = usePipelineStore((s) => s.nodes);
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const selectNode = usePipelineStore((s) => s.selectNode);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const nodeType = node.type;

  return (
    <div className="w-72 border-l bg-white">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-semibold capitalize">{nodeType} Config</h3>
        <button
          onClick={() => selectNode(null)}
          className="rounded p-1 hover:bg-accent"
          aria-label="Close config panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="h-[calc(100%-3rem)]">
        <div className="space-y-4 p-3">
          {/* Label - common to all nodes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Label</label>
            <Input
              value={(data.label as string) || ""}
              onChange={(e) =>
                updateNodeData(node.id, { label: e.target.value } as Record<string, unknown>)
              }
              placeholder="Node label"
            />
          </div>

          {nodeType === "source" && <SourceConfig nodeId={node.id} data={data} />}
          {nodeType === "filter" && <FilterConfig nodeId={node.id} data={data} />}
          {nodeType === "transform" && <TransformConfig nodeId={node.id} data={data} />}
          {nodeType === "join" && <JoinConfig nodeId={node.id} data={data} />}
          {nodeType === "aggregate" && <AggregateConfig nodeId={node.id} data={data} />}
          {nodeType === "destination" && (
            <DestinationConfig nodeId={node.id} data={data} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Shared connector selector ───────────────────────────────────────────────

function ConnectorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { data: connectors } = useConnectors();

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">Connector</label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select connector" />
        </SelectTrigger>
        <SelectContent>
          {connectors?.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name} ({c.connector_type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Source Node Config ──────────────────────────────────────────────────────

function SourceConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const connectorId = (data.connectorId as string) || "";
  const schema = (data.schema as string) || "";
  const table = (data.table as string) || "";

  const { data: schemasData } = useSchemas(connectorId);
  const { data: tablesData } = useTables(connectorId, schema);
  const { data: columnsData, isLoading: columnsLoading } = useColumns(connectorId, schema, table);

  // Auto-populate columns when they load
  useEffect(() => {
    if (columnsData?.columns && columnsData.columns.length > 0) {
      const current = (data.columns as { name: string }[]) || [];
      const fetchedNames = columnsData.columns.map((c) => c.name).join(",");
      const currentNames = current.map((c) => c.name).join(",");
      if (fetchedNames !== currentNames) {
        updateNodeData(nodeId, {
          columns: columnsData.columns.map((c) => ({ name: c.name, data_type: c.data_type })),
        } as Record<string, unknown>);
      }
    }
  }, [columnsData, nodeId, updateNodeData, data.columns]);

  return (
    <>
      <ConnectorSelect
        value={connectorId}
        onChange={(id) =>
          updateNodeData(nodeId, {
            connectorId: id,
            schema: "",
            table: "",
            columns: [],
            selectedColumns: [],
          } as Record<string, unknown>)
        }
      />

      <div>
        <label className="text-xs font-medium text-muted-foreground">Schema</label>
        {connectorId && schemasData ? (
          <Select
            value={schema}
            onValueChange={(v) =>
              updateNodeData(nodeId, {
                schema: v,
                table: "",
                columns: [],
                selectedColumns: [],
              } as Record<string, unknown>)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select schema" />
            </SelectTrigger>
            <SelectContent>
              {schemasData.schemas.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.table_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={schema}
            onChange={(e) =>
              updateNodeData(nodeId, { schema: e.target.value } as Record<string, unknown>)
            }
            placeholder="public"
          />
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Table</label>
        {connectorId && schema && tablesData ? (
          <Select
            value={table}
            onValueChange={(v) => {
              updateNodeData(nodeId, {
                table: v,
                label: `${schema}.${v}`,
                columns: [],
                selectedColumns: [],
              } as Record<string, unknown>);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select table" />
            </SelectTrigger>
            <SelectContent>
              {tablesData.tables.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                  {t.row_count_estimate != null && ` (~${t.row_count_estimate.toLocaleString()})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={table}
            onChange={(e) =>
              updateNodeData(nodeId, { table: e.target.value } as Record<string, unknown>)
            }
            placeholder="users"
          />
        )}
      </div>

      {/* Column selector */}
      {columnsLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading columns...
        </div>
      )}
      {data.columns && Array.isArray(data.columns) && (data.columns as unknown[]).length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Columns ({(data.selectedColumns as string[])?.length || 0}/{(data.columns as unknown[]).length})
            </label>
            <button
              className="text-[10px] text-primary hover:underline"
              onClick={() => {
                const all = (data.columns as { name: string }[]).map((c) => c.name);
                const selected = (data.selectedColumns as string[]) || [];
                updateNodeData(nodeId, {
                  selectedColumns: selected.length === all.length ? [] : all,
                } as Record<string, unknown>);
              }}
            >
              {(data.selectedColumns as string[])?.length === (data.columns as unknown[]).length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>
          <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded border p-2">
            {(data.columns as { name: string; data_type?: string }[]).map((col) => {
              const selected = (data.selectedColumns as string[]) || [];
              const isSelected = selected.includes(col.name);
              return (
                <label
                  key={col.name}
                  className="flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 rounded px-1"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const next = isSelected
                        ? selected.filter((c) => c !== col.name)
                        : [...selected, col.name];
                      updateNodeData(nodeId, {
                        selectedColumns: next,
                      } as Record<string, unknown>);
                    }}
                  />
                  <span className="flex-1">{col.name}</span>
                  {col.data_type && (
                    <span className="text-[10px] text-muted-foreground font-mono">{col.data_type}</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Filter Node Config ──────────────────────────────────────────────────────

function FilterConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const conditions = (data.conditions as { column: string; operator: string; value: string }[]) || [];

  const addCondition = () => {
    updateNodeData(nodeId, {
      conditions: [...conditions, { column: "", operator: "eq", value: "" }],
    } as Record<string, unknown>);
  };

  const updateCondition = (idx: number, field: string, value: string) => {
    const next = conditions.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c,
    );
    updateNodeData(nodeId, { conditions: next } as Record<string, unknown>);
  };

  const removeCondition = (idx: number) => {
    updateNodeData(nodeId, {
      conditions: conditions.filter((_, i) => i !== idx),
    } as Record<string, unknown>);
  };

  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Logical Operator</label>
        <Select
          value={(data.logicalOperator as string) || "AND"}
          onValueChange={(v) =>
            updateNodeData(nodeId, { logicalOperator: v } as Record<string, unknown>)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Conditions</label>
        <div className="space-y-2">
          {conditions.map((cond, i) => (
            <div key={i} className="flex gap-1">
              <Input
                className="flex-1"
                placeholder="column"
                value={cond.column}
                onChange={(e) => updateCondition(i, "column", e.target.value)}
              />
              <Select
                value={cond.operator}
                onValueChange={(v) => updateCondition(i, "operator", v)}
              >
                <SelectTrigger className="w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eq">=</SelectItem>
                  <SelectItem value="neq">!=</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="gte">&ge;</SelectItem>
                  <SelectItem value="lte">&le;</SelectItem>
                  <SelectItem value="like">LIKE</SelectItem>
                  <SelectItem value="in">IN</SelectItem>
                  <SelectItem value="is_null">IS NULL</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder="value"
                value={cond.value}
                onChange={(e) => updateCondition(i, "value", e.target.value)}
              />
              <button
                onClick={() => removeCondition(i)}
                className="text-destructive px-1"
                aria-label={`Remove condition ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addCondition}>
          <Plus className="mr-1 h-3 w-3" />
          Add Condition
        </Button>
      </div>
    </>
  );
}

// ─── Transform Node Config ───────────────────────────────────────────────────

function TransformConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const transformations = (data.transformations as {
    sourceColumn: string;
    operation: string;
    targetColumn: string;
    expression?: string;
  }[]) || [];

  const addTransform = () => {
    updateNodeData(nodeId, {
      transformations: [
        ...transformations,
        { sourceColumn: "", operation: "rename", targetColumn: "", expression: "" },
      ],
    } as Record<string, unknown>);
  };

  const updateTransform = (idx: number, field: string, value: string) => {
    const next = transformations.map((t, i) =>
      i === idx ? { ...t, [field]: value } : t,
    );
    updateNodeData(nodeId, { transformations: next } as Record<string, unknown>);
  };

  const removeTransform = (idx: number) => {
    updateNodeData(nodeId, {
      transformations: transformations.filter((_, i) => i !== idx),
    } as Record<string, unknown>);
  };

  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">Transformations</label>
      <div className="space-y-3 mt-1">
        {transformations.map((t, i) => (
          <div key={i} className="rounded border p-2 space-y-2 relative">
            <button
              onClick={() => removeTransform(i)}
              className="absolute right-1.5 top-1.5 text-destructive"
              aria-label={`Remove transformation ${i + 1}`}
            >
              <X className="h-3 w-3" />
            </button>

            <div>
              <label className="text-[10px] text-muted-foreground">Operation</label>
              <Select
                value={t.operation}
                onValueChange={(v) => updateTransform(i, "operation", v)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rename">Rename Column</SelectItem>
                  <SelectItem value="cast">Cast Type</SelectItem>
                  <SelectItem value="expression">SQL Expression</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">Source Column</label>
              <Input
                className="h-7 text-xs"
                placeholder="original_column"
                value={t.sourceColumn}
                onChange={(e) => updateTransform(i, "sourceColumn", e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">
                {t.operation === "cast" ? "Target Type" : t.operation === "expression" ? "Expression" : "New Name"}
              </label>
              {t.operation === "expression" ? (
                <Input
                  className="h-7 text-xs font-mono"
                  placeholder="UPPER(column_name)"
                  value={t.expression || ""}
                  onChange={(e) => updateTransform(i, "expression", e.target.value)}
                />
              ) : t.operation === "cast" ? (
                <Select
                  value={t.targetColumn || ""}
                  onValueChange={(v) => updateTransform(i, "targetColumn", v)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VARCHAR">VARCHAR</SelectItem>
                    <SelectItem value="INTEGER">INTEGER</SelectItem>
                    <SelectItem value="BIGINT">BIGINT</SelectItem>
                    <SelectItem value="FLOAT">FLOAT</SelectItem>
                    <SelectItem value="DOUBLE">DOUBLE</SelectItem>
                    <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                    <SelectItem value="DATE">DATE</SelectItem>
                    <SelectItem value="TIMESTAMP">TIMESTAMP</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-7 text-xs"
                  placeholder="new_column_name"
                  value={t.targetColumn}
                  onChange={(e) => updateTransform(i, "targetColumn", e.target.value)}
                />
              )}
            </div>

            {t.operation === "expression" && (
              <div>
                <label className="text-[10px] text-muted-foreground">Output Alias</label>
                <Input
                  className="h-7 text-xs"
                  placeholder="computed_col"
                  value={t.targetColumn}
                  onChange={(e) => updateTransform(i, "targetColumn", e.target.value)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addTransform}>
        <Plus className="mr-1 h-3 w-3" />
        Add Transformation
      </Button>
    </div>
  );
}

// ─── Join Node Config ────────────────────────────────────────────────────────

function JoinConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);

  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Join Type</label>
        <Select
          value={(data.joinType as string) || "inner"}
          onValueChange={(v) =>
            updateNodeData(nodeId, { joinType: v } as Record<string, unknown>)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inner">Inner Join</SelectItem>
            <SelectItem value="left">Left Join</SelectItem>
            <SelectItem value="right">Right Join</SelectItem>
            <SelectItem value="full">Full Outer Join</SelectItem>
            <SelectItem value="cross">Cross Join</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Left Key</label>
        <Input
          value={(data.leftKey as string) || ""}
          onChange={(e) =>
            updateNodeData(nodeId, { leftKey: e.target.value } as Record<string, unknown>)
          }
          placeholder="id"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Right Key</label>
        <Input
          value={(data.rightKey as string) || ""}
          onChange={(e) =>
            updateNodeData(nodeId, { rightKey: e.target.value } as Record<string, unknown>)
          }
          placeholder="user_id"
        />
      </div>
    </>
  );
}

// ─── Aggregate Node Config ───────────────────────────────────────────────────

function AggregateConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const groupByColumns = (data.groupByColumns as string[]) || [];
  const aggregations = (data.aggregations as {
    column: string;
    function: string;
    alias: string;
  }[]) || [];

  const updateGroupBy = (value: string) => {
    const cols = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateNodeData(nodeId, { groupByColumns: cols } as Record<string, unknown>);
  };

  const addAggregation = () => {
    updateNodeData(nodeId, {
      aggregations: [
        ...aggregations,
        { column: "", function: "count", alias: "" },
      ],
    } as Record<string, unknown>);
  };

  const updateAggregation = (idx: number, field: string, value: string) => {
    const next = aggregations.map((a, i) =>
      i === idx ? { ...a, [field]: value } : a,
    );
    updateNodeData(nodeId, { aggregations: next } as Record<string, unknown>);
  };

  const removeAggregation = (idx: number) => {
    updateNodeData(nodeId, {
      aggregations: aggregations.filter((_, i) => i !== idx),
    } as Record<string, unknown>);
  };

  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          GROUP BY Columns
        </label>
        <Input
          value={groupByColumns.join(", ")}
          onChange={(e) => updateGroupBy(e.target.value)}
          placeholder="region, category"
        />
        <p className="mt-0.5 text-[10px] text-muted-foreground">Comma-separated column names</p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Aggregations</label>
        <div className="space-y-2 mt-1">
          {aggregations.map((agg, i) => (
            <div key={i} className="flex gap-1 items-start">
              <div className="flex-1 space-y-1">
                <Select
                  value={agg.function}
                  onValueChange={(v) => updateAggregation(i, "function", v)}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">COUNT</SelectItem>
                    <SelectItem value="sum">SUM</SelectItem>
                    <SelectItem value="avg">AVG</SelectItem>
                    <SelectItem value="min">MIN</SelectItem>
                    <SelectItem value="max">MAX</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 text-xs"
                  placeholder="column"
                  value={agg.column}
                  onChange={(e) => updateAggregation(i, "column", e.target.value)}
                />
                <Input
                  className="h-7 text-xs"
                  placeholder="alias (e.g. total_sales)"
                  value={agg.alias}
                  onChange={(e) => updateAggregation(i, "alias", e.target.value)}
                />
              </div>
              <button
                onClick={() => removeAggregation(i)}
                className="text-destructive px-1 mt-1"
                aria-label={`Remove aggregation ${i + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addAggregation}>
          <Plus className="mr-1 h-3 w-3" />
          Add Aggregation
        </Button>
      </div>
    </>
  );
}

// ─── Destination Node Config ─────────────────────────────────────────────────

function DestinationConfig({
  nodeId,
  data,
}: {
  nodeId: string;
  data: Record<string, unknown>;
}) {
  const updateNodeData = usePipelineStore((s) => s.updateNodeData);
  const connectorId = (data.connectorId as string) || "";
  const schema = (data.schema as string) || "";

  const { data: schemasData } = useSchemas(connectorId);

  return (
    <>
      <ConnectorSelect
        value={connectorId}
        onChange={(id) =>
          updateNodeData(nodeId, {
            connectorId: id,
            schema: "",
            table: "",
          } as Record<string, unknown>)
        }
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground">Schema</label>
        {connectorId && schemasData ? (
          <Select
            value={schema}
            onValueChange={(v) =>
              updateNodeData(nodeId, { schema: v, table: "" } as Record<string, unknown>)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select schema" />
            </SelectTrigger>
            <SelectContent>
              {schemasData.schemas.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={schema}
            onChange={(e) =>
              updateNodeData(nodeId, { schema: e.target.value } as Record<string, unknown>)
            }
            placeholder="analytics"
          />
        )}
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Table</label>
        <Input
          value={(data.table as string) || ""}
          onChange={(e) =>
            updateNodeData(nodeId, { table: e.target.value } as Record<string, unknown>)
          }
          placeholder="output_table"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Write Mode</label>
        <Select
          value={(data.writeMode as string) || "append"}
          onValueChange={(v) =>
            updateNodeData(nodeId, { writeMode: v } as Record<string, unknown>)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="append">Append</SelectItem>
            <SelectItem value="overwrite">Overwrite</SelectItem>
            <SelectItem value="upsert">Upsert</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
