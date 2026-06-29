"use client";

import { Bell, ChevronDown, Globe, HelpCircle, LogOut, Search, ShieldAlert, User, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { useAppStore } from "@/stores/app-store";
import { applyLanguageToDocument, type SupportedLanguage } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { useEscalations } from "@/hooks/queries/useNotifications";
import { useComplianceExpiryNotifications } from "@/hooks/queries/useComplianceExpiryNotifications";
import { canViewComplianceExpiryAlerts } from "@/lib/compliance/compliance-expiry-access";
import { queryKeys } from "@/lib/query-keys";
import { ackEscalation } from "@/lib/notifications.functions";
import type { AppRole } from "@/lib/rbac";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
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
  const [sitesRequested, setSitesRequested] = useState(false);

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

  const escalations = useEscalations({
    enabled: !!user && bellOpen,
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

  const escalationCount = escalations.data?.length ?? 0;
  const complianceCount = complianceSummary.data?.summary.total ?? 0;
  const unread = escalationCount + complianceCount;

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

  const toggleLanguage = () => {
    const next: SupportedLanguage = language === "en" ? "ar" : "en";
    setLanguage(next);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  const requestSites = () => setSitesRequested(true);

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "User";
  const initials = (profile?.display_name ?? user?.email ?? "?")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const primaryRole = roles[0]?.role.replace(/_/g, " ");

  return (
    <header className="flex flex-wrap items-center gap-4 px-1 pb-4 pt-1 md:px-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <h1 className="text-xl font-bold text-[#111827] md:text-2xl">
            {greeting()}, {displayName}
          </h1>
          <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
        </div>
        <p className="text-sm text-[#9CA3AF]">FEC Operations Command · {primaryRole ?? "Dashboard"}</p>
      </div>

      <div className="relative hidden min-w-[200px] flex-1 lg:block lg:max-w-md">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          className="h-11 w-full rounded-full border border-white/80 bg-white/80 ps-11 pe-4 text-sm text-[#111827] shadow-[inset_0_1px_4px_rgba(0,0,0,0.04)] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]/30"
          placeholder="Search here"
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={currentLocationId ?? ""}
          onChange={(e) => setCurrentLocationId(e.target.value || null)}
          onFocus={requestSites}
          onMouseDown={requestSites}
          className="hidden h-10 max-w-[160px] truncate rounded-full border border-white/80 bg-white/80 px-3 text-xs text-[#111827] shadow-sm sm:block"
        >
          <option value="">{t("common.allBranches")}</option>
          {(locations.data ?? [])
            .filter((l) => l.status === "active")
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
        </select>

        <button
          type="button"
          onClick={() => setSurgeMode(!surgeMode)}
          className={
            "hidden h-10 w-10 items-center justify-center rounded-full border bg-white/80 shadow-sm sm:inline-flex " +
            (surgeMode ? "border-amber-300 text-amber-600" : "border-white/80 text-[#9CA3AF]")
          }
          title={t("common.surgeMode")}
        >
          <Zap className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={toggleLanguage}
          className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-[#9CA3AF] shadow-sm sm:inline-flex"
        >
          <Globe className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-[#9CA3AF] shadow-sm hover:text-[#6366F1]"
          title="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <Popover open={bellOpen} onOpenChange={setBellOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/80 text-[#9CA3AF] shadow-sm hover:text-[#6366F1]"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#EF4444] px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 rounded-2xl border-white/60 bg-white p-0">
            <div className="border-b border-[#EEF0FF] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#9CA3AF]">
              {t("complianceExpiry.bell.header", { count: unread })}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {showComplianceAlerts && complianceCount > 0 && (
                <>
                  <div className="flex items-center justify-between border-b border-[#EEF0FF] bg-[#FFF7ED] px-4 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      {t("complianceExpiry.bell.complianceSection")}
                    </span>
                    <Link
                      href="/compliance/expiry-alerts"
                      className="text-[10px] font-medium text-[#6366F1] hover:underline"
                      onClick={() => setBellOpen(false)}
                    >
                      {t("complianceExpiry.banner.viewAll")}
                    </Link>
                  </div>
                  {(complianceAlerts.data?.items ?? []).map((item) => (
                    <Link
                      key={item.id}
                      href={item.actionUrl}
                      onClick={() => setBellOpen(false)}
                      className="block border-b border-[#EEF0FF] p-3 last:border-b-0 hover:bg-[#FAFAFF]"
                    >
                      <div className="flex items-start gap-2">
                        <ShieldAlert
                          className={
                            "mt-0.5 h-3.5 w-3.5 shrink-0 " +
                            (item.severity === "expired" || item.severity === "critical"
                              ? "text-red-500"
                              : "text-amber-500")
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[#111827]">{item.title}</div>
                          <div className="mt-0.5 truncate text-[10px] text-[#9CA3AF]">
                            {item.locationLabel}
                            {item.subtitle ? ` · ${item.subtitle}` : ""}
                          </div>
                          <div className="mt-1 text-[10px] font-medium text-[#6366F1]">
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
                    <div className="border-b border-[#EEF0FF] p-4 text-center text-xs text-[#9CA3AF]">
                      {t("complianceExpiry.bell.loading")}
                    </div>
                  )}
                </>
              )}

              {escalationCount > 0 && (
                <div className="border-b border-[#EEF0FF] bg-[#F8FAFF] px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#6366F1]">
                  {t("complianceExpiry.bell.escalationsSection")}
                </div>
              )}
              {(escalations.data ?? []).map((e) => (
                <div key={e.id} className="border-b border-[#EEF0FF] p-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#111827]">{e.title}</div>
                      <div className="mt-1 text-[10px] text-[#9CA3AF]">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => ack.mutate(e.id)}
                      className="shrink-0 text-[11px] text-[#6366F1] hover:underline"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
              {escalations.isLoading && complianceAlerts.isLoading && (
                <div className="p-6 text-center text-xs text-[#9CA3AF]">{t("complianceExpiry.bell.loading")}</div>
              )}
              {!escalations.isLoading &&
                !complianceAlerts.isLoading &&
                escalationCount === 0 &&
                complianceCount === 0 && (
                  <div className="p-6 text-center text-xs text-[#9CA3AF]">{t("complianceExpiry.bell.empty")}</div>
                )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-br from-[#8B5CF6] to-[#3B82F6] text-xs font-bold text-white shadow-md"
            >
              {initials || <User className="h-4 w-4" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl border-white/60 bg-white">
            <DropdownMenuLabel>
              <div className="font-medium">{profile?.display_name ?? user?.email}</div>
              {primaryRole && <div className="text-[10px] uppercase text-[#9CA3AF]">{primaryRole}</div>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="me-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** @deprecated Use AppTopbar — kept for backward compatibility */
export const TopBar = AppTopbar;
