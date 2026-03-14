import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Pipeline,
  PipelineListItem,
  PipelineRun,
  PipelineRunListItem,
  PipelineValidationResult,
  PipelineDefinition,
} from "../types/pipeline";

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const { data } = await api.get<PipelineListItem[]>("/pipelines");
      return data;
    },
  });
}

export function usePipeline(id: string | undefined) {
  return useQuery({
    queryKey: ["pipelines", id],
    queryFn: async () => {
      const { data } = await api.get<Pipeline>(`/pipelines/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const { data } = await api.post<Pipeline>("/pipelines", payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useSavePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      description?: string;
      definition?: PipelineDefinition;
      schedule_cron?: string;
    }) => {
      const { data } = await api.put<Pipeline>(`/pipelines/${id}`, payload);
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["pipelines", variables.id] });
    },
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pipelines/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}

export function useValidatePipeline() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<PipelineValidationResult>(
        `/pipelines/${id}/validate`,
      );
      return data;
    },
  });
}

export function useRunPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<PipelineRun>(`/pipelines/${id}/run`);
      return data;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["pipelines", id] });
      qc.invalidateQueries({ queryKey: ["pipeline-runs", id] });
    },
  });
}

export function usePipelineRuns(pipelineId: string | undefined) {
  return useQuery({
    queryKey: ["pipeline-runs", pipelineId],
    queryFn: async () => {
      const { data } = await api.get<PipelineRunListItem[]>(
        `/pipelines/${pipelineId}/runs`,
      );
      return data;
    },
    enabled: !!pipelineId,
    refetchInterval: (query) => {
      const runs = query.state.data;
      const hasActive = runs?.some(
        (r) => r.status === "pending" || r.status === "running",
      );
      return hasActive ? 2000 : false;
    },
  });
}

export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineId, runId }: { pipelineId: string; runId: string }) => {
      const { data } = await api.post<PipelineRun>(
        `/pipelines/${pipelineId}/runs/${runId}/retry`,
      );
      return data;
    },
    onSuccess: (_data, { pipelineId }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-runs", pipelineId] });
    },
  });
}

export function usePipelineRun(pipelineId: string | undefined, runId: string | undefined) {
  return useQuery({
    queryKey: ["pipeline-runs", pipelineId, runId],
    queryFn: async () => {
      const { data } = await api.get<PipelineRun>(
        `/pipelines/${pipelineId}/runs/${runId}`,
      );
      return data;
    },
    enabled: !!pipelineId && !!runId,
    refetchInterval: (query) => {
      const run = query.state.data;
      return run?.status === "pending" || run?.status === "running" ? 1000 : false;
    },
  });
}
