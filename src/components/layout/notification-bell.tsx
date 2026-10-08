"use client";

import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCheck,
  ClipboardList,
  FileText,
  ShieldAlert,
  UserCheck,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar as arDateLocale } from "date-fns/locale";

import BellToggle from "@/components/react-bits/bell-toggle";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useComplianceExpiryNotifications } from "@/hooks/queries/useComplianceExpiryNotifications";
import { useActionInbox, useEscalations, useMarkAllNotificationsRead } from "@/hooks/queries/useNotifications";
import { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
import type { InboxItemKind } from "@/lib/notifications/inbox";
import { ackEscalation, markNotificationRead } from "@/lib/notifications.functions";
import { queryKeys } from "@/lib/query-keys";
import type { AppRole } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";

const INBOX_ICONS: Record<InboxItemKind, typeof Bell> = {
  notification: Bell,
  procurement: ClipboardList,
  maintenance: Wrench,
  work_order: Wrench,
  event_task: Calendar,
  snag: AlertTriangle,
  weekly_report: FileText,
  evaluation: UserCheck,
};

function relativeTime(iso: string, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, {
    addSuffix: true,
    locale: language === "ar" ? arDateLocale : undefined,
  });
}

/**
 * Header bell + inbox. The panel is portaled so shell overflow, the aurora
 * backdrop, and sticky headers cannot clip it. Anchored to the bell.
 */
