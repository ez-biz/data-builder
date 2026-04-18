import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Plug,
  Database,
  GitBranch,
  RefreshCw,
  Activity,
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useConnectors } from "@/api/connectors";
import { usePipelines } from "@/api/pipelines";

const STORAGE_KEY = "databuilder:sidebar-collapsed";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/connectors", label: "Connectors", icon: Plug, badgeSource: "connectors" as const },
  { to: "/catalog", label: "Catalog", icon: Database },
  { to: "/pipelines", label: "Pipelines", icon: GitBranch, badgeSource: "pipelines" as const },
  { to: "/cdc", label: "CDC Streams", icon: RefreshCw },
  { to: "/monitoring", label: "Monitoring", icon: Activity },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const { data: connectors } = useConnectors();
  const { data: pipelines } = usePipelines();
  const health = useBackendHealth();

  const badgeFor = (source?: "connectors" | "pipelines") => {
    if (source === "connectors") return connectors?.length ?? 0;
    if (source === "pipelines") return pipelines?.length ?? 0;
    return undefined;
  };

  const width = collapsed ? "w-14" : "w-56";

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          "flex h-full flex-col bg-[var(--color-sidebar-background)] text-[var(--color-sidebar-foreground)] transition-[width] duration-150",
          width,
        )}
      >
        {/* Brand row */}
        <div className="flex h-14 items-center justify-between border-b border-[var(--color-sidebar-border)] px-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GitBranch className="h-4 w-4" />
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-[var(--color-sidebar-foreground-strong)]">
                Data Builder
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md p-1 text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Main navigation" className="flex-1 space-y-0.5 p-2">
          {navItems.map(({ to, label, icon: Icon, end, badgeSource }) => {
            const badge = badgeFor(badgeSource);
            const navLink = (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sidebar-ring)]",
                    isActive
                      ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-foreground-strong)]"
                      : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-[var(--color-sidebar-active-accent)]"
                      />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        isActive ? "text-[var(--color-sidebar-active-icon)]" : "text-[var(--color-sidebar-muted)]",
                      )}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{label}</span>
                        {badge !== undefined && badge > 0 && (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-800 px-1.5 font-mono text-[10px] tabular-nums text-gray-100">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
              </NavLink>
            );

            return collapsed ? (
              <Tooltip key={to}>
                <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            ) : (
              navLink
            );
          })}
        </nav>

        {/* Footer: settings link + version + health dot */}
        <div className="border-t border-[var(--color-sidebar-border)] p-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sidebar-ring)]",
                isActive
                  ? "bg-[var(--color-sidebar-active-bg)] text-[var(--color-sidebar-foreground-strong)]"
                  : "text-[var(--color-sidebar-foreground)] hover:bg-[var(--color-sidebar-hover)] hover:text-[var(--color-sidebar-foreground-strong)]",
              )
            }
          >
            <Settings className="h-4 w-4 flex-shrink-0 text-[var(--color-sidebar-muted)]" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
          {!collapsed && (
            <div className="mt-2 flex items-center justify-between px-2.5 text-[11px] text-[var(--color-sidebar-muted)]">
              <span className="font-mono">v0.1.0</span>
              <HealthIndicator status={health.data?.status} isError={health.isError} />
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function HealthIndicator({ status, isError }: { status?: string; isError?: boolean }) {
  const ok = status === "healthy" && !isError;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ok ? "Backend healthy" : "Backend unreachable"}
          className="flex items-center gap-1.5"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              ok ? "bg-[var(--color-status-success)]" : "bg-[var(--color-status-error)]",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {ok ? "Backend online" : "Backend offline"}
      </TooltipContent>
    </Tooltip>
  );
}
