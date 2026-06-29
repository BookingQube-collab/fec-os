import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { BranchScore } from "@/lib/queries/branches.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useBranchLeague(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.branches.league(),
    queryFn: () => apiGet<BranchScore[]>("/api/branches/league"),
    staleTime: STALE.branches,
    enabled: options?.enabled ?? true,
  });
}
