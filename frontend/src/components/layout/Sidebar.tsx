import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Plug,
  Database,
  GitBranch,
  RefreshCw,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/connectors", label: "Connectors", icon: Plug },
  { to: "/catalog", label: "Catalog", icon: Database },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/cdc", label: "CDC Streams", icon: RefreshCw },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-sidebar-background">
      <div className="flex h-14 items-center border-b px-4">
        <GitBranch className="mr-2 h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-sidebar-foreground">
          Data Builder
        </span>
      </div>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t p-3">
        <p className="text-xs text-muted-foreground">v0.1.0</p>
      </div>
    </aside>
  );
}
