import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { DowntimeEventRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface DowntimeFilters {
  locationId?: string | null;
  openOnly?: boolean;
}

export function useDowntimeEvents(
  filters: DowntimeFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.maintenance.downtime(filters),
    queryFn: () =>
      apiGet<DowntimeEventRow[]>("/api/maintenance/downtime", {
        locationId: filters.locationId,
        openOnly: filters.openOnly,
      }),
    staleTime: STALE.downtime,
    enabled: options?.enabled ?? true,
  });
}
