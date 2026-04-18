import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { TransformNodeData } from "@/types/pipeline";

export function TransformNode({ data, selected }: NodeProps) {
  const d = data as unknown as TransformNodeData;
  const n = d.transformations?.length ?? 0;
  return (
    <NodeShell
      kind="transform"
      identifier={d.label || "Transform"}
      summary={n > 0 ? `${n} transformation${n === 1 ? "" : "s"}` : undefined}
      selected={selected}
    />
  );
}
