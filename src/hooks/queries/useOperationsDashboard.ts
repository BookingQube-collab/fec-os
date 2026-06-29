import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import type { BranchDashboardRow } from "@/lib/dashboard.functions";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface OperationsFilters {
  period?: DashboardPeriod;
  locationId?: string | null;
  view?: string;
}

export function useOperationsDashboard(
  filters: OperationsFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.operations.dashboard(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof import("@/lib/queries/operations-dashboard.core").fetchOperationsDashboard>>>(
        "/api/operations/dashboard",
        {
          period: filters.period ?? "today",
          locationId: filters.locationId,
          view: filters.view,
        },
      ),
    staleTime: STALE.operationsBranches,
    gcTime: STALE.operationsBranches * 2,
    enabled: options?.enabled ?? true,
  });
}

export function useBranchesSummary(
  filters: OperationsFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.operations.branches(filters),
    queryFn: () =>
      apiGet<BranchDashboardRow[]>("/api/operations/branches", {
        period: filters.period ?? "today",
        locationId: filters.locationId,
      }),
    staleTime: STALE.operationsBranches,
    gcTime: STALE.operationsBranches * 2,
    enabled: options?.enabled ?? true,
  });
}

export function useSiteSummary(
  locationId: string | null,
  filters: OperationsFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.operations.siteSummary(locationId ?? "", filters),
    queryFn: () =>
      apiGet<BranchDashboardRow | null>("/api/operations/site-summary", {
        locationId,
        period: filters.period ?? "today",
      }),
    staleTime: STALE.operationsBranches,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}
