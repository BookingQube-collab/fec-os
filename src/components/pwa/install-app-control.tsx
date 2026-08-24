"use client";

import { Download, Share } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

function IosInstallDialog() {
  const { t } = useTranslation();
  const { iosHelpOpen, setIosHelpOpen } = usePwaInstall();

  return (
    <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pwa.iosTitle")}</DialogTitle>
          <DialogDescription>{t("pwa.iosBody")}</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 ps-5 text-sm text-foreground">
          <li>{t("pwa.iosShare")}</li>
          <li>{t("pwa.iosAdd")}</li>
        </ol>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setIosHelpOpen(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InstallAppDialogHost() {
  return <IosInstallDialog />;
}

export function InstallAppChip({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { showInstall, canPrompt, isIos, promptInstall, setIosHelpOpen } = usePwaInstall();

  if (!showInstall) return null;

  const onClick = () => {
    if (canPrompt) void promptInstall();
    else if (isIos) setIosHelpOpen(true);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={t("pwa.installApp")}
      className={
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-semibold text-foreground shadow-elevated-xs transition-colors hover:border-border hover:bg-secondary " +
        className
      }
    >
      {isIos && !canPrompt ? <Share className="h-3.5 w-3.5 stroke-[1.5]" /> : <Download className="h-3.5 w-3.5 stroke-[1.5]" />}
      <span className="hidden sm:inline">{t("pwa.installApp")}</span>
    </button>
  );
}

export function InstallAppMenuItem() {
  const { t } = useTranslation();
  const { showInstall, canPrompt, isIos, promptInstall, setIosHelpOpen } = usePwaInstall();

  if (!showInstall) return null;

  return (
    <DropdownMenuItem
      onClick={() => {
        if (canPrompt) void promptInstall();
        else if (isIos) setIosHelpOpen(true);
      }}
    >
      {isIos && !canPrompt ? <Share className="me-2 h-4 w-4" /> : <Download className="me-2 h-4 w-4" />}
      {isIos && !canPrompt ? t("pwa.addToHomeScreen") : t("pwa.installPlatform")}
    </DropdownMenuItem>
  );
}

export function InstallAppAdminCard() {
  const { t } = useTranslation();
  const { showInstall, isStandalone, canPrompt, isIos, promptInstall, setIosHelpOpen } = usePwaInstall();

  if (isStandalone) {
    return (
      <div className="rounded-[1.5rem] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-elevated-xs">
        {t("pwa.installed")}
      </div>
    );
  }

  if (!showInstall) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-border bg-card px-4 py-3 shadow-elevated-xs">
      <div>
        <div className="text-sm font-semibold text-foreground">{t("pwa.installPlatform")}</div>
        <p className="text-xs text-muted-foreground">{t("pwa.adminHint")}</p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={() => {
          if (canPrompt) void promptInstall();
          else if (isIos) setIosHelpOpen(true);
        }}
      >
        {isIos && !canPrompt ? t("pwa.addToHomeScreen") : t("pwa.installApp")}
      </Button>
    </div>
  );
}
