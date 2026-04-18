import {
  Database,
  Filter,
  Wand2,
  Merge,
  BarChart3,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipSpec {
  type: string;
  label: string;
  icon: LucideIcon;
  var: string;
}

const nodeToolbox: ChipSpec[] = [
  { type: "source", label: "Source", icon: Database, var: "--color-node-source" },
  { type: "filter", label: "Filter", icon: Filter, var: "--color-node-filter" },
  { type: "transform", label: "Transform", icon: Wand2, var: "--color-node-transform" },
  { type: "join", label: "Join", icon: Merge, var: "--color-node-join" },
  { type: "aggregate", label: "Aggregate", icon: BarChart3, var: "--color-node-aggregate" },
  { type: "destination", label: "Destination", icon: HardDrive, var: "--color-node-destination" },
];

export function PipelineToolbar() {
  return (
    <div className="flex h-11 items-center gap-2 border-b border-border bg-card px-3">
      <span className="text-[11px] font-medium text-muted-foreground">Drag to add:</span>
      {nodeToolbox.map(({ type, label, icon: Icon, var: cssVar }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/data-builder-node-type", type);
            e.dataTransfer.effectAllowed = "copy";
          }}
          className={cn(
            "flex h-7 cursor-grab items-center gap-1.5 rounded-md border bg-card px-2 text-[12px] font-medium transition-all",
            "hover:shadow-sm active:cursor-grabbing",
          )}
          style={{
            borderColor: `color-mix(in srgb, var(${cssVar}) 35%, transparent)`,
            color: `var(${cssVar})`,
          }}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
      ))}
    </div>
  );
}
