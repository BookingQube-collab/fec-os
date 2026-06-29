import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type {
  ComplianceRegisterFilters,
  ServiceHistoryFilters,
} from "@/lib/queries/compliance-register.core";
import {
  fetchComplianceAlerts,
  fetchComplianceCalendarMonth,
  fetchComplianceCommandCenter,
  fetchComplianceCoverage,
  fetchComplianceServiceHistory,
  fetchComplianceTrend,
  fetchExecutiveComplianceKpis,
  fetchStaffReadiness,
  fetchSupervisorConsole,
  fetchVendorScorecard,
} from "@/lib/queries/compliance-register.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

const stale = STALE.complianceRegister;

export function useComplianceCommandCenter(
  filters: ComplianceRegisterFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.command(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchComplianceCommandCenter>>>(
        "/api/compliance/command",
        filters as Record<string, string | number | boolean | null | undefined>,
      ),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceAlerts(
  filters: ComplianceRegisterFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.alerts(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchComplianceAlerts>>>(
        "/api/compliance/alerts",
        filters as Record<string, string | number | boolean | null | undefined>,
      ),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceTrend(
  params: { year: number; locationCode?: string | null },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.trend(params),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchComplianceTrend>>>("/api/compliance/trend", params),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceCalendarMonth(
  params: { year: number; month: number; locationCode?: string | null },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.calendarMonth(params),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchComplianceCalendarMonth>>>("/api/compliance/calendar", params),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceCoverage(
  filters: ComplianceRegisterFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.coverage(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchComplianceCoverage>>>(
        "/api/compliance/coverage",
        filters as Record<string, string | number | boolean | null | undefined>,
      ),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useStaffReadiness(
  filters: { locationId?: string | null } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.staffReadiness(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchStaffReadiness>>>("/api/compliance/staff-readiness", filters),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useSupervisorConsole(locationId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.compliance.supervisor(locationId),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchSupervisorConsole>>>("/api/compliance/supervisor", { locationId }),
    staleTime: stale,
    enabled: (options?.enabled ?? true) && !!locationId,
  });
}

export function useVendorScorecard(
  filters: { locationCode?: string | null } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.vendorScorecard(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchVendorScorecard>>>("/api/compliance/vendor-scorecard", filters),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useComplianceServiceHistory(
  filters: ServiceHistoryFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.serviceHistory(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchComplianceServiceHistory>>>(
        "/api/compliance/service-history",
        filters as Record<string, string | number | boolean | null | undefined>,
      ),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}

export function useExecutiveComplianceKpis(
  filters: { locationCode?: string | null } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.compliance.executiveKpis(filters.locationCode ?? null),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchExecutiveComplianceKpis>>>("/api/compliance/executive-kpis", filters),
    staleTime: stale,
    enabled: options?.enabled ?? true,
  });
}
