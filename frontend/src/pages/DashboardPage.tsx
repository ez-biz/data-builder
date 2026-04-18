import { Link } from "react-router-dom";
import { Plus, GitBranch, Plug, CheckCircle2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePipelines } from "@/api/pipelines";
import { useConnectors } from "@/api/connectors";
import { useCDCJobs } from "@/api/cdc";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { PipelineListItem } from "@/types/pipeline";

export function DashboardPage() {
  useDocumentTitle("Dashboard — Data Builder");
  const { data: pipelines, isLoading: pLoading } = usePipelines();
  const { data: connectors, isLoading: cLoading } = useConnectors();
  const { data: cdcJobs } = useCDCJobs();

  const validCount =
    pipelines?.filter((p) => p.status === "valid" || p.status === "completed").length ?? 0;

  const recent: PipelineListItem[] = [...(pipelines ?? [])]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const columns: DataTableColumn<PipelineListItem>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <Link to={`/pipelines/${r.id}`} className="font-medium text-foreground hover:underline">
          {r.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant="outline">{r.status}</Badge>,
      width: "w-32",
    },
    {
      key: "updated_at",
      header: "Updated",
      cell: (r) =>
        r.updated_at ? (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {new Date(r.updated_at).toLocaleDateString()}
          </span>
        ) : (
          "—"
        ),
      width: "w-32",
      sortable: true,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of pipelines, connectors, and activity."
        actions={
          <Button asChild variant="default">
            <Link to="/pipelines/new">
              <Plus className="h-3.5 w-3.5" /> New Pipeline
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connectors"
          value={cLoading ? "—" : connectors?.length ?? 0}
          hint="Database connections"
        />
        <StatCard
          label="Pipelines"
          value={pLoading ? "—" : pipelines?.length ?? 0}
          hint="Total defined"
        />
        <StatCard
          label="Valid Pipelines"
          value={pLoading ? "—" : validCount}
          hint="Passing validation"
        />
        <StatCard
          label="CDC Streams"
          value={cdcJobs?.length ?? 0}
          hint="Active jobs"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Pipelines
        </h2>
        <DataTable
          columns={columns}
          rows={recent}
          getRowId={(r) => r.id}
          loading={pLoading}
          empty={
            <EmptyState
              icon={GitBranch}
              title="No pipelines yet"
              body="Create your first visual ETL pipeline to see it here."
              action={
                <Button asChild variant="default" size="sm">
                  <Link to="/pipelines/new">New Pipeline</Link>
                </Button>
              }
            />
          }
        />
      </section>

      <section className="mt-8 rounded-md border border-border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Quick Start</h2>
        <ol className="space-y-3">
          {[
            { to: "/connectors", label: "Add a database connector", icon: Plug },
            { to: "/catalog", label: "Browse your table catalog", icon: CheckCircle2 },
            { to: "/pipelines/new", label: "Create a pipeline with drag & drop", icon: GitBranch },
            { to: "/cdc", label: "Set up CDC to stream changes to S3", icon: RefreshCw },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={step.to} className="flex items-center gap-3 border-l-2 border-primary pl-3">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
                <Link to={step.to} className="text-sm text-foreground hover:underline">
                  {step.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
