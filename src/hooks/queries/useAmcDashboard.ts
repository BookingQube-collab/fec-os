import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface AmcDashboardFilters {
  locationId?: string | null;
  region?: string | null;
  category?: string | null;
  vendor?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  search?: string;
  activeOnly?: boolean;
  overdueOnly?: boolean;
  dueThisWeek?: boolean;
  dueThisMonth?: boolean;
  expiringSoon?: boolean;
}

export function useAmcDashboard(filters: AmcDashboardFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.amc.dashboard(filters),
    queryFn: () => apiGet<Awaited<ReturnType<typeof import("@/lib/amc.functions").getAmcDashboard>>>(
      "/api/amc/dashboard",
      {
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
      },
    ),
    staleTime: STALE.amcDashboard,
    enabled: options?.enabled ?? true,
  });
}
