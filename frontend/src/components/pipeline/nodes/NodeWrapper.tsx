import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineStore } from "@/stores/pipeline-store";

interface Props {
  nodeId: string;
  label: string;
  icon: ReactNode;
  color: string;
  children: ReactNode;
  selected?: boolean;
}

export function NodeWrapper({ nodeId, label, icon, color, children, selected }: Props) {
  const removeNode = usePipelineStore((s) => s.removeNode);

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-xl border-2 bg-white shadow-md transition-shadow",
        selected ? "shadow-lg ring-2 ring-primary/50" : "hover:shadow-lg",
      )}
      style={{ borderColor: color }}
    >
      <div
        className="flex items-center justify-between rounded-t-[10px] px-3 py-2"
        style={{ backgroundColor: color + "15" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color }}>{icon}</span>
          <span className="text-xs font-semibold" style={{ color }}>
            {label}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeNode(nodeId);
          }}
          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
          style={{ opacity: selected ? 1 : undefined }}
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      <div className="px-3 py-2 text-xs">{children}</div>
    </div>
  );
}
