import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { fetchUsersWithRoles } from "@/lib/queries/admin.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useAdminUsers(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => apiGet<Awaited<ReturnType<typeof fetchUsersWithRoles>>>("/api/admin/users"),
    staleTime: STALE.lists,
    enabled: options?.enabled ?? true,
  });
}
