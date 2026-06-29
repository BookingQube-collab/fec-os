import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import type { DashboardKpiPayload } from "@/lib/queries/dashboard-kpis.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useDashboardKpis(options: {
  period: DashboardPeriod;
  locationId: string | null;
  view: string;
  enabled?: boolean;
}) {
  const { period, locationId, view, enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.dashboard.kpis(period, locationId, view),
    queryFn: () =>
      apiGet<DashboardKpiPayload>(
        "/api/dashboard/kpis",
        {
          period,
          locationId,
          view,
        },
        { priority: "high" },
      ),
    staleTime: STALE.dashboardKpis,
    refetchInterval: 60_000,
    enabled,
  });
}

export function useDashboardCharts(options: {
  period: DashboardPeriod;
  locationId: string | null;
  year: number;
  utilityBase?: number;
  enabled?: boolean;
}) {
  const { period, locationId, year, utilityBase, enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.dashboard.charts(period, locationId, year),
    queryFn: () =>
      apiGet<import("@/lib/queries/dashboard-kpis.core").DashboardChartsPayload>(
        "/api/dashboard/charts",
        { locationId, year, utilityBase },
      ),
    staleTime: STALE.dashboardCharts,
    enabled,
  });
}
