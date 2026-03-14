import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BarChart3 } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { AggregateNodeData } from "@/types/pipeline";

export function AggregateNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as AggregateNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Aggregate"
      icon={<BarChart3 className="h-3.5 w-3.5" />}
      color="#10b981"
      selected={selected}
    >
      <p className="font-medium">{d.label || "Configure aggregation"}</p>
      {d.groupByColumns && d.groupByColumns.length > 0 && (
        <p className="text-muted-foreground">
          Group by {d.groupByColumns.length} column{d.groupByColumns.length !== 1 ? "s" : ""}
        </p>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-white"
      />
    </NodeWrapper>
  );
}
