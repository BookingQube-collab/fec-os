import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { CeoOverview } from "@/lib/queries/ceo.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useCeoOverview(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.ceo.overview(),
    queryFn: () => apiGet<CeoOverview>("/api/ceo/overview"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
