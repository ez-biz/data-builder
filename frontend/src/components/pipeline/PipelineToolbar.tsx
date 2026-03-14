import {
  Database,
  Filter,
  Wand2,
  Merge,
  BarChart3,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nodeToolbox = [
  { type: "source", label: "Source", icon: Database, color: "#3b82f6" },
  { type: "filter", label: "Filter", icon: Filter, color: "#f59e0b" },
  { type: "transform", label: "Transform", icon: Wand2, color: "#8b5cf6" },
  { type: "join", label: "Join", icon: Merge, color: "#06b6d4" },
  { type: "aggregate", label: "Aggregate", icon: BarChart3, color: "#10b981" },
  { type: "destination", label: "Destination", icon: HardDrive, color: "#ef4444" },
];

export function PipelineToolbar() {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border bg-white p-2 shadow-sm">
      <span className="self-center text-xs font-medium text-muted-foreground mr-1">
        Drag to add:
      </span>
      {nodeToolbox.map(({ type, label, icon: Icon, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/data-builder-node-type", type);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className={cn(
            "flex cursor-grab items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:shadow-sm active:cursor-grabbing",
          )}
          style={{ borderColor: color + "60", color }}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      ))}
    </div>
  );
}
