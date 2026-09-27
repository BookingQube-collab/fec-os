"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { applyLanguageToDocument, type SupportedLanguage } from "@/i18n";
import { useAppStore } from "@/stores/app-store";

/**
 * Phone chrome for /hr/me. Hidden from `md` up — desktop uses AppSidebar + AppTopbar.
 * CSS only (`md:hidden`); do not gate on matchMedia.
 */
export function EmployeeMobileHeader() {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const toggleLanguage = () => {
    const next: SupportedLanguage = language === "en" ? "ar" : "en";
    setLanguage(next);
    void i18n.changeLanguage(next);
    applyLanguageToDocument(next);
  };

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-2 border-b border-border/70 bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("hr.me.brand")}
          </p>
          <p className="truncate text-sm font-bold tracking-tight">{t("hr.me.title")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-9 px-2" onClick={toggleLanguage}>
            {language === "en" ? "AR" : "EN"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-9 px-2" asChild>
            <Link href="/">{t("hr.me.opsConsole")}</Link>
          </Button>
          <Button type="button" size="sm" variant="secondary" className="h-9 px-2" onClick={() => void signOut()}>
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    </header>
  );
}
