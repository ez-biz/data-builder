import { useMemo, useState } from "react";
import { Plus, MoreHorizontal, CloudUpload, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { useConnectors } from "@/api/connectors";
import { useSchemas, useTables, useColumns } from "@/api/catalog";
import {
  useCDCJobs,
  useCreateCDCJob,
  useDeleteCDCJob,
  useTriggerSync,
  useTriggerSnapshot,
  useSyncLogs,
} from "@/api/cdc";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Database } from "lucide-react";
import type { CDCJob } from "@/types/cdc";
import { CDCDetailDrawer } from "@/components/cdc/CDCDetailDrawer";

export function CDCPage() {
  useDocumentTitle("CDC Streams — Data Builder");
  const { data: jobs, isLoading, error } = useCDCJobs();
  const { data: connectors } = useConnectors();
  const { toast } = useToast();

  const syncMutation = useTriggerSync();
  const snapshotMutation = useTriggerSnapshot();
  const deleteMutation = useDeleteCDCJob();

  const [formOpen, setFormOpen] = useState(false);
  const [logsJobId, setLogsJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<CDCJob | null>(null);

  const connectorNameById = useMemo(() => {
    const map = new Map<string, string>();
    (connectors ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [connectors]);

  const handleSync = (job: CDCJob) => {
    syncMutation.mutate(job.id, {
      onSuccess: () => toast("Sync started", "success"),
      onError: () => toast("Sync failed", "error"),
    });
  };

  const handleSnapshot = (job: CDCJob) => {
    snapshotMutation.mutate(job.id, {
      onSuccess: () => toast("Snapshot started", "success"),
      onError: () => toast("Snapshot failed", "error"),
    });
  };

  const handleDelete = (job: CDCJob) => {
    if (!window.confirm(`Delete CDC job "${job.name}"? This cannot be undone.`))
      return;
    deleteMutation.mutate(job.id, {
      onSuccess: () => {
        toast("CDC job deleted", "success");
        if (logsJobId === job.id) setLogsJobId(null);
      },
      onError: () => toast("Delete failed", "error"),
    });
  };

  const handleEdit = () => {
    // T6.3 will introduce the detail drawer which includes edit.
    toast("Edit not implemented yet", "error");
  };

  const columns: DataTableColumn<CDCJob>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <span className="font-medium text-foreground">{r.name}</span>
      ),
      sortable: true,
    },
    {
      key: "connector",
      header: "Connector",
      cell: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {connectorNameById.get(r.connector_id) ?? r.connector_id.slice(0, 8)}
        </span>
      ),
      width: "w-40",
    },
    {
      key: "source",
      header: "Source",
      cell: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {r.source_schema}.{r.source_table}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant="outline">
          {r.status === "running" && (
            <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
          )}
          {r.status}
        </Badge>
      ),
      width: "w-32",
    },
    {
      key: "last_sync_at",
      header: "Last sync",
      cell: (r) =>
        r.last_sync_at ? (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {new Date(r.last_sync_at).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      width: "w-32",
      sortable: true,
    },
    {
      key: "total_rows_synced",
      header: "Rows synced",
      cell: (r) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {r.total_rows_synced.toLocaleString()}
        </span>
      ),
      width: "w-32",
      align: "right",
      sortable: true,
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => handleSync(r)}
                disabled={syncMutation.isPending || r.status === "running"}
              >
                Sync now
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleSnapshot(r)}
                disabled={snapshotMutation.isPending || r.status === "running"}
              >
                Snapshot
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setLogsJobId((prev) => (prev === r.id ? null : r.id))
                }
              >
                {logsJobId === r.id ? "Hide logs" : "View logs"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleDelete(r)}
                className="text-[var(--color-status-error)]"
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
      width: "w-16",
      align: "right",
    },
  ];

  return (
    <>
      <PageHeader
        title="CDC Streams"
        description="Capture database changes and stream them to S3."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add CDC Job
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={jobs}
        getRowId={(r) => r.id}
        onRowClick={setSelectedJob}
        loading={isLoading}
        error={error ? String(error) : null}
        empty={
          <EmptyState
            icon={CloudUpload}
            title="No CDC jobs yet"
            body="Set up change data capture to stream table changes to S3."
            action={
              <Button onClick={() => setFormOpen(true)} size="sm">
                <Plus className="h-3.5 w-3.5" /> Add CDC Job
              </Button>
            }
          />
        }
      />

      {logsJobId && (
        <div className="mt-6">
          <SyncLogPanel jobId={logsJobId} />
        </div>
      )}

      <CDCJobForm open={formOpen} onOpenChange={setFormOpen} />

      <CDCDetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
    </>
  );
}

