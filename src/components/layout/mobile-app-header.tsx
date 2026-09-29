"use client";

import Link from "next/link";
import { Globe, LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { HeaderSearch } from "@/components/layout/header-search";
import { MobileNotificationBell } from "@/components/layout/mobile-notification-bell";
import { useAuth } from "@/hooks/use-auth";
import type { SupportedLanguage } from "@/i18n";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
      className={cn(
        "sticky top-0 z-30 -mx-4 mb-2 border-b border-border/70 bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/" className="min-w-0 flex-1 touch-manipulation" prefetch>
          <p className="truncate text-sm font-bold tracking-tight text-foreground">
            {t("app.name")}
          </p>
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("app.tagline")}
          </p>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={t("nav.openSearch")}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className="h-4 w-4 stroke-[1.5]" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="h-10 shrink-0 gap-1 px-2 text-xs font-semibold"
          aria-label={t("common.language")}
          onClick={toggleLanguage}
        >
          <Globe className="h-4 w-4 stroke-[1.5]" />
          {language === "en" ? "عربي" : "EN"}
        </Button>

        <MobileNotificationBell />

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-9 shrink-0 px-2"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="h-4 w-4" />
          {t("common.signOut")}
        </Button>
      </div>

      {searchOpen ? (
        <div className="mt-2">
          <HeaderSearch className="w-full min-w-0" />
        </div>
      ) : null}
    </header>
  );
}
