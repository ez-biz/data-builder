import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; direction: "up" | "down" | "flat" };
  hint?: string;
  /** Reserved API; no-op in MVP */
  sparkline?: number[];
  className?: string;
}

const deltaClasses: Record<"up" | "down" | "flat", string> = {
  up: "text-[var(--color-status-success)]",
  down: "text-[var(--color-status-error)]",
  flat: "text-muted-foreground",
};

export function StatCard({
  label,
  value,
  delta,
  hint,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-4 transition-shadow hover:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta && (
          <span
            className={cn(
              "font-mono text-[11px] font-semibold tabular-nums",
              deltaClasses[delta.direction],
            )}
          >
            {delta.value}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
