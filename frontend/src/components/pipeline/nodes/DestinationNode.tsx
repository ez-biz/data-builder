import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HardDrive } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { DestinationNodeData } from "@/types/pipeline";

export function DestinationNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as DestinationNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Destination"
      icon={<HardDrive className="h-3.5 w-3.5" />}
      color="#ef4444"
      selected={selected}
    >
      <p className="font-medium">{d.label || "Select destination"}</p>
      {d.table && (
        <p className="text-muted-foreground">
          {d.schema}.{d.table}
        </p>
      )}
      {d.writeMode && (
        <p className="text-muted-foreground capitalize">{d.writeMode}</p>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !border-2 !border-red-500 !bg-white"
      />
    </NodeWrapper>
  );
}
