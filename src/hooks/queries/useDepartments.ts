import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { MasterDepartmentRow } from "@/lib/staff-departments";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useMasterDepartments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.people.departments(),
    queryFn: () => apiGet<MasterDepartmentRow[]>("/api/people/departments"),
    staleTime: STALE.people,
    enabled: options?.enabled ?? true,
  });
}
