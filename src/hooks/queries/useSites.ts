import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { SiteRow } from "@/lib/queries/module-queries.core";

export function useSites(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.sites.list(),
    queryFn: () => apiGet<SiteRow[]>("/api/sites", undefined, { cache: "no-store" }),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}
