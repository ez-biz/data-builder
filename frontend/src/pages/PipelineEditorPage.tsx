import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import {
  Save,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Play,
  History,
  X,
  Clock,
  RotateCcw,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PipelineCanvas } from "@/components/pipeline/PipelineCanvas";
import { PipelineToolbar } from "@/components/pipeline/PipelineToolbar";
import { NodeConfigPanel } from "@/components/pipeline/NodeConfigPanel";
import { CatalogSidebar } from "@/components/pipeline/CatalogSidebar";
import { usePipelineStore } from "@/stores/pipeline-store";
import {
  usePipeline,
  useCreatePipeline,
  useSavePipeline,
  useValidatePipeline,
  useRunPipeline,
  usePipelineRuns,
  useRetryRun,
  useCancelRun,
} from "@/api/pipelines";
import { useToast } from "@/components/ui/toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { RunStatus } from "@/types/pipeline";

export function PipelineEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipelineData } = usePipeline(id);
  const createMutation = useCreatePipeline();
  const saveMutation = useSavePipeline();
  const validateMutation = useValidatePipeline();
  const runMutation = useRunPipeline();
  const { data: runs } = usePipelineRuns(id);
  const retryMutation = useRetryRun();
  const cancelMutation = useCancelRun();
  const { toast } = useToast();
  const [showRuns, setShowRuns] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [cronValue, setCronValue] = useState("");

  const pipelineId = usePipelineStore((s) => s.pipelineId);
  const pipelineName = usePipelineStore((s) => s.pipelineName);
  const isDirty = usePipelineStore((s) => s.isDirty);
  const selectedNodeId = usePipelineStore((s) => s.selectedNodeId);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);
  const serialize = usePipelineStore((s) => s.serialize);
  const markClean = usePipelineStore((s) => s.markClean);
  const reset = usePipelineStore((s) => s.reset);

  useDocumentTitle(pipelineName || "Pipeline Editor");

  const initialized = useRef(false);

  // Load pipeline or create new
  useEffect(() => {
    if (id && pipelineData && !initialized.current) {
      loadPipeline(pipelineData.id, pipelineData.name, pipelineData.definition);
      setCronValue(pipelineData.schedule_cron || "");
      initialized.current = true;
    } else if (!id && !initialized.current) {
      reset();
      initialized.current = true;
    }
  }, [id, pipelineData, loadPipeline, reset]);

  // Reset on unmount
  useEffect(() => {
    return () => {
      initialized.current = false;
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!pipelineId) {
      // Create new pipeline
      const newPipeline = await createMutation.mutateAsync({
        name: pipelineName || "Untitled Pipeline",
      });
      loadPipeline(newPipeline.id, newPipeline.name, newPipeline.definition);
      // Now save the definition
      await saveMutation.mutateAsync({
        id: newPipeline.id,
        definition: serialize(),
      });
      markClean();
      navigate(`/pipelines/${newPipeline.id}`, { replace: true });
    } else {
      await saveMutation.mutateAsync({
        id: pipelineId,
        name: pipelineName,
        definition: serialize(),
      });
      markClean();
    }
  }, [
    pipelineId,
    pipelineName,
    serialize,
    markClean,
    saveMutation,
    createMutation,
    loadPipeline,
    navigate,
  ]);

  const handleValidate = useCallback(async () => {
    if (!pipelineId) return;
    // Save first, then validate
    await handleSave();
    validateMutation.mutate(pipelineId);
  }, [pipelineId, handleSave, validateMutation]);

  const handleRun = useCallback(async () => {
    if (!pipelineId) return;
    await handleSave();
    runMutation.mutate(pipelineId, {
      onSuccess: () => {
        toast("Pipeline run started", "success");
        setShowRuns(true);
      },
      onError: () => toast("Failed to start run", "error"),
    });
  }, [pipelineId, handleSave, runMutation, toast]);

  const handleSaveSchedule = useCallback(async () => {
    if (!pipelineId) return;
    await saveMutation.mutateAsync({
      id: pipelineId,
      schedule_cron: cronValue || undefined,
    });
    toast(cronValue ? "Schedule saved" : "Schedule removed", "success");
    setShowSchedule(false);
  }, [pipelineId, cronValue, saveMutation, toast]);

  const handleRetry = useCallback(
    (runId: string) => {
      if (!pipelineId) return;
      retryMutation.mutate(
        { pipelineId, runId },
        {
          onSuccess: () => toast("Retry started", "success"),
          onError: () => toast("Failed to retry", "error"),
        },
      );
    },
    [pipelineId, retryMutation, toast],
  );

  const handleCancel = useCallback(
    (runId: string) => {
      if (!pipelineId) return;
      cancelMutation.mutate(
        { pipelineId, runId },
        {
          onSuccess: () => toast("Run cancelled", "success"),
          onError: () => toast("Failed to cancel", "error"),
        },
      );
    },
    [pipelineId, cancelMutation, toast],
  );

  // Debounced auto-save
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (isDirty && pipelineId) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        saveMutation.mutate({
          id: pipelineId,
          definition: serialize(),
        });
        markClean();
      }, 3000);
    }
    return () => clearTimeout(autoSaveTimer.current);
  }, [isDirty, pipelineId, serialize, markClean, saveMutation]);

  const updateName = usePipelineStore((s) => s.loadPipeline);

  return (
    <ReactFlowProvider>
      <div className="flex h-screen flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b bg-white px-4 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Back to pipelines">
              <Link to="/pipelines">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Input
              className="h-8 w-64 border-0 bg-transparent text-base font-semibold focus-visible:ring-0"
              value={pipelineName}
              onChange={(e) => {
                if (pipelineId) {
                  updateName(pipelineId, e.target.value, serialize());
                }
              }}
              placeholder="Pipeline name"
            />
            {isDirty && (
              <Badge variant="outline" className="text-[10px]">
                Unsaved
              </Badge>
            )}
            {saveMutation.isPending && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleValidate}
              disabled={!pipelineId || validateMutation.isPending}
            >
              {validateMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              )}
              Validate
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
              disabled={!pipelineId || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSchedule((s) => !s)}
              disabled={!pipelineId}
            >
              <Clock className="mr-1 h-3 w-3" />
              Schedule
              {pipelineData?.schedule_cron && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-status-success)]" />
              )}
            </Button>

            <div className="mx-1 h-4 w-px bg-border" />

            <Button
              size="sm"
              variant="default"
              onClick={handleRun}
              disabled={
                !pipelineId ||
                runMutation.isPending ||
                (validateMutation.data && !validateMutation.data.valid)
              }
              title={
                validateMutation.data && !validateMutation.data.valid
                  ? "Fix validation errors before running"
                  : undefined
              }
            >
              {runMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Play className="mr-1 h-3 w-3" />
              )}
              Run
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowRuns((s) => !s)}
              disabled={!pipelineId}
            >
              <History className="mr-1 h-3 w-3" />
              Runs
              {runs && runs.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {runs.length}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Validation results */}
        <div className="min-h-[40px]">
          {validateMutation.data && !validateMutation.data.valid && (
            <div
              role="alert"
              className="flex items-start gap-2 border-b border-[var(--color-status-error)]/30 bg-[var(--color-status-error-faint)] px-4 py-2 text-[12px] text-[var(--color-status-error)]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Validation errors</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {validateMutation.data.errors.map((err, i) => (
                    <li key={i}>
                      {err.node_id && (
                        <span className="font-mono">[{err.node_id}] </span>
                      )}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => validateMutation.reset()}
                aria-label="Dismiss"
                className="rounded p-0.5 hover:bg-[var(--color-status-error)]/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="border-b bg-white px-4 py-2">
          <PipelineToolbar />
        </div>

        {/* Main canvas area */}
        <div className="flex flex-1 overflow-hidden">
          <CatalogSidebar />
          <PipelineCanvas />
          {selectedNodeId && <NodeConfigPanel />}
          {showSchedule && (
            <div className="w-72 border-l bg-white">
              <div className="flex items-center justify-between border-b p-3">
                <h3 className="text-sm font-semibold">Schedule</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowSchedule(false)} className="h-6 w-6">
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <label htmlFor="cron-input" className="text-xs font-medium text-muted-foreground">
                    Cron Expression
                  </label>
                  <Input
                    id="cron-input"
                    className="mt-1"
                    placeholder="*/30 * * * *"
                    value={cronValue}
                    onChange={(e) => setCronValue(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Examples: <code>*/30 * * * *</code> (every 30 min),{" "}
                    <code>0 */6 * * *</code> (every 6 hours),{" "}
                    <code>0 0 * * *</code> (daily midnight)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveSchedule}>
                    Save
                  </Button>
                  {cronValue && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCronValue("");
                        handleSaveSchedule();
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
          {showRuns && (
            <div className="w-80 border-l bg-white">
              <div className="flex items-center justify-between border-b p-3">
                <h3 className="text-sm font-semibold">Run History</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowRuns(false)} className="h-6 w-6">
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="overflow-auto p-2" style={{ maxHeight: "calc(100% - 3rem)" }}>
                {!runs || runs.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">
                    No runs yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className="rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <RunStatusBadge status={run.status} />
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {run.created_at
                              ? new Intl.DateTimeFormat(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(run.created_at))
                              : ""}
                          </span>
                        </div>
                        {run.rows_processed != null && (
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {run.rows_processed.toLocaleString()} rows processed
                          </p>
                        )}
                        {run.error_message && (
                          <p className="mt-1 text-xs text-red-600 line-clamp-2">
                            {run.error_message}
                          </p>
                        )}
                        {run.started_at && run.finished_at && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                            Duration:{" "}
                            {((new Date(run.finished_at).getTime() -
                              new Date(run.started_at).getTime()) /
                              1000).toFixed(1)}s
                          </p>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            via {run.triggered_by}
                          </span>
                          {(run.status === "failed" || run.status === "cancelled") && (
                            <button
                              type="button"
                              onClick={() => handleRetry(run.id)}
                              disabled={retryMutation.isPending}
                              className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline disabled:opacity-50"
                            >
                              <RotateCcw className="h-2.5 w-2.5" />
                              Retry
                            </button>
                          )}
                          {(run.status === "pending" || run.status === "running") && (
                            <button
                              type="button"
                              onClick={() => handleCancel(run.id)}
                              disabled={cancelMutation.isPending}
                              className="inline-flex items-center gap-0.5 text-[10px] text-red-600 hover:underline disabled:opacity-50"
                            >
                              <Ban className="h-2.5 w-2.5" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const styles: Record<RunStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-800",
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
