import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { IssueFilters, IssueListRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useIssues(filters: IssueFilters = {}, options?: { enabled?: boolean }) {
  const key = {
    locationId: filters.locationId ?? null,
    status: filters.status ?? null,
    priority: filters.priority ?? null,
    page: filters.page ?? 1,
  };
  return useQuery({
    queryKey: queryKeys.issues.list(key),
    queryFn: () =>
      apiGet<{ items: IssueListRow[]; total: number }>("/api/issues", {
        locationId: filters.locationId,
        status: filters.status,
        priority: filters.priority,
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 50,
      }),
    staleTime: STALE.issues,
    enabled: options?.enabled ?? true,
  });
}
