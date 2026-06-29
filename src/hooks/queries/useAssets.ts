import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { AssetListRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useAssets(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.assets.list(locationId),
    queryFn: () => apiGet<AssetListRow[]>("/api/assets", { locationId }),
    staleTime: STALE.assets,
    enabled: options?.enabled ?? true,
  });
}
