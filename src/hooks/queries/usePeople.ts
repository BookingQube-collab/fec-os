import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { StaffRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useStaff(locationId?: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.staff(locationId),
    queryFn: () => apiGet<StaffRow[]>("/api/people", { locationId }),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}
