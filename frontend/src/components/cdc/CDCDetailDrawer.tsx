import { X, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { useSyncLogs, useTriggerSync, useTriggerSnapshot } from "@/api/cdc";
import type { CDCJob, CDCSyncLog } from "@/types/cdc";

export function CDCDetailDrawer({
  job,
  onClose,
}: {
  job: CDCJob | null;
  onClose: () => void;
}) {
  const { data: logs, isLoading } = useSyncLogs(job?.id);
  const sync = useTriggerSync();
  const snap = useTriggerSnapshot();

  if (!job) return null;

  const columns: DataTableColumn<CDCSyncLog>[] = [
    {
      key: "created_at",
      header: "Started",
      cell: (l) => (
        <span className="font-mono text-[12px] tabular-nums">
          {new Date(l.created_at).toLocaleString()}
        </span>
      ),
      width: "w-48",
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => <Badge variant="outline">{l.status}</Badge>,
      width: "w-28",
    },
    {
      key: "rows_captured",
      header: "Rows",
      cell: (l) => (
        <span className="font-mono tabular-nums">{l.rows_captured ?? 0}</span>
      ),
      width: "w-24",
      align: "right",
    },
    {
      key: "error_message",
      header: "Error",
      cell: (l) =>
        l.error_message ? (
          <span className="truncate text-[12px] text-[var(--color-status-error)]">
            {l.error_message}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`${job.name} details`}
        className="fixed right-0 top-0 z-40 flex h-full w-[520px] flex-col border-l border-border bg-background shadow-lg"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{job.name}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {job.source_schema}.{job.source_table}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex gap-2 border-b border-border px-5 py-3">
          <Button size="sm" onClick={() => sync.mutate(job.id)} disabled={sync.isPending}>
            <RefreshCw className="h-3 w-3" /> Sync now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => snap.mutate(job.id)}
            disabled={snap.isPending}
          >
            <Zap className="h-3 w-3" /> Snapshot
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sync logs
          </h3>
          <DataTable
            columns={columns}
            rows={logs}
            getRowId={(l) => l.id}
            loading={isLoading}
            empty={<EmptyState title="No syncs yet" body="Trigger a sync to see logs here." />}
          />
        </div>
      </aside>
    </>
  );
}
