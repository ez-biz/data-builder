import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data } = await api.get<{ status: string; database: string; version: string }>(
        "/health",
      );
      return data;
    },
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 10_000,
  });
}
