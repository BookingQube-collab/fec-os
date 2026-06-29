import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AmcContractListRow } from "@/lib/queries/amc-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface AmcContractFilters {
  locationId?: string | null;
  category?: string | null;
  status?: string | null;
  page?: number;
  pageSize?: number;
}

export function useAmcContracts(filters: AmcContractFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.amc.contracts(filters),
    queryFn: () =>
      apiGet<{ items: AmcContractListRow[]; total: number }>("/api/amc/contracts", {
        locationId: filters.locationId,
        category: filters.category,
        status: filters.status,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.amcContracts,
    enabled: options?.enabled ?? true,
  });
}