export function NotificationBell({
  dismissed = false,
  onOpen,
}: {
  /** Close the panel when another header menu opens. */
  dismissed?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const currentLocationId = useAppStore((s) => s.currentLocationId);
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (dismissed) setOpen(false);
  }, [dismissed]);

  const roleList = roles.map((r) => r.role as AppRole);
  const showComplianceAlerts = canViewComplianceExpiryAlerts(roleList);

  const inbox = useActionInbox(user?.id, { enabled: !!user });
  const escalations = useEscalations({ enabled: !!user });
  const complianceAlerts = useComplianceExpiryNotifications(
    { locationId: currentLocationId, limit: 12 },
    { enabled: !!user && showComplianceAlerts && open },
  );
  const complianceSummary = useComplianceExpiryNotifications(
    { locationId: currentLocationId, summaryOnly: true },
    { enabled: !!user && showComplianceAlerts },
  );

  const ack = useMutation({
    mutationFn: (id: string) => ackEscalation({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.escalations() }),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead({ id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
  const markAll = useMarkAllNotificationsRead(user?.id);

  const inboxItems = (inbox.data?.items ?? []).filter((item) => !item.persisted || !item.readAt);
  const inboxUnread = inbox.data?.unreadCount ?? 0;
  const escalationCount = escalations.data?.length ?? 0;
  const complianceCount = complianceSummary.data?.summary.total ?? 0;
  const unread = inboxUnread + escalationCount;

  const severityLabel = useMemo(
    () =>
      ({
        expired: t("complianceExpiry.severity.expired"),
        critical: t("complianceExpiry.severity.critical"),
        warning: t("complianceExpiry.severity.warning"),
      }) as const,
    [t],
  );

  const close = () => setOpen(false);

  const toggle = () => {
    setOpen((next) => {
      const opening = !next;
      if (opening) onOpen?.();
      return opening;
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span ref={anchorRef} className="inline-flex">
          <BellToggle
            size="sm"
            className="shrink-0 [&_button]:gap-0 [&_button>span:last-child]:hidden"
            label={t("common.notifications")}
            offLabel={t("common.notifications")}
            onLabel={t("common.notifications")}
            count={unread}
            pressed={open || unread > 0}
            onChange={toggle}
            color="#1a1a1a"
            background="#ffffff"
            onColor="#1a1a1a"
            onBackground="#efeaff"
            badgeColor="#c93c37"
            badgeTextColor="#ffffff"
          />
        </span>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          const target = event.target;
          if (target instanceof Node && anchorRef.current?.contains(target)) {
            event.preventDefault();
          }
        }}
        className="z-[130] flex w-[min(28rem,calc(100vw-1rem))] max-h-[min(32rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-[1.5rem] bg-card p-0 shadow-elevated-md"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="section-kicker uppercase tracking-wide">
            {t("inbox.header", { count: unread })}
          </div>
          <div className="flex items-center gap-3">
            {inboxUnread > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("inbox.markAllRead")}
              </button>
            ) : null}
            <Link
              href="/notifications"
              className="text-xs font-medium text-foreground hover:underline"
              onClick={close}
            >
              {t("inbox.viewAll")}
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {inboxItems.length > 0 && (
            <div className="section-kicker border-b border-border bg-secondary/60 px-4 py-2 uppercase tracking-wide text-primary">
              {t("inbox.actionSection")}
            </div>
          )}
          {inboxItems.map((item) => {
            const Icon = INBOX_ICONS[item.kind] ?? Bell;
            const when = relativeTime(item.createdAt, language);
            return (
              <Link
                key={item.id}
                href={item.actionUrl || "/notifications"}
                onClick={() => {
                  if (item.persisted && item.id.startsWith("notif:")) {
                    markRead.mutate(item.id.slice(6));
                  }
                  close();
                }}
                className="block border-b border-border p-3 last:border-b-0 hover:bg-secondary/50"
              >
                <div className="flex items-start gap-2">
                  <Icon
                    className={
                      "mt-0.5 h-3.5 w-3.5 shrink-0 " +
                      (item.severity === "critical" ? "text-destructive" : "text-amber-600")
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-foreground">
                        {item.titleKey ? t(item.titleKey, item.titleParams) : item.title}
                      </div>
                      {item.persisted && !item.readAt && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    {item.body && (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</div>
                    )}
                    {when ? <div className="mt-1 text-xs text-muted-foreground">{when}</div> : null}
                  </div>
                </div>
              </Link>
            );
          })}
          {showComplianceAlerts && complianceCount > 0 && (
            <>
              <div className="flex items-center justify-between border-b border-border bg-rag-amber px-4 py-2">
                <span className="section-kicker uppercase tracking-wide text-amber-800">
                  {t("complianceExpiry.bell.complianceSection")}
                </span>
                <Link
                  href="/compliance/expiry-alerts"
                  className="text-xs font-medium text-foreground hover:underline"
                  onClick={close}
                >
                  {t("complianceExpiry.banner.viewAll")}
                </Link>
              </div>
              {(complianceAlerts.data?.items ?? []).map((item) => (
                <Link
                  key={item.id}
                  href={item.actionUrl}
                  onClick={close}
                  className="block border-b border-border p-3 last:border-b-0 hover:bg-secondary/50"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert
                      className={
                        "mt-0.5 h-3.5 w-3.5 shrink-0 " +
                        (item.severity === "expired" || item.severity === "critical"
                          ? "text-destructive"
                          : "text-amber-600")
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.locationLabel}
                        {item.subtitle ? ` · ${item.subtitle}` : ""}
                      </div>
                      <div className="mt-1 text-xs font-medium text-[var(--warning)]">
                        {severityLabel[item.severity]} ·{" "}
                        {item.daysRemaining < 0
                          ? t("complianceExpiry.daysOverdue", { count: Math.abs(item.daysRemaining) })
                          : t("complianceExpiry.daysRemaining", { count: item.daysRemaining })}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
              {complianceAlerts.isLoading && (
                <div className="border-b border-border p-4 text-center text-xs text-muted-foreground">
                  {t("complianceExpiry.bell.loading")}
                </div>
              )}
            </>
          )}

          {escalationCount > 0 && (
            <div className="section-kicker border-b border-border bg-secondary/60 px-4 py-2 uppercase tracking-wide text-primary">
              {t("complianceExpiry.bell.escalationsSection")}
            </div>
          )}
          {(escalations.data ?? []).map((e) => {
            const when = relativeTime(e.created_at, language);
            return (
              <div key={e.id} className="border-b border-border p-3 last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{e.title}</div>
                    {when ? <div className="mt-1 text-xs text-muted-foreground">{when}</div> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => ack.mutate(e.id)}
                    className="shrink-0 text-xs font-medium text-foreground hover:underline"
                  >
                    {t("common.resolve")}
                  </button>
                </div>
              </div>
            );
          })}
          {(inbox.isLoading || escalations.isLoading) &&
            inboxItems.length === 0 &&
            escalationCount === 0 &&
            complianceCount === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">{t("inbox.loading")}</div>
            )}
          {!inbox.isLoading &&
            !escalations.isLoading &&
            inboxItems.length === 0 &&
            escalationCount === 0 &&
            complianceCount === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">{t("inbox.empty")}</div>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
