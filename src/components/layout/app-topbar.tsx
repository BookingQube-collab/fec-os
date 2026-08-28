"use client";

import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCheck,
  ClipboardList,
  FileText,
  Globe,
  HelpCircle,
  Keyboard,
  LogOut,
  Search,
  ShieldAlert,
  User,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ar as arDateLocale } from "date-fns/locale";

import { useAppStore } from "@/stores/app-store";
import { applyLanguageToDocument, translateRole, type SupportedLanguage } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { useActionInbox, useEscalations } from "@/hooks/queries/useNotifications";
import { useComplianceExpiryNotifications } from "@/hooks/queries/useComplianceExpiryNotifications";
import { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
import type { InboxItemKind } from "@/lib/notifications/inbox";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { queryKeys } from "@/lib/query-keys";
import { ackEscalation, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications.functions";
import type { AppRole } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HeaderSearch } from "@/components/layout/header-search";

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return "layout.greeting.morning";
  if (h < 17) return "layout.greeting.afternoon";
  return "layout.greeting.evening";
}

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

export function AppTopbar() {
  const { t, i18n } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const surgeMode = useAppStore((s) => s.surgeMode);
  const setSurgeMode = useAppStore((s) => s.setSurgeMode);
  const currentLocationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const { user, profile, roles, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [bellOpen, setBellOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sitesRequested, setSitesRequested] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) {
      setSitesRequested(false);
      return;
    }
    const scheduleSites = () => setSitesRequested(true);
    let sitesCleanup: (() => void) | undefined;
    if (typeof requestIdleCallback !== "undefined") {
      const sitesId = requestIdleCallback(scheduleSites, { timeout: 3000 });
      sitesCleanup = () => cancelIdleCallback(sitesId);
    } else {
      const sitesTimer = window.setTimeout(scheduleSites, 3000);
      sitesCleanup = () => window.clearTimeout(sitesTimer);
    }
    return () => {
      sitesCleanup?.();
    };
  }, [user]);

  const roleList = roles.map((r) => r.role as AppRole);
  const showComplianceAlerts = canViewComplianceExpiryAlerts(roleList);

  const inbox = useActionInbox(user?.id, { enabled: !!user });
  const escalations = useEscalations({
    enabled: !!user,
  });
  const complianceAlerts = useComplianceExpiryNotifications(
    { locationId: currentLocationId, limit: 12 },
    { enabled: !!user && showComplianceAlerts && bellOpen },
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
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });

  const inboxItems = inbox.data?.items ?? [];
  const inboxUnread = inbox.data?.unreadCount ?? 0;
  const escalationCount = escalations.data?.length ?? 0;
  const complianceCount = complianceSummary.data?.summary.total ?? 0;
  const unread = inboxUnread + escalationCount + complianceCount;

  const severityLabel = useMemo(
    () =>
      ({
        expired: t("complianceExpiry.severity.expired"),
        critical: t("complianceExpiry.severity.critical"),
        warning: t("complianceExpiry.severity.warning"),
      }) as const,
    [t],
  );
  const locations = useSites({ enabled: !!user && sitesRequested });

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    applyLanguageToDocument(language);
  }, [language, i18n]);

  useEffect(() => {
    if (!bellOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBellOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [bellOpen]);

  const toggleLanguage = () => {
    const next: SupportedLanguage = language === "en" ? "ar" : "en";
    setLanguage(next);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  const requestSites = () => setSitesRequested(true);

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? t("common.user");
  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const primaryRole = translateRole(t, roles[0]?.role);

  const closeBell = () => setBellOpen(false);

  const inboxList = (
    <div className="max-h-96 overflow-y-auto">
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
              closeBell();
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
                  {!item.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
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
              onClick={closeBell}
            >
              {t("complianceExpiry.banner.viewAll")}
            </Link>
          </div>
          {(complianceAlerts.data?.items ?? []).map((item) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              onClick={closeBell}
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
  );

  return (
    <header
      ref={headerRef}
      className={cn("flex flex-col gap-3 px-0.5 pt-0.5", surgeMode ? "pb-2" : "pb-4")}
    >
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={cn("page-title truncate", surgeMode && "text-[1.35rem]")}>
              {language === "ar" ? `${t(greetingKey())}، ${displayName}` : `${t(greetingKey())}, ${displayName}`}
            </h1>
            {surgeMode ? (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {t("layout.surgeOn")}
              </span>
            ) : null}
          </div>
          <p className="page-subtitle mt-0.5">
            {surgeMode
              ? t("layout.surgeHint")
              : t("layout.commandCenterWithRole", { role: primaryRole })}
          </p>
        </div>

        <HeaderSearch />

        <div className="flex items-center gap-1.5">
          <SearchableSelect
            value={currentLocationId ?? "__all__"}
            onValueChange={(v) => setCurrentLocationId(v === "__all__" ? null : v)}
            onOpenChange={(open) => {
              if (open) requestSites();
            }}
            aria-label={t("common.allBranches")}
            className="hidden sm:block"
            triggerClassName="w-auto min-w-[12rem]"
            options={[
              { value: "__all__", label: t("common.allBranches") },
              ...(locations.data ?? [])
                .filter((l) => l.status === "active")
                .map((l) => ({
                  value: l.id,
                  label: formatLocationRecord(l),
                  keywords: `${l.code} ${l.name ?? ""} ${l.region ?? ""}`,
                })),
            ]}
          />

          <Button
            type="button"
            variant={surgeMode ? "default" : "outline"}
            size="icon"
            className={cn(
              "hidden sm:inline-flex",
              surgeMode && "border-rose-600 bg-rose-600 text-white hover:bg-rose-500 hover:text-white",
            )}
            onClick={() => setSurgeMode(!surgeMode)}
            title={t("common.surgeMode")}
            aria-label={t("common.surgeMode")}
            aria-pressed={surgeMode}
          >
            <Zap className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="hidden sm:inline-flex"
            onClick={toggleLanguage}
            title={t("common.language")}
            aria-label={t("common.language")}
          >
            <Globe className="h-4 w-4" />
          </Button>

          <Popover
            open={helpOpen}
            onOpenChange={(open) => {
              setHelpOpen(open);
              if (open) setBellOpen(false);
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="icon" title={t("common.help")} aria-label={t("common.help")}>
                <HelpCircle className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 rounded-[1.5rem] p-4">
              <div className="section-kicker uppercase tracking-wide">{t("layout.helpTitle")}</div>
              <ul className="mt-3 space-y-3 text-sm text-foreground">
                <li className="flex items-start gap-2.5">
                  <Search className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("layout.helpSearch")}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Keyboard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("layout.helpSearchShortcut")}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("layout.helpNotifications")}</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{t("layout.helpSurge")}</span>
                </li>
              </ul>
              <Link
                href="/notifications"
                className="mt-3 inline-flex text-sm font-medium text-foreground hover:underline"
                onClick={() => setHelpOpen(false)}
              >
                {t("inbox.viewAll")}
              </Link>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant={bellOpen ? "secondary" : "outline"}
            size="icon"
            className="relative"
            aria-label={t("common.notifications")}
            aria-expanded={bellOpen}
            aria-pressed={bellOpen}
            onClick={() => {
              setHelpOpen(false);
              setBellOpen((open) => !open);
            }}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="icon"
                className="overflow-hidden text-xs font-bold"
              >
                {initials || <User className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[14rem]">
              <DropdownMenuLabel>
                <div className="font-medium">{profile?.display_name ?? user?.email}</div>
                {primaryRole && (
                  <div className="section-kicker mt-0.5 uppercase tracking-wide">{primaryRole}</div>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="h-4 w-4" />
                {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bellOpen ? (
        <div className="flex justify-end">
          <div className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-elevated-md">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
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
                  onClick={closeBell}
                >
                  {t("inbox.viewAll")}
                </Link>
              </div>
            </div>
            {inboxList}
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** @deprecated Use AppTopbar — kept for backward compatibility */
export const TopBar = AppTopbar;
