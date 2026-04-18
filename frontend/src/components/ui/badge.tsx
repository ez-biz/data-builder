import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none transition-colors",
  {
    variants: {
      /** Semantic: run status — always paired with a text label, never color-only */
      status: {
        pending: "bg-gray-100 text-gray-700",
        running: "bg-[var(--color-status-info-faint)] text-[var(--color-status-info)]",
        completed: "bg-[var(--color-status-success-faint)] text-[var(--color-status-success)]",
        failed: "bg-[var(--color-status-error-faint)] text-[var(--color-status-error)]",
        cancelled: "bg-gray-100 text-gray-600",
      },
      /** Numeric count pill for nav counts */
      count: {
        sidebar: "bg-gray-800 text-gray-100 font-mono tabular-nums",
        muted: "bg-muted text-muted-foreground font-mono tabular-nums",
      },
      /** Pipeline node type chip — colored by node kind */
      kind: {
        source: "bg-[var(--color-node-source)]/10 text-[var(--color-node-source)]",
        filter: "bg-[var(--color-node-filter)]/10 text-[var(--color-node-filter)]",
        transform: "bg-[var(--color-node-transform)]/10 text-[var(--color-node-transform)]",
        join: "bg-[var(--color-node-join)]/10 text-[var(--color-node-join)]",
        aggregate: "bg-[var(--color-node-aggregate)]/10 text-[var(--color-node-aggregate)]",
        destination: "bg-[var(--color-node-destination)]/10 text-[var(--color-node-destination)]",
      },
      /** Legacy variants — map to token-based colors */
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-[var(--color-status-error-faint)] text-[var(--color-status-error)]",
        outline: "border border-border text-foreground",
        success: "bg-[var(--color-status-success-faint)] text-[var(--color-status-success)]",
        warning: "bg-[var(--color-status-warn-faint)] text-[var(--color-status-warn)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  status,
  count,
  kind,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, status, count, kind }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
