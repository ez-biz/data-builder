import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Merge } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { JoinNodeData } from "@/types/pipeline";

export function JoinNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as JoinNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Join"
      icon={<Merge className="h-3.5 w-3.5" />}
      color="#06b6d4"
      selected={selected}
    >
      <p className="font-medium">{d.label || "Configure join"}</p>
      {d.joinType && (
        <p className="text-muted-foreground uppercase">{d.joinType} join</p>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ top: "35%" }}
        className="!h-3 !w-3 !border-2 !border-cyan-500 !bg-white"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="right"
        style={{ top: "65%" }}
        className="!h-3 !w-3 !border-2 !border-cyan-500 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-cyan-500 !bg-white"
      />
    </NodeWrapper>
  );
}
