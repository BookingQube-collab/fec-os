"use client";

import Link from "next/link";
import { BookOpen, Globe, LogOut, MoreHorizontal, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { HeaderSearch } from "@/components/layout/header-search";
import { MobileNotificationBell } from "@/components/layout/mobile-notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import type { SupportedLanguage } from "@/i18n";
import { OPS_MANUAL_URL } from "@/lib/ops-manual";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

/**
 * Shared phone app-bar chrome (also used by employee header).
 * Not sticky: AppShell keeps headers in a shrink-0 chrome strip above the sole scroll region.
 */
export const MOBILE_APP_BAR_CLASS =
  "z-40 -mx-4 shrink-0 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/80 md:hidden";

/**
 * Phone-only top chrome. Visibility is CSS (`md:hidden`) — never gated on JS breakpoints.
 */
export function MobileAppHeader({ className }: { className?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  const toggleLanguage = () => {
    const next: SupportedLanguage = language === "en" ? "ar" : "en";
    setLanguage(next);
  };

  return (
    <header
      className={cn(MOBILE_APP_BAR_CLASS, className)}
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
    >
      <div className="flex h-11 min-h-11 w-full items-center gap-0.5 px-4">
        <Link
          href="/"
          className="min-w-0 flex-1 touch-manipulation pe-2"
          prefetch
          aria-label={t("app.name")}
        >
          <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
            {t("app.name")}
          </p>
        </Link>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 touch-manipulation"
            aria-label={t("nav.openSearch")}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Search className="h-[1.125rem] w-[1.125rem] stroke-[1.75]" aria-hidden />
          </Button>

          <MobileNotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0 touch-manipulation"
                aria-label={t("nav.more")}
              >
                <MoreHorizontal className="h-[1.125rem] w-[1.125rem] stroke-[1.75]" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={toggleLanguage}>
                <Globe className="h-4 w-4 stroke-[1.5]" aria-hidden />
                {t("common.language")}
                <span className="ms-auto text-xs text-muted-foreground">
                  {language === "en" ? "عربي" : "EN"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={OPS_MANUAL_URL} target="_blank" rel="noopener noreferrer">
                  <BookOpen className="h-4 w-4 stroke-[1.5]" aria-hidden />
                  {t("layout.helpOpsManualLink")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  void handleSignOut();
                }}
              >
                <LogOut className="h-4 w-4 stroke-[1.5]" aria-hidden />
                {t("common.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {searchOpen ? (
        <div className="border-t border-border/60 px-4 py-2">
          <HeaderSearch className="w-full min-w-0" />
        </div>
      ) : null}
    </header>
  );
}