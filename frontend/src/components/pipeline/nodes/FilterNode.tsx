import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Filter } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { FilterNodeData } from "@/types/pipeline";

export function FilterNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FilterNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Filter"
      icon={<Filter className="h-3.5 w-3.5" />}
      color="#f59e0b"
      selected={selected}
    >
      <p className="font-medium">{d.label || "Add conditions"}</p>
      {d.conditions && d.conditions.length > 0 && (
        <p className="text-muted-foreground">
          {d.conditions.length} condition{d.conditions.length !== 1 ? "s" : ""} ({d.logicalOperator || "AND"})
        </p>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-white"
      />
    </NodeWrapper>
  );
}
