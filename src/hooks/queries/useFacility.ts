import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { FacilityFilters, FacilityTaskRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useFacilityDashboard(filters: FacilityFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.facility.dashboard(filters),
    queryFn: () =>
      apiGet<{
        open_count: number;
        overdue_count: number;
        site_readiness_score: number;
        by_category: Record<string, number>;
        by_region: Array<{ region: string; tasks: FacilityTaskRow[] }>;
        tasks: FacilityTaskRow[];
      }>("/api/facility/tasks", { ...filters, summary: true } as Record<string, string | number | boolean | null | undefined>),
    staleTime: STALE.facility,
    enabled: options?.enabled ?? true,
  });
}

export function useFacilityTasks(filters: FacilityFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.facility.tasks(filters),
    queryFn: () => apiGet<FacilityTaskRow[]>("/api/facility/tasks", filters as Record<string, string | number | boolean | null | undefined>),
    staleTime: STALE.facility,
    enabled: options?.enabled ?? true,
  });
}
