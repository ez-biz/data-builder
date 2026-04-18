import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { DestinationNodeData } from "@/types/pipeline";

export function DestinationNode({ data, selected }: NodeProps) {
  const d = data as unknown as DestinationNodeData;
  const id = d.schema && d.table ? `${d.schema}.${d.table}` : "Select a destination";
  return (
    <NodeShell
      kind="destination"
      identifier={id}
      mono={Boolean(d.schema && d.table)}
      summary={d.writeMode ?? undefined}
      selected={selected}
      hasOutput={false}
    />
  );
}
