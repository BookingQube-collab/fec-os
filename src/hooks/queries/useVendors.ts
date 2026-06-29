import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { VendorDashboardPayload, VendorListRow } from "@/lib/queries/vendors-api.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface VendorApiFilters {
  locationId?: string | null;
  category?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

export function useVendors(filters: VendorApiFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.vendors.list(filters),
    queryFn: () =>
      apiGet<{ items: VendorListRow[]; total: number }>("/api/vendors", {
        locationId: filters.locationId,
        category: filters.category,
        search: filters.search,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.vendors,
    enabled: options?.enabled ?? true,
  });
}

export function useVendorDashboard(
  locationId?: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.vendors.dashboard({ locationId: locationId ?? null }),
    queryFn: () =>
      apiGet<VendorDashboardPayload>("/api/vendors/dashboard", {
        locationId: locationId ?? null,
      }),
    staleTime: STALE.vendors,
    enabled: options?.enabled ?? true,
  });
}
