import { useLocation, Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

const ENV = import.meta.env.VITE_ENV_NAME as string | undefined;

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/connectors": "Connectors",
  "/catalog": "Catalog",
  "/pipelines": "Pipelines",
  "/cdc": "CDC Streams",
  "/monitoring": "Monitoring",
};

function useCrumbs(pathname: string): { label: string; to?: string }[] {
  // Root routes render no crumb; nested pipeline page shows "Pipelines › <id>"
  if (pathname === "/") return [];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) return [{ label: pageTitles[pathname] ?? segments[0] }];
  if (segments[0] === "pipelines" && segments[1] && segments[1] !== "new") {
    return [
      { label: "Pipelines", to: "/pipelines" },
      { label: segments[1].slice(0, 8), to: undefined },
    ];
  }
  return segments.map((s, i) => ({ label: s, to: i < segments.length - 1 ? "/" + segments.slice(0, i + 1).join("/") : undefined }));
}

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "Data Builder";
  const crumbs = useCrumbs(location.pathname);

  return (
    <header className="flex h-11 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: title + optional breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <h1 className="truncate font-semibold text-foreground">{title}</h1>
        {crumbs.length > 1 && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {c.to ? (
                  <Link to={c.to} className="text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-mono text-muted-foreground">{c.label}</span>
                )}
              </span>
            ))}
          </>
        )}
      </div>

      {/* Right: search affordance + env badge */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Search (coming soon)"
          disabled
          className="inline-flex h-7 items-center gap-2 rounded-md border border-border bg-muted/50 px-2.5 text-[11px] text-muted-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <Kbd>⌘K</Kbd>
        </button>
        {ENV && (
          <Badge variant="outline" className="font-mono uppercase">
            {ENV}
          </Badge>
        )}
      </div>
    </header>
  );
}
