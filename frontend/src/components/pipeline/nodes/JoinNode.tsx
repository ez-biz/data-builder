import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { JoinNodeData } from "@/types/pipeline";

export function JoinNode({ data, selected }: NodeProps) {
  const d = data as unknown as JoinNodeData;
  const joinType = (d.joinType ?? "inner").toUpperCase();
  return (
    <NodeShell
      kind="join"
      identifier={d.label || "Join"}
      summary={`${joinType} JOIN`}
      selected={selected}
      inputHandleIds={["left", "right"]}
    />
  );
}
