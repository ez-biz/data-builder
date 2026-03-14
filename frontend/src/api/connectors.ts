import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  Connector,
  ConnectorCreate,
  ConnectorUpdate,
  ConnectionTestResult,
} from "../types/connector";

export function useConnectors() {
  return useQuery({
    queryKey: ["connectors"],
    queryFn: async () => {
      const { data } = await api.get<Connector[]>("/connectors");
      return data;
    },
  });
}

export function useConnector(id: string) {
  return useQuery({
    queryKey: ["connectors", id],
    queryFn: async () => {
      const { data } = await api.get<Connector>(`/connectors/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ConnectorCreate) => {
      const { data } = await api.post<Connector>("/connectors", payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connectors"] }),
  });
}

export function useUpdateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: ConnectorUpdate }) => {
      const { data } = await api.put<Connector>(`/connectors/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connectors"] }),
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/connectors/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connectors"] }),
  });
}

export function useTestConnector() {
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ConnectionTestResult>(
        `/connectors/${id}/test`,
      );
      return data;
    },
  });
}
