import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import type {
  SchemasResponse,
  TablesResponse,
  ColumnsResponse,
  TablePreviewResponse,
} from "../types/catalog";

export function useSchemas(connectorId: string) {
  return useQuery({
    queryKey: ["catalog", connectorId, "schemas"],
    queryFn: async () => {
      const { data } = await api.get<SchemasResponse>(
        `/catalog/${connectorId}/schemas`,
      );
      return data;
    },
    enabled: !!connectorId,
  });
}

export function useTables(connectorId: string, schema: string) {
  return useQuery({
    queryKey: ["catalog", connectorId, schema, "tables"],
    queryFn: async () => {
      const { data } = await api.get<TablesResponse>(
        `/catalog/${connectorId}/schemas/${schema}/tables`,
      );
      return data;
    },
    enabled: !!connectorId && !!schema,
  });
}

export function useColumns(
  connectorId: string,
  schema: string,
  table: string,
) {
  return useQuery({
    queryKey: ["catalog", connectorId, schema, table, "columns"],
    queryFn: async () => {
      const { data } = await api.get<ColumnsResponse>(
        `/catalog/${connectorId}/schemas/${schema}/tables/${table}/columns`,
      );
      return data;
    },
    enabled: !!connectorId && !!schema && !!table,
  });
}

export function useTablePreview(
  connectorId: string,
  schema: string,
  table: string,
  enabled: boolean = false,
) {
  return useQuery({
    queryKey: ["catalog", connectorId, schema, table, "preview"],
    queryFn: async () => {
      const { data } = await api.get<TablePreviewResponse>(
        `/catalog/${connectorId}/schemas/${schema}/tables/${table}/preview`,
      );
      return data;
    },
    enabled: enabled && !!connectorId && !!schema && !!table,
  });
}
