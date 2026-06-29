import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type {
  MaintenanceDashboardFilters,
  MaintenanceDashboardPayload,
} from "@/lib/queries/maintenance-dashboard.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useMaintenanceDashboard(
  filters: MaintenanceDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.maintenance.dashboard(filters),
    queryFn: () =>
      apiGet<MaintenanceDashboardPayload>("/api/maintenance/dashboard", {
        locationId: filters.locationId,
      }),
    staleTime: STALE.maintenanceDashboard,
    enabled: options?.enabled ?? true,
  });
}
