import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, MoreHorizontal, GitBranch } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { usePipelines, useDeletePipeline } from "@/api/pipelines";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/components/ui/toast";
import type { PipelineListItem } from "@/types/pipeline";

const STATUS_OPTIONS = [
  "all",
  "draft",
  "valid",
  "invalid",
  "running",
  "completed",
  "failed",
] as const;

type PipelineRow = PipelineListItem & {
  definition?: { nodes?: unknown[] } | null;
};

export function PipelineListPage() {
  useDocumentTitle("Pipelines");
  const { data: pipelines, isLoading, error } = usePipelines();
  const deleteMutation = useDeletePipeline();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = ((pipelines ?? []) as PipelineRow[]).filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const handleDelete = (p: PipelineRow) => {
    if (!window.confirm(`Delete pipeline "${p.name}"? This cannot be undone.`))
      return;
    deleteMutation.mutate(p.id, {
      onSuccess: () => toast("Pipeline deleted", "success"),
      onError: () => toast("Failed to delete pipeline", "error"),
    });
  };

  const columns: DataTableColumn<PipelineRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <Link
          to={`/pipelines/${r.id}`}
          className="font-medium text-foreground hover:underline"
        >
          {r.name}
        </Link>
      ),
      sortable: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <Badge variant="outline">{r.status}</Badge>,
      width: "w-32",
    },
    {
      key: "nodes",
      header: "Nodes",
      cell: (r) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {r.definition?.nodes?.length ?? 0}
        </span>
      ),
      width: "w-20",
      align: "right",
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
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/pipelines/${r.id}`}>Open</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleDelete(r)}
              className="text-[var(--color-status-error)]"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      width: "w-16",
      align: "right",
    },
  ];

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Create and manage your ETL pipelines."
        actions={
          <Button asChild variant="default">
            <Link to="/pipelines/new">
              <Plus className="h-3.5 w-3.5" /> New Pipeline
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pipelines…"
          className="h-9 max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        loading={isLoading}
        error={error ? String(error) : null}
        empty={
          (pipelines?.length ?? 0) === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="No pipelines yet"
              body="Create your first visual ETL pipeline to get started."
              action={
                <Button asChild variant="default" size="sm">
                  <Link to="/pipelines/new">New Pipeline</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={GitBranch}
              title="No pipelines match your filters"
              body="Try a different filter or search term."
            />
          )
        }
      />
    </>
  );
}
