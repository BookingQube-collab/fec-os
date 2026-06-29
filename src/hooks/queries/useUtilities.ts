import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { UtilityRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useUtilityDashboard(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.utilities.dashboard(locationId),
    queryFn: () =>
      apiGet<{
        total_cost_this_month: number;
        record_count: number;
        high_consumption_alerts: Array<{ location_id: string; code: string; kwh: number }>;
        site_comparison: Array<{ location_id: string; code: string; cost: number; kwh: number }>;
        rows: UtilityRow[];
      }>("/api/utilities", { locationId, summary: true }),
    staleTime: STALE.utilities,
    enabled: options?.enabled ?? true,
  });
}

export function useUtilityConsumption(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.utilities.list(locationId),
    queryFn: () => apiGet<UtilityRow[]>("/api/utilities", { locationId }),
    staleTime: STALE.utilities,
    enabled: options?.enabled ?? true,
  });
}
