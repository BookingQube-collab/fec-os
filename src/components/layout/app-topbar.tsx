"use client";

import {
  Bell,
  Globe,
  HelpCircle,
  Keyboard,
  LogOut,
  Search,
  User,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAppStore } from "@/stores/app-store";
import { translateRole, type SupportedLanguage } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useSites } from "@/hooks/queries/useSites";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { BitsShine } from "@/components/layout/bits-shine";
import { NotificationBell } from "@/components/layout/notification-bell";
import { usesOpsCommandSubtitle } from "@/lib/topbar-identity";
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

export function AppTopbar() {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const surgeMode = useAppStore((s) => s.surgeMode);
  const setSurgeMode = useAppStore((s) => s.setSurgeMode);
  const currentLocationId = useAppStore((s) => s.currentLocationId);
  const setCurrentLocationId = useAppStore((s) => s.setCurrentLocationId);
  const { user, profile, roles, signOut } = useAuth();
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
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

  const locations = useSites({ enabled: !!user && sitesRequested });

  useEffect(() => {
    if (!currentLocationId || !locations.data) return;
    const stillActive = locations.data.some((loc) => loc.id === currentLocationId && loc.status === "active");
    if (!stillActive) setCurrentLocationId(null);
  }, [currentLocationId, locations.data, setCurrentLocationId]);

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
  const showOpsCommand = usesOpsCommandSubtitle(roles[0]?.role);


  return (
    <header
      className={cn(
        // Desktop/tablet chrome only — phone uses MobileAppHeader (CSS, not matchMedia).
        "hidden flex-col gap-3 px-0.5 pt-0.5 md:flex",
        surgeMode ? "pb-2" : "pb-4",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              className={cn(
                "page-title min-w-0 max-w-full truncate",
                surgeMode && "text-[1.35rem]",
              )}
            >
              <BitsShine
                text={
                  language === "ar"
                    ? `${t(greetingKey())}، ${displayName}`
                    : `${t(greetingKey())}, ${displayName}`
                }
              />
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
              : showOpsCommand
                ? t("layout.commandCenterWithRole", { role: primaryRole })
                : primaryRole}
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
              surgeMode &&
                "border-rose-600 bg-rose-600 text-white hover:bg-rose-500 hover:text-white",
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
            className="hidden h-9 gap-1.5 px-2.5 text-xs font-semibold sm:inline-flex"
            onClick={toggleLanguage}
            title={t("common.language")}
            aria-label={t("common.language")}
          >
            <Globe className="h-4 w-4" />
            {language === "en" ? "العربية" : "English"}
          </Button>

          <Popover
            open={helpOpen}
            onOpenChange={setHelpOpen}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t("common.help")}
                aria-label={t("common.help")}
              >
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

          <NotificationBell dismissed={helpOpen} onOpen={() => setHelpOpen(false)} />

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
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User className="h-4 w-4" />
                  {t("common.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                <LogOut className="h-4 w-4" />
                {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/** @deprecated Use AppTopbar — kept for backward compatibility */
export const TopBar = AppTopbar;
