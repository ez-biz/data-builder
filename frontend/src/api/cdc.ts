import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { CDCJob, CDCJobCreate, CDCSyncLog } from "../types/cdc";

export function useCDCJobs() {
  return useQuery({
    queryKey: ["cdc-jobs"],
    queryFn: async () => {
      const { data } = await api.get<CDCJob[]>("/cdc/jobs");
      return data;
    },
  });
}

export function useCDCJob(id: string | undefined) {
  return useQuery({
    queryKey: ["cdc-jobs", id],
    queryFn: async () => {
      const { data } = await api.get<CDCJob>(`/cdc/jobs/${id}`);
      return data;
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data;
      return job?.status === "running" ? 2000 : false;
    },
  });
}

export function useCreateCDCJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CDCJobCreate) => {
      const { data } = await api.post<CDCJob>("/cdc/jobs", payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cdc-jobs"] }),
  });
}

export function useUpdateCDCJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<CDCJobCreate> & { id: string }) => {
      const { data } = await api.put<CDCJob>(`/cdc/jobs/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cdc-jobs"] }),
  });
}

export function useDeleteCDCJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cdc/jobs/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cdc-jobs"] }),
  });
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post<CDCSyncLog>(`/cdc/jobs/${jobId}/sync`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cdc-jobs"] });
      qc.invalidateQueries({ queryKey: ["cdc-sync-logs"] });
    },
  });
}

export function useTriggerSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data } = await api.post<CDCSyncLog>(
        `/cdc/jobs/${jobId}/snapshot`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cdc-jobs"] });
      qc.invalidateQueries({ queryKey: ["cdc-sync-logs"] });
    },
  });
}

export function useSyncLogs(jobId: string | undefined) {
  return useQuery({
    queryKey: ["cdc-sync-logs", jobId],
    queryFn: async () => {
      const { data } = await api.get<CDCSyncLog[]>(`/cdc/jobs/${jobId}/logs`);
      return data;
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const logs = query.state.data;
      const hasRunning = logs?.some((l) => l.status === "running");
      return hasRunning ? 2000 : false;
    },
  });
}
