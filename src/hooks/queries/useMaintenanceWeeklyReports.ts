import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type { MaintenanceWeeklyReportRow } from "@/lib/queries/maintenance-weekly-reports.core";

export interface MaintenanceWeeklyReportFilters {
  weekStart?: string | null;
  team?: string | null;
  status?: string | null;
  locationId?: string | null;
}

function buildQs(filters: MaintenanceWeeklyReportFilters): string {
  const p = new URLSearchParams();
  if (filters.weekStart) p.set("weekStart", filters.weekStart);
  if (filters.team) p.set("team", filters.team);
  if (filters.status) p.set("status", filters.status);
  if (filters.locationId) p.set("locationId", filters.locationId);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useMaintenanceWeeklyReports(filters: MaintenanceWeeklyReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.maintenance.weeklyReports.list(filters),
    queryFn: () =>
      apiGet<MaintenanceWeeklyReportRow[]>(`/api/maintenance/weekly-reports${buildQs(filters)}`),
    staleTime: STALE.lists,
  });
}

export function useMaintenanceWeeklyReportSubmission(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.maintenance.weeklyReports.detail(id),
    queryFn: () =>
      apiGet<
        MaintenanceWeeklyReportRow & {
          attachments: Record<string, unknown>[];
          comments: Record<string, unknown>[];
        }
      >(`/api/maintenance/weekly-reports/${id}`),
    enabled: Boolean(id),
    staleTime: STALE.lists,
  });
}

export function useMaintenanceExecutiveReports(weekStart?: string | null) {
  return useQuery({
    queryKey: queryKeys.maintenance.weeklyReports.executiveList(weekStart),
    queryFn: () => {
      const qs = weekStart ? `?weekStart=${weekStart}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/maintenance/weekly-reports/executive${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useMaintenanceExecutiveReportDetail(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.maintenance.weeklyReports.executiveDetail(id),
    queryFn: () =>
      apiGet<Record<string, unknown>>(`/api/maintenance/weekly-reports/executive?id=${id}`),
    enabled: Boolean(id),
    staleTime: STALE.lists,
  });
}
