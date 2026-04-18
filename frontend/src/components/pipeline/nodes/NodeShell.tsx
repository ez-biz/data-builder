import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

type NodeKind =
  | "source"
  | "filter"
  | "transform"
  | "join"
  | "aggregate"
  | "destination";

const accentVar: Record<NodeKind, string> = {
  source: "var(--color-node-source)",
  filter: "var(--color-node-filter)",
  transform: "var(--color-node-transform)",
  join: "var(--color-node-join)",
  aggregate: "var(--color-node-aggregate)",
  destination: "var(--color-node-destination)",
};

export interface NodeShellProps {
  kind: NodeKind;
  /** Primary identifier — rendered in mono if `mono` */
  identifier: string;
  mono?: boolean;
  /** Optional summary line (e.g. "9 columns", "INNER JOIN") */
  summary?: string;
  selected?: boolean;
  hasError?: boolean;
  isRunning?: boolean;
  hasInput?: boolean;
  hasOutput?: boolean;
  /** Handle IDs for sources with >1 input (join takes left/right) */
  inputHandleIds?: string[];
}

export function NodeShell({
  kind,
  identifier,
  mono,
  summary,
  selected,
  hasError,
  isRunning,
  hasInput = true,
  hasOutput = true,
  inputHandleIds,
}: NodeShellProps) {
  return (
    <div
      className={cn(
        "relative flex min-w-[160px] max-w-[260px] rounded-md border bg-card text-foreground transition-all",
        selected
          ? "border-primary shadow-md"
          : hasError
          ? "border-[var(--color-status-error)] bg-[var(--color-status-error-faint)]"
          : "border-border hover:border-gray-400 hover:shadow-md",
      )}
    >
      {/* Left accent bar */}
      <span
        aria-hidden
        className={cn("w-1 rounded-l-md", isRunning && "animate-pulse")}
        style={{ background: accentVar[kind] }}
      />
      <div className="flex-1 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {kind}
        </div>
        <div
          className={cn(
            "mt-0.5 truncate text-[13px] font-semibold text-foreground",
            mono && "font-mono",
          )}
          title={identifier}
        >
          {identifier}
        </div>
        {summary && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{summary}</div>
        )}
      </div>

      {hasInput &&
        (inputHandleIds?.length ? (
          inputHandleIds.map((id, i) => (
            <Handle
              key={id}
              type="target"
              position={Position.Left}
              id={id}
              style={{ top: `${(100 / (inputHandleIds.length + 1)) * (i + 1)}%` }}
            />
          ))
        ) : (
          <Handle type="target" position={Position.Left} id="input" />
        ))}
      {hasOutput && <Handle type="source" position={Position.Right} id="output" />}
    </div>
  );
}
