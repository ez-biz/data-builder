import { useState } from "react";
import {
  Plus,
  Trash2,
  Download,
  Loader2,
  RefreshCw,
  Database,
  CloudUpload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import type { CDCJob, CDCStatus } from "@/types/cdc";

export function CDCPage() {
  useDocumentTitle("CDC Streams");
  const { data: jobs, isLoading } = useCDCJobs();
  const [formOpen, setFormOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">CDC Streams</h2>
          <p className="text-muted-foreground">
            Capture database changes and stream them to S3.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New CDC Job
        </Button>
      </div>

      {jobs && jobs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CloudUpload className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No CDC jobs yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Set up change data capture to stream table changes to S3.
            </p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create CDC Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs?.map((job) => (
            <CDCJobCard
              key={job.id}
              job={job}
              isSelected={selectedJobId === job.id}
              onSelect={() =>
                setSelectedJobId(selectedJobId === job.id ? null : job.id)
              }
            />
          ))}
        </div>
      )}

      {selectedJobId && <SyncLogPanel jobId={selectedJobId} />}

      <CDCJobForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}

function CDCJobCard({
  job,
  isSelected,
  onSelect,
}: {
  job: CDCJob;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { toast } = useToast();
  const syncMutation = useTriggerSync();
  const snapshotMutation = useTriggerSnapshot();
  const deleteMutation = useDeleteCDCJob();

  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{job.name}</CardTitle>
        <CDCStatusBadge status={job.status} />
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-sm">
          <p className="font-mono text-xs text-muted-foreground">
            {job.source_schema}.{job.source_table}
          </p>
          <p className="text-xs text-muted-foreground">
            Tracking: <span className="font-mono">{job.tracking_column}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            → s3://{job.s3_bucket}/{job.s3_prefix}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs tabular-nums">
              {job.total_rows_synced.toLocaleString()} rows synced
            </span>
            {job.last_sync_at && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Last:{" "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(job.last_sync_at))}
              </span>
            )}
          </div>
          {job.error_message && (
            <p className="text-xs text-red-600 line-clamp-1">
              {job.error_message}
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              syncMutation.mutate(job.id, {
                onSuccess: () => toast("Sync started", "success"),
                onError: () => toast("Sync failed", "error"),
              })
            }
            disabled={syncMutation.isPending || job.status === "running"}
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3 w-3" />
            )}
            Sync
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              snapshotMutation.mutate(job.id, {
                onSuccess: () => toast("Snapshot started", "success"),
                onError: () => toast("Snapshot failed", "error"),
              })
            }
            disabled={snapshotMutation.isPending || job.status === "running"}
          >
            <Download className="mr-1 h-3 w-3" />
            Snapshot
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto text-destructive"
            onClick={() => {
              if (
                !window.confirm(
                  `Delete CDC job "${job.name}"? This cannot be undone.`,
                )
              )
                return;
              deleteMutation.mutate(job.id, {
                onSuccess: () => toast("CDC job deleted", "success"),
                onError: () => toast("Delete failed", "error"),
              });
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CDCStatusBadge({ status }: { status: CDCStatus }) {
  const styles: Record<CDCStatus, string> = {
    idle: "bg-gray-100 text-gray-800",
    running: "bg-blue-100 text-blue-800",
    paused: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {status === "running" && (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      {status}
    </span>
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
                  <span className="text-xs text-red-600">{log.error_message}</span>
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
                <label className="text-xs text-muted-foreground">
                  Prefix
                </label>
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
