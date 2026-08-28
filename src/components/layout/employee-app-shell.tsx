"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { applyLanguageToDocument, type SupportedLanguage } from "@/i18n";
import { useAppStore } from "@/stores/app-store";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";
import { HrFieldSync } from "@/components/attendance-hr/hr-field-sync";

export function EmployeeAppShell({ children }: { children: ReactNode }) {
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
    <div className="min-h-dvh bg-background text-foreground">
      <HrFieldSync />
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("hr.me.brand")}</p>
            <p className="text-sm font-semibold">{t("hr.me.title")}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={toggleLanguage}>
              {language === "en" ? "AR" : "EN"}
            </Button>
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link href="/">{t("hr.me.opsConsole")}</Link>
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void signOut()}>
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4 pb-10">
        <AppErrorBoundary>{children}</AppErrorBoundary>
      </main>
    </div>
  );
}
