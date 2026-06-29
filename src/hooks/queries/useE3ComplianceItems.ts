import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { E3ComplianceItemRow } from "@/lib/compliance-tracker/constants";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

/** @deprecated Prefer page-specific hooks in useE3TrackerQueries.ts. Kept for legacy full-register fetch. */
export function useE3ComplianceItems(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.e3ComplianceTracker.all,
    queryFn: () => apiGet<E3ComplianceItemRow[]>("/api/compliance/e3-tracker"),
    staleTime: STALE.e3Compliance,
    enabled: options?.enabled ?? true,
  });
}
