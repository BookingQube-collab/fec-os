import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type {
  InventoryDashboardFilters,
  InventoryDashboardPayload,
} from "@/lib/queries/inventory-dashboard.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useInventoryDashboard(
  filters: InventoryDashboardFilters = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.inventory.dashboard(filters),
    queryFn: () =>
      apiGet<InventoryDashboardPayload>("/api/inventory/dashboard", {
        locationId: filters.locationId,
      }),
    staleTime: STALE.inventoryDashboard,
    enabled: options?.enabled ?? true,
  });
}
