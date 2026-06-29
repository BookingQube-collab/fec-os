"use client";

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { MaintenanceWeeklyReportPayload } from "@/lib/queries/maintenance-weekly-report.core";
import { STALE } from "@/lib/query-client";

export function useMaintenanceWeeklyReport(filters?: {
  locationId?: string | null;
  weekStart?: string | null;
}) {
  return useQuery({
    queryKey: queryKeys.maintenance.weeklyReport(filters),
    queryFn: () =>
      apiGet<MaintenanceWeeklyReportPayload>("/api/maintenance/weekly-report", {
        locationId: filters?.locationId,
        weekStart: filters?.weekStart,
      }),
    staleTime: STALE.maintenanceDashboard,
  });
}
