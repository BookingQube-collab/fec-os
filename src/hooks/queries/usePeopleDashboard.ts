import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type {
  PeopleDashboardFilters,
  PeopleDashboardPayload,
} from "@/lib/queries/people-dashboard.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function usePeopleDashboard(
  filters: PeopleDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.people.dashboard(filters),
    queryFn: () =>
      apiGet<PeopleDashboardPayload>("/api/people/dashboard", {
        locationId: filters.locationId,
      }),
    staleTime: STALE.peopleDashboard,
    enabled: options?.enabled ?? true,
  });
}
