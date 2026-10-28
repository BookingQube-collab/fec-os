import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet } from "@/lib/api-client";
import { markAllNotificationsRead } from "@/lib/notifications.functions";
import { applyMarkAllRead, type ActionInboxPayload } from "@/lib/notifications/inbox";
import type { EscalationRow, NotificationRow } from "@/lib/queries/module-queries.core";
import { queryKeys } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

/**
 * Shell badge poll. Align with STALE.notifications; pause while the tab is hidden
 * (refetchIntervalInBackground: false). Full open-work inbox is fetched on demand.
 */
const INBOX_BADGE_POLL_MS = 60_000;
/** Escalations change less often than in-app notifications. */
const ESCALATIONS_POLL_MS = 120_000;
/** Full derived inbox on hub / notifications page — keep fresh, not shell-cadence. */
const INBOX_FULL_POLL_MS = 90_000;

export function useEscalations(options?: { enabled?: boolean; poll?: boolean }) {
  const poll = options?.poll !== false;
  return useQuery({
    queryKey: queryKeys.notifications.escalations(),
    queryFn: () => apiGet<EscalationRow[]>("/api/notifications", { kind: "escalations" }),
    staleTime: STALE.notifications,
    enabled: options?.enabled ?? true,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: options?.enabled === false || !poll ? false : ESCALATIONS_POLL_MS,
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

/** Cheap shell poll: persisted notifications only (no PR/maintenance/leave fan-out). */
export function useActionInboxBadge(userId?: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && Boolean(userId);
  return useQuery({
    queryKey: queryKeys.notifications.inboxBadge(userId),
    queryFn: () =>
      apiGet<ActionInboxPayload>("/api/notifications", { kind: "inbox", mode: "badge" }),
    staleTime: STALE.notifications,
    enabled,
    refetchOnMount: false,
    // Poll + toast host cover freshness; focus refetch doubled badge traffic on tab switches.
    refetchOnWindowFocus: false,
    refetchInterval: enabled ? INBOX_BADGE_POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useActionInbox(
  userId?: string | null,
  options?: { enabled?: boolean; poll?: boolean },
) {
  const enabled = (options?.enabled ?? true) && Boolean(userId);
  const poll = options?.poll !== false;
  return useQuery({
    queryKey: queryKeys.notifications.inbox(userId),
    queryFn: () => apiGet<ActionInboxPayload>("/api/notifications", { kind: "inbox" }),
    staleTime: STALE.notifications,
    enabled,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: enabled && poll ? INBOX_FULL_POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: 2,
  });
}

export function useMarkAllNotificationsRead(userId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications.all });
      const inboxKey = queryKeys.notifications.inbox(userId);
      const badgeKey = queryKeys.notifications.inboxBadge(userId);
      const previousInbox = qc.getQueryData<ActionInboxPayload>(inboxKey);
      const previousBadge = qc.getQueryData<ActionInboxPayload>(badgeKey);
      if (previousInbox) qc.setQueryData(inboxKey, applyMarkAllRead(previousInbox));
      if (previousBadge) qc.setQueryData(badgeKey, applyMarkAllRead(previousBadge));
      return { previousInbox, previousBadge, inboxKey, badgeKey };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousInbox) qc.setQueryData(context.inboxKey, context.previousInbox);
      if (context?.previousBadge) qc.setQueryData(context.badgeKey, context.previousBadge);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
