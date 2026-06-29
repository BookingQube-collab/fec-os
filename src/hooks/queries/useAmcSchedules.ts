import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AmcScheduleListRow } from "@/lib/queries/amc-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface AmcScheduleFilters {
  locationId?: string | null;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export function useAmcSchedules(
  filters: AmcScheduleFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.amc.schedules(filters),
    queryFn: () =>
      apiGet<{ items: AmcScheduleListRow[]; total: number }>("/api/amc/schedules", {
        locationId: filters.locationId,
        overdueOnly: filters.overdueOnly,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 100,
      }),
    staleTime: STALE.amcSchedules,
    enabled: options?.enabled ?? true,
  });
}