function SyncLogPanel({ jobId }: { jobId: string }) {
  const { data: logs } = useSyncLogs(jobId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sync History</CardTitle>
      </CardHeader>
      <CardContent>
        {!logs || logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No syncs yet</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      log.status === "completed"
                        ? "success"
                        : log.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {log.status}
                  </Badge>
                  <span className="tabular-nums">
                    {log.rows_captured.toLocaleString()} rows
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {log.s3_path && (
                    <span className="max-w-[200px] truncate font-mono text-[10px]">
                      {log.s3_path}
                    </span>
                  )}
                  {log.started_at && log.finished_at && (
                    <span className="tabular-nums">
                      {(
                        (new Date(log.finished_at).getTime() -
                          new Date(log.started_at).getTime()) /
                        1000
                      ).toFixed(1)}
                      s
                    </span>
                  )}
                  <span className="tabular-nums">
                    {new Intl.DateTimeFormat(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(log.created_at))}
                  </span>
                </div>
                {log.error_message && (
                  <span className="text-xs text-[var(--color-status-error)]">
                    {log.error_message}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CDCJobForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: connectors } = useConnectors();
  const createMutation = useCreateCDCJob();

  const [name, setName] = useState("");
  const [connectorId, setConnectorId] = useState("");
  const [schema, setSchema] = useState("");
  const [table, setTable] = useState("");
  const [trackingColumn, setTrackingColumn] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Prefix, setS3Prefix] = useState("cdc/");
  const [s3Region, setS3Region] = useState("us-east-1");
  const [outputFormat, setOutputFormat] = useState<"jsonl" | "csv">("jsonl");
  const [syncInterval, setSyncInterval] = useState(300);

  const { data: schemasData } = useSchemas(connectorId || "");
  const { data: tablesData } = useTables(
    connectorId && schema ? connectorId : "",
    schema || "",
  );
  const { data: columnsData } = useColumns(
    connectorId && schema && table ? connectorId : "",
    schema || "",
    table || "",
  );

  const resetForm = () => {
    setName("");
    setConnectorId("");
    setSchema("");
    setTable("");
    setTrackingColumn("");
    setS3Bucket("");
    setS3Prefix("cdc/");
    setS3Region("us-east-1");
    setOutputFormat("jsonl");
    setSyncInterval(300);
  };

  const handleSubmit = () => {
    createMutation.mutate(
      {
        name,
        connector_id: connectorId,
        source_schema: schema,
        source_table: table,
        tracking_column: trackingColumn,
        s3_bucket: s3Bucket,
        s3_prefix: s3Prefix,
        s3_region: s3Region,
        output_format: outputFormat,
        sync_interval_seconds: syncInterval,
      },
      {
        onSuccess: () => {
          toast("CDC job created", "success");
          resetForm();
          onOpenChange(false);
        },
        onError: () => toast("Failed to create CDC job", "error"),
      },
    );
  };

  const canSubmit =
    name && connectorId && schema && table && trackingColumn && s3Bucket;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New CDC Job</DialogTitle>
          <DialogDescription>
            Set up change data capture to stream table changes to S3.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Job Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. users-to-s3"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Source Connector</label>
            <Select
              value={connectorId}
              onValueChange={(v) => {
                setConnectorId(v);
                setSchema("");
                setTable("");
                setTrackingColumn("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select connector" />
              </SelectTrigger>
              <SelectContent>
                {connectors?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <Database className="h-3 w-3" />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {connectorId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Schema</label>
                <Select
                  value={schema}
                  onValueChange={(v) => {
                    setSchema(v);
                    setTable("");
                    setTrackingColumn("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Schema" />
                  </SelectTrigger>
                  <SelectContent>
                    {schemasData?.schemas.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Table</label>
                <Select
                  value={table}
                  onValueChange={(v) => {
                    setTable(v);
                    setTrackingColumn("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Table" />
                  </SelectTrigger>
                  <SelectContent>
                    {tablesData?.tables.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {table && (
            <div>
              <label className="text-sm font-medium">Tracking Column</label>
              <p className="text-xs text-muted-foreground mb-1">
                Column used to detect changes (e.g. updated_at, id)
              </p>
              <Select value={trackingColumn} onValueChange={setTrackingColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column" />
                </SelectTrigger>
                <SelectContent>
                  {columnsData?.columns.map((col) => (
                    <SelectItem key={col.name} value={col.name}>
                      <span className="flex items-center gap-2">
                        {col.name}
                        <span className="text-[10px] text-muted-foreground">
                          {col.data_type}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">S3 Destination</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Bucket
                  </label>
                  <Input
                    value={s3Bucket}
                    onChange={(e) => setS3Bucket(e.target.value)}
                    placeholder="my-data-lake"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Region
                  </label>
                  <Input
                    value={s3Region}
                    onChange={(e) => setS3Region(e.target.value)}
                    placeholder="us-east-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Prefix</label>
                <Input
                  value={s3Prefix}
                  onChange={(e) => setS3Prefix(e.target.value)}
                  placeholder="cdc/"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    Format
                  </label>
                  <Select
                    value={outputFormat}
                    onValueChange={(v) =>
                      setOutputFormat(v as "jsonl" | "csv")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jsonl">JSONL</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Sync Interval (sec)
                  </label>
                  <Input
                    type="number"
                    min={60}
                    value={syncInterval}
                    onChange={(e) => setSyncInterval(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create CDC Job
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
