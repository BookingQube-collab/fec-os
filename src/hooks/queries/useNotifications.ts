import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { EscalationRow, NotificationRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export function useEscalations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.escalations(),
    queryFn: () => apiGet<EscalationRow[]>("/api/notifications", { kind: "escalations" }),
    staleTime: STALE.notifications,
    enabled: options?.enabled ?? true,
  });
}

export function useNotifications(
  filters: { unreadOnly?: boolean; limit?: number } = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.notifications.list(filters),
    queryFn: () =>
      apiGet<NotificationRow[]>("/api/notifications", {
        kind: "list",
        unreadOnly: filters.unreadOnly,
        limit: filters.limit ?? 30,
      }),
    staleTime: STALE.notifications,
    enabled: options?.enabled ?? true,
  });
}
