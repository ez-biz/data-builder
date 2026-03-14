import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "./client";

export interface RunStats {
  total_runs: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  pending: number;
  success_rate: number;
  avg_duration_seconds: number | null;
}

export interface DailyRunStat {
  date: string;
  completed: number;
  failed: number;
  total: number;
}

export interface CDCStats {
  total_jobs: number;
  idle: number;
  running: number;
  failed: number;
  paused: number;
  total_rows_synced: number;
}

export interface SystemStats {
  pipeline_stats: RunStats;
  cdc_stats: CDCStats;
  daily_runs: DailyRunStat[];
}

export function useMonitoringStats(days = 30) {
  return useQuery({
    queryKey: ["monitoring-stats", days],
    queryFn: async () => {
      const { data } = await api.get<SystemStats>(`/monitoring/stats?days=${days}`);
      return data;
    },
    refetchInterval: 10000,
  });
}

export function useExportLogs() {
  return useMutation({
    mutationFn: async (params: {
      format: "json" | "csv";
      days: number;
      include_pipeline_runs: boolean;
      include_cdc_logs: boolean;
    }) => {
      const { data } = await api.post("/monitoring/export", params, {
        responseType: "blob",
      });
      return { blob: data, format: params.format };
    },
  });
}

export function useExportToWebhook() {
  return useMutation({
    mutationFn: async (params: {
      url: string;
      secret?: string;
      days: number;
      include_pipeline_runs: boolean;
      include_cdc_logs: boolean;
    }) => {
      const { data } = await api.post("/monitoring/export/webhook", params);
      return data as { success: boolean; url: string; error?: string };
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: async (params: { url: string; secret?: string }) => {
      const { data } = await api.post("/monitoring/webhook/test", params);
      return data as { success: boolean; url: string; error?: string };
    },
  });
}
