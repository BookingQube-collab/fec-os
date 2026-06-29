import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { PmScheduleRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function usePmSchedules(
  locationId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.maintenance.pmSchedules(locationId),
    queryFn: () =>
      apiGet<PmScheduleRow[]>("/api/maintenance/pm-schedules", { locationId }),
    staleTime: STALE.pmSchedules,
    enabled: options?.enabled ?? true,
  });
}
