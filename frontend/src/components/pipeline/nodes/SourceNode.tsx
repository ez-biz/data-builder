import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { SourceNodeData } from "@/types/pipeline";

export function SourceNode({ data, selected }: NodeProps) {
  const d = data as unknown as SourceNodeData;
  const id = d.schema && d.table ? `${d.schema}.${d.table}` : "Select a table";
  const cols = d.selectedColumns?.length ?? d.columns?.length ?? 0;
  return (
    <NodeShell
      kind="source"
      identifier={id}
      mono={Boolean(d.schema && d.table)}
      summary={cols > 0 ? `${cols} column${cols === 1 ? "" : "s"}` : undefined}
      selected={selected}
      hasInput={false}
    />
  );
}
