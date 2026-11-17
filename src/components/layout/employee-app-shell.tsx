"use client";

import Link from "next/link";
import { BookOpen, Globe, LogOut, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MOBILE_APP_BAR_CLASS } from "@/components/layout/mobile-app-header";
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

/**
 * Phone header for employee access and /hr/me.
 * Hidden from `md` up — desktop uses AppSidebar + AppTopbar.
 * CSS only (`md:hidden`); do not gate on matchMedia.
 */
export function EmployeeMobileHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  const toggleLanguage = () => {
    const next: SupportedLanguage = language === "en" ? "ar" : "en";
    setLanguage(next);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/auth");
  };

  return (
    <header
      className={MOBILE_APP_BAR_CLASS}
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
    >
      <div className="flex h-11 min-h-11 w-full items-center gap-2 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold leading-tight tracking-tight text-foreground">
            {t("hr.me.title")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
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
                <Link href="/">{t("hr.me.opsConsole")}</Link>
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
    </header>
  );
}