import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AmcDashboardFilters, AmcDashboardKpis } from "@/lib/queries/amc-dashboard.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export type { AmcDashboardFilters };

function filterParams(filters: AmcDashboardFilters) {
  return {
    locationId: filters.locationId,
    region: filters.region,
    category: filters.category,
    vendor: filters.vendor,
    status: filters.status,
    paymentStatus: filters.paymentStatus,
    search: filters.search,
    activeOnly: filters.activeOnly,
    overdueOnly: filters.overdueOnly,
    dueThisWeek: filters.dueThisWeek,
    dueThisMonth: filters.dueThisMonth,
    expiringSoon: filters.expiringSoon,
  };
}

export function useAmcDashboardSummary(
  filters: AmcDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.amc.summary(filters),
    queryFn: () =>
      apiGet<{ kpis: AmcDashboardKpis }>("/api/amc/dashboard/summary", filterParams(filters)),
    staleTime: STALE.amcDashboard,
    enabled: options?.enabled ?? true,
  });
}

export function useAmcDashboardContracts(
  filters: AmcDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.amc.dashboardContracts(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof import("@/lib/queries/amc-dashboard.core").fetchAmcDashboardContracts>>>(
        "/api/amc/dashboard/contracts",
        { ...filterParams(filters), page: filters.page ?? 1, pageSize: filters.pageSize ?? 200 },
      ),
    staleTime: STALE.amcDashboard,
    enabled: options?.enabled ?? true,
  });
}

export function useAmcExpiryAlerts(
  filters: AmcDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.amc.expiryAlerts(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof import("@/lib/queries/amc-dashboard.core").fetchAmcExpiryAlerts>>>(
        "/api/amc/expiry-alerts",
        filterParams(filters),
      ),
    staleTime: STALE.amcDashboard,
    enabled: options?.enabled ?? true,
  });
}

export function useAmcPayments(
  filters: AmcDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.amc.payments(filters),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof import("@/lib/queries/amc-dashboard.core").fetchAmcPayments>>>(
        "/api/amc/payments",
        filterParams(filters),
      ),
    staleTime: STALE.amcDashboard,
    enabled: options?.enabled ?? true,
  });
}
