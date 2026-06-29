import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { SnagFilters } from "@/lib/queries/snags.core";
import { fetchSnag, fetchSnagDashboard, fetchSnags } from "@/lib/queries/snags.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useSnags(filters: SnagFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.snags.list(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchSnags>>>(
        "/api/snags",
        filters as Record<string, string | null | undefined>,
      ),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}

export function useSnag(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.snags.detail(id),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchSnag>>>(`/api/snags/${id}`),
    staleTime: STALE.lists,
    enabled: (options?.enabled ?? true) && !!id,
  });
}

export function useSnagDashboard(filters: SnagFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.snags.dashboard(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchSnagDashboard>>>("/api/snags", { ...filters, dashboard: true }),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
