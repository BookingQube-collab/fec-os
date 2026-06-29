import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { WorkOrderListRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface WorkOrderFilters {
  locationId?: string | null;
  status?: string | null;
  mine?: boolean;
  page?: number;
  pageSize?: number;
}

export function useWorkOrders(filters: WorkOrderFilters = {}, options?: { enabled?: boolean }) {
  const key = {
    locationId: filters.locationId ?? null,
    status: filters.status ?? null,
    mine: filters.mine ?? false,
    page: filters.page ?? 1,
  };
  return useQuery({
    queryKey: queryKeys.workOrders.list(key),
    queryFn: () =>
      apiGet<{ items: WorkOrderListRow[]; total: number }>("/api/work-orders", {
        locationId: filters.locationId,
        status: filters.status,
        mine: filters.mine,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.workOrders,
    enabled: options?.enabled ?? true,
  });
}
