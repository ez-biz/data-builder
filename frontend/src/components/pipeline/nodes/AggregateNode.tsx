import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "./NodeShell";
import type { AggregateNodeData } from "@/types/pipeline";

export function AggregateNode({ data, selected }: NodeProps) {
  const d = data as unknown as AggregateNodeData;
  const groups = d.groupByColumns?.length ?? 0;
  const aggs = d.aggregations?.length ?? 0;
  const summary =
    groups > 0 || aggs > 0
      ? `${groups} group${groups === 1 ? "" : "s"}, ${aggs} agg${aggs === 1 ? "" : "s"}`
      : undefined;
  return (
    <NodeShell
      kind="aggregate"
      identifier={d.label || "Aggregate"}
      summary={summary}
      selected={selected}
    />
  );
}
