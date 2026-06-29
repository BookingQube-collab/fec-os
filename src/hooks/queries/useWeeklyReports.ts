import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import type {
  ExecutiveChartData,
  ExecutiveDashboardKpis,
  WeeklyReportRow,
} from "@/lib/queries/weekly-reports.core";

export interface WeeklyReportFilters {
  weekStart?: string | null;
  locationId?: string | null;
  status?: string | null;
}

function buildQs(filters: WeeklyReportFilters): string {
  const p = new URLSearchParams();
  if (filters.weekStart) p.set("weekStart", filters.weekStart);
  if (filters.locationId) p.set("locationId", filters.locationId);
  if (filters.status) p.set("status", filters.status);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useWeeklyReports(filters: WeeklyReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.weeklyReports.list(filters),
    queryFn: () => apiGet<WeeklyReportRow[]>(`/api/weekly-reports${buildQs(filters)}`),
    staleTime: STALE.lists,
  });
}

export function useWeeklyReport(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.weeklyReports.detail(id),
    queryFn: () => apiGet<WeeklyReportRow & { attachments: Record<string, unknown>[]; comments: Record<string, unknown>[] }>(`/api/weekly-reports/${id}`),
    enabled: Boolean(id),
    staleTime: STALE.lists,
  });
}

export function useExecutiveDashboard(weekStart: string) {
  return useQuery({
    queryKey: queryKeys.weeklyReports.executiveDashboard(weekStart),
    queryFn: () =>
      apiGet<{ kpis: ExecutiveDashboardKpis; charts: ExecutiveChartData }>(
        `/api/weekly-reports/executive/kpis?weekStart=${weekStart}`,
      ),
    staleTime: STALE.dashboardKpis,
  });
}

export function useExecutiveReports(weekStart?: string | null) {
  return useQuery({
    queryKey: queryKeys.weeklyReports.executiveList(weekStart),
    queryFn: () => {
      const qs = weekStart ? `?weekStart=${weekStart}` : "";
      return apiGet<Record<string, unknown>[]>(`/api/weekly-reports/executive${qs}`);
    },
    staleTime: STALE.lists,
  });
}

export function useExecutiveReportDetail(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.weeklyReports.executiveDetail(id),
    queryFn: () => apiGet<Record<string, unknown>>(`/api/weekly-reports/executive?id=${id}`),
    enabled: Boolean(id),
    staleTime: STALE.lists,
  });
}
