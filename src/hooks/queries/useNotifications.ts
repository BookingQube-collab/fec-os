import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import type { ActionInboxPayload } from "@/lib/notifications/inbox";
import type { EscalationRow, NotificationRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

/** Topbar inbox + escalations share one poll cadence; pause while tab hidden. */
const INBOX_POLL_MS = 120_000;

export function useEscalations(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.escalations(),
    queryFn: () => apiGet<EscalationRow[]>("/api/notifications", { kind: "escalations" }),
    staleTime: STALE.notifications,
    enabled: options?.enabled ?? true,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchInterval: options?.enabled === false ? false : INBOX_POLL_MS,
    refetchIntervalInBackground: false,
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

export function useActionInbox(userId?: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && Boolean(userId);
  return useQuery({
    queryKey: queryKeys.notifications.inbox(userId),
    queryFn: () => apiGet<ActionInboxPayload>("/api/notifications", { kind: "inbox" }),
    staleTime: STALE.notifications,
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchInterval: enabled ? INBOX_POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}
