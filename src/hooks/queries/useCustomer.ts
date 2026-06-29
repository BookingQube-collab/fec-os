import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { fetchComplaints } from "@/lib/queries/customer.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useComplaints(
  filters: { locationId?: string | null; status?: string | null } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.customer.complaints(filters),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchComplaints>>>("/api/customer/complaints", filters),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
