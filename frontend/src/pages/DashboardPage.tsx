import { Link } from "react-router-dom";
import { Plug, CheckCircle2, GitBranch, RefreshCw, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConnectors } from "@/api/connectors";
import { usePipelines } from "@/api/pipelines";
import { useCDCJobs } from "@/api/cdc";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const { data: connectors } = useConnectors();
  const { data: pipelines } = usePipelines();
  const { data: cdcJobs } = useCDCJobs();

  const stats = [
    {
      title: "Connectors",
      value: connectors?.length ?? 0,
      icon: Plug,
      href: "/connectors",
    },
    {
      title: "Pipelines",
      value: pipelines?.length ?? 0,
      icon: GitBranch,
      href: "/pipelines",
    },
    {
      title: "Valid Pipelines",
      value: pipelines?.filter((p) => p.status === "valid").length ?? 0,
      icon: CheckCircle2,
      href: "/pipelines",
    },
    {
      title: "CDC Streams",
      value: cdcJobs?.length ?? 0,
      icon: RefreshCw,
      href: "/cdc",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome to Data Builder</h2>
          <p className="text-muted-foreground">
            Build ETL pipelines visually. Connect your databases, browse tables, and create data flows.
          </p>
        </div>
        <Button asChild>
          <Link to="/pipelines/new">
            <Plus className="mr-2 h-4 w-4" />
            New Pipeline
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ title, value, icon: Icon, href }) => (
          <Link key={title} to={href}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">1</span>
              <Link to="/connectors" className="text-primary hover:underline">Add a database connector</Link>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">2</span>
              <Link to="/catalog" className="text-primary hover:underline">Browse your table catalog</Link>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">3</span>
              <Link to="/pipelines/new" className="text-primary hover:underline">Create a pipeline with drag & drop</Link>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">4</span>
              <Link to="/cdc" className="text-primary hover:underline">Set up CDC to stream changes to S3</Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Pipelines</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelines && pipelines.length > 0 ? (
              <div className="space-y-2">
                {pipelines.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    to={`/pipelines/${p.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent transition-colors"
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No pipelines yet. Create your first one!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
