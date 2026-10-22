"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { NotificationApprovalToast } from "@/components/layout/notification-approval-toast";
import { useAuth } from "@/hooks/use-auth";
import { useActionInboxBadge } from "@/hooks/queries/useNotifications";
import {
  decideInboxToasts,
  isApprovalInboxItem,
  type InboxToastState,
} from "@/lib/notifications/inbox-toast";
import type { InboxItem } from "@/lib/notifications/inbox";
import { markNotificationRead } from "@/lib/notifications.functions";
import { queryKeys } from "@/lib/query-keys";
import { canUserDo, type AppRole } from "@/lib/rbac";

const MAX_VISIBLE_TOASTS = 4;

function sessionSeenKey(userId: string) {
  return `fec.inbox.toastSeen:${userId}`;
}

function readSessionSeen(userId: string): string[] {
  try {
    const raw = sessionStorage.getItem(sessionSeenKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSessionSeen(userId: string, ids: string[]) {
  try {
    sessionStorage.setItem(sessionSeenKey(userId), JSON.stringify(ids.slice(-200)));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Match the bell's shell defer so route queries win the first paint;
 * React Query still shares the badge cache with NotificationBell.
 */
function useDeferShellInbox(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 700);
    return () => window.clearTimeout(id);
  }, []);

  return ready;
}

function toastCopy(
  item: InboxItem,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { title: string; body: string; actionLabel: string } {
  const resolvedTitle = item.titleKey ? t(item.titleKey, item.titleParams) : item.title;
  const approval = isApprovalInboxItem(item);
  const title = approval ? t("inbox.pendingApproval") : resolvedTitle;
  const body =
    item.body?.trim() ||
    (approval ? resolvedTitle : t("inbox.toastFallbackBody"));
  return {
    title,
    body,
    actionLabel: approval ? t("inbox.review") : t("inbox.open"),
  };
}

/**
 * Shows screenshot-style toasts for newly arrived unread notifications.
 * Uses the cheap badge poll only — no open-work fan-out.
 */
export function NotificationToastHost() {
  const { t } = useTranslation();
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const shellInboxReady = useDeferShellInbox();
  const stateRef = useRef<InboxToastState>({ primed: false, seenIds: [] });

  const roleList = roles.map((r) => r.role as AppRole);
  const canPollInbox =
    canUserDo(roleList, "notifications.view") || canUserDo(roleList, "issues.view");
  const pollInbox = !!user && canPollInbox && shellInboxReady;

  const badge = useActionInboxBadge(user?.id, { enabled: pollInbox });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
  const markReadMutate = markRead.mutate;

  useEffect(() => {
    if (!user?.id) {
      stateRef.current = { primed: false, seenIds: [] };
      return;
    }
    // Keep tab-session memory so a refresh does not re-spam the same toast.
    stateRef.current = { primed: false, seenIds: readSessionSeen(user.id) };
  }, [user?.id]);

  // Badge poll is 60s and skips background tabs — refetch when the user returns.
  useEffect(() => {
    if (!pollInbox || !user?.id) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.inboxBadge(user.id) });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [pollInbox, qc, user?.id]);

  useEffect(() => {
    if (!badge.isSuccess || !pollInbox || !badge.data?.items || !user?.id) return;

    const items = badge.data.items;
    const decision = decideInboxToasts(stateRef.current, items);
    stateRef.current = decision.next;
    writeSessionSeen(user.id, decision.next.seenIds);
    if (decision.toastIds.length === 0) return;

    const byId = new Map(items.map((item) => [item.id, item]));
    const toShow = decision.toastIds
      .map((id) => byId.get(id))
      .filter((item): item is InboxItem => Boolean(item))
      .slice(0, MAX_VISIBLE_TOASTS);

    for (const item of toShow) {
      const copy = toastCopy(item, t);
      const actionUrl = item.actionUrl || "/notifications";
      toast.custom(
        (toastId) => (
          <NotificationApprovalToast
            title={copy.title}
            body={copy.body}
            actionLabel={copy.actionLabel}
            actionUrl={actionUrl}
            onDismiss={() => toast.dismiss(toastId)}
            onReview={() => {
              if (item.persisted && item.id.startsWith("notif:")) {
                markReadMutate(item.id.slice(6));
              }
              toast.dismiss(toastId);
            }}
          />
        ),
        {
          id: item.id,
          duration: Infinity,
          unstyled: true,
          className: "w-auto",
        },
      );
    }
  }, [badge.isSuccess, badge.data, pollInbox, t, markReadMutate, user?.id]);

  return null;
}
