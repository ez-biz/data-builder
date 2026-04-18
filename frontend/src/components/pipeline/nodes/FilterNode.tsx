import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { FilterNodeData } from "@/types/pipeline";

export function FilterNode({ data, selected }: NodeProps) {
  const d = data as unknown as FilterNodeData;
  const n = d.conditions?.length ?? 0;
  const op = d.logicalOperator ?? "AND";
  return (
    <NodeShell
      kind="filter"
      identifier={d.label || "Filter"}
      summary={n > 0 ? `${n} condition${n === 1 ? "" : "s"} (${op})` : undefined}
      selected={selected}
    />
  );
}
