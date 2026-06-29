import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { fetchAmcRenewals } from "@/lib/queries/amc-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useAmcRenewals(days = 30, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.amc.renewals({ days }),
    queryFn: () =>
      apiGet<Awaited<ReturnType<typeof fetchAmcRenewals>>>("/api/amc/renewals", { days }),
    staleTime: STALE.amcContracts,
    enabled: options?.enabled ?? true,
  });
}
