import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wand2 } from "lucide-react";
import { NodeWrapper } from "./NodeWrapper";
import type { TransformNodeData } from "@/types/pipeline";

export function TransformNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TransformNodeData;
  return (
    <NodeWrapper
      nodeId={id}
      label="Transform"
      icon={<Wand2 className="h-3.5 w-3.5" />}
      color="#8b5cf6"
      selected={selected}
    >
      <p className="font-medium">{d.label || "Configure transforms"}</p>
      {d.transformations && d.transformations.length > 0 && (
        <p className="text-muted-foreground">
          {d.transformations.length} transform{d.transformations.length !== 1 ? "s" : ""}
        </p>
      )}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-white"
      />
    </NodeWrapper>
  );
}
