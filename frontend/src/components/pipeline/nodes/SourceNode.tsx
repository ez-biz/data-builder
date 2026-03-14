import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Database } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { SourceNodeData } from "@/types/pipeline";

export function SourceNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as SourceNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Source"
      icon={<Database className="h-3.5 w-3.5" />}
      color="#3b82f6"
      selected={selected}
    >
      <div className="space-y-1">
        <p className="font-medium">{d.label || "Select a table"}</p>
        {d.table && (
          <p className="text-muted-foreground">
            {d.schema}.{d.table}
          </p>
        )}
        {d.selectedColumns && d.selectedColumns.length > 0 && (
          <p className="text-muted-foreground">
            {d.selectedColumns.length} column{d.selectedColumns.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white"
      />
    </NodeWrapper>
  );
}
