import { useState } from "react";
import {
  Download,
  Send,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  useMonitoringStats,
  useExportLogs,
  useExportToWebhook,
  useTestWebhook,
} from "@/api/monitoring";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useToast } from "@/components/ui/toast";

export function MonitoringPage() {
  useDocumentTitle("Monitoring");
  const { data: stats, isLoading } = useMonitoringStats();
  const exportMutation = useExportLogs();
  const webhookMutation = useExportToWebhook();
  const testWebhookMutation = useTestWebhook();
  const { toast } = useToast();

  const [exportDays, setExportDays] = useState(30);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const handleExport = (format: "json" | "csv") => {
    exportMutation.mutate(
      {
        format,
        days: exportDays,
        include_pipeline_runs: true,
        include_cdc_logs: true,
      },
      {
        onSuccess: ({ blob, format: fmt }) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `data-builder-logs.${fmt}`;
          a.click();
          URL.revokeObjectURL(url);
          toast("Logs exported", "success");
        },
      },
    );
  };

  const handleWebhookExport = () => {
    if (!webhookUrl) return;
    webhookMutation.mutate(
      {
        url: webhookUrl,
        secret: webhookSecret || undefined,
        days: exportDays,
        include_pipeline_runs: true,
        include_cdc_logs: true,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast("Logs pushed to webhook", "success");
          } else {
            toast(`Webhook failed: ${result.error}`, "error");
          }
        },
      },
    );
  };

  const handleTestWebhook = () => {
    if (!webhookUrl) return;
    testWebhookMutation.mutate(
      { url: webhookUrl, secret: webhookSecret || undefined },
      {
        onSuccess: (result) => {
          if (result.success) {
            toast("Test ping sent", "success");
          } else {
            toast(`Test failed: ${result.error}`, "error");
          }
        },
      },
    );
  };

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { pipeline_stats: ps, cdc_stats: cs, daily_runs: daily } = stats;

  // Simple bar chart using divs
  const maxTotal = Math.max(...daily.map((d) => d.total), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring"
        description="Pipeline runs, CDC sync status, and log export."
      />

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Runs"
          value={ps.total_runs}
          hint="Last 30 days"
        />
        <StatCard
          label="Success Rate"
          value={`${ps.success_rate}%`}
          hint={`${ps.completed} completed, ${ps.failed} failed`}
        />
        <StatCard
          label="Avg Duration"
          value={
            ps.avg_duration_seconds != null
              ? `${ps.avg_duration_seconds.toFixed(1)}s`
              : "N/A"
          }
          hint="Per pipeline run"
        />
        <StatCard
          label="CDC Rows Synced"
          value={cs.total_rows_synced.toLocaleString()}
          hint={`${cs.total_jobs} jobs (${cs.running} running, ${cs.failed} failed)`}
        />
      </div>

      {/* Run activity chart + status breakdown */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Run Activity (Last 30 Days)</h3>
            {daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">No run data yet.</p>
            ) : (
              <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
                {daily.map((d) => {
                  const completedH = (d.completed / maxTotal) * 140;
                  const failedH = (d.failed / maxTotal) * 140;
                  return (
                    <div
                      key={d.date}
                      className="group relative flex-1"
                      style={{ height: 160 }}
                    >
                      <div className="absolute bottom-0 flex w-full flex-col items-center">
                        {failedH > 0 && (
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: failedH,
                              backgroundColor: "var(--color-status-error)",
                            }}
                          />
                        )}
                        {completedH > 0 && (
                          <div
                            className="w-full"
                            style={{
                              height: completedH,
                              backgroundColor: "var(--color-status-success)",
                              borderRadius: failedH > 0 ? 0 : "4px 4px 0 0",
                            }}
                          />
                        )}
                      </div>
                      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-[10px] shadow group-hover:block">
                        {d.date}: {d.completed} ok, {d.failed} fail
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div
              className="mt-2 flex items-center gap-4 text-xs"
              style={{ color: "#6b7280" }}
            >
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: "var(--color-status-success)" }}
                />
                Completed
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: "var(--color-status-error)" }}
                />
                Failed
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Status Breakdown</h3>
            <div className="space-y-3">
              <StatusRow label="Running" count={ps.running} color="bg-blue-500" />
              <StatusRow label="Pending" count={ps.pending} color="bg-yellow-500" />
              <StatusRow
                label="Completed"
                count={ps.completed}
                style={{ backgroundColor: "var(--color-status-success)" }}
              />
              <StatusRow
                label="Failed"
                count={ps.failed}
                style={{ backgroundColor: "var(--color-status-error)" }}
              />
              <StatusRow label="Cancelled" count={ps.cancelled} color="bg-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CDC Jobs summary */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">CDC Jobs</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatusRow label="Idle" count={cs.idle} color="bg-gray-400" />
            <StatusRow label="Running" count={cs.running} color="bg-blue-500" />
            <StatusRow
              label="Failed"
              count={cs.failed}
              style={{ backgroundColor: "var(--color-status-error)" }}
            />
            <StatusRow label="Paused" count={cs.paused} color="bg-yellow-500" />
          </div>
        </CardContent>
      </Card>

      {/* Log Export */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Log Export</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="export-days"
                className="text-xs text-muted-foreground whitespace-nowrap"
              >
                Last
              </label>
              <Input
                id="export-days"
                type="number"
                min={1}
                max={365}
                value={exportDays}
                onChange={(e) => setExportDays(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("json")}
                disabled={exportMutation.isPending}
              >
                <Download className="mr-1 h-3 w-3" />
                Export JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleExport("csv")}
                disabled={exportMutation.isPending}
              >
                <Download className="mr-1 h-3 w-3" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Push to External Service */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Push to External Service</h3>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Send logs to Slack, Datadog, PagerDuty, or any webhook endpoint.
            </p>
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <Input
              placeholder="Webhook secret (optional)"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleWebhookExport}
                disabled={!webhookUrl || webhookMutation.isPending}
              >
                {webhookMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Send className="mr-1 h-3 w-3" />
                )}
                Push Logs
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestWebhook}
                disabled={!webhookUrl || testWebhookMutation.isPending}
              >
                {testWebhookMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                Test
              </Button>
            </div>
            {webhookMutation.data && (
              <Badge
                variant={webhookMutation.data.success ? "default" : "destructive"}
              >
                {webhookMutation.data.success
                  ? "Sent successfully"
                  : `Failed: ${webhookMutation.data.error}`}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  label,
  count,
  color,
  style,
}: {
  label: string;
  count: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${color ?? ""}`}
          style={style}
        />
        {label}
      </div>
      <span className="font-medium tabular-nums">{count}</span>
    </div>
  );
}
