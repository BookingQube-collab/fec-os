"use client";

import dynamic from "next/dynamic";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Toaster } from "@/components/ui/sonner";
import { PwaInstallProvider } from "@/hooks/use-pwa-install";
import { AuthProvider } from "@/hooks/use-auth";
import { TranslationEditProvider } from "@/components/i18n/translation-edit-provider";
import { applyLanguageToDocument, loadArabicLocale } from "@/i18n";
import "@/i18n";
import { getQueryClient } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";

const PwaServiceWorker = dynamic(
  () => import("@/components/pwa/pwa-service-worker").then((m) => m.PwaServiceWorker),
  { ssr: false },
);
const InstallAppDialogHost = dynamic(
  () => import("@/components/pwa/install-app-control").then((m) => m.InstallAppDialogHost),
  { ssr: false },
);
const PasskeyEnrollDialog = dynamic(
  () => import("@/components/auth/passkey-enroll-dialog").then((m) => m.PasskeyEnrollDialog),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const language = useAppStore((s) => s.language);
  const { i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      if (language === "ar") await loadArabicLocale();
      if (cancelled) return;
      if (i18n.language !== language) void i18n.changeLanguage(language);
      applyLanguageToDocument(language);
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [language, i18n]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PwaInstallProvider>
          <TranslationEditProvider>
            <AppErrorBoundary>{children}</AppErrorBoundary>
            <PasskeyEnrollDialog />
            <InstallAppDialogHost />
            <PwaServiceWorker />
            <Toaster richColors position={language === "ar" ? "top-left" : "top-right"} />
          </TranslationEditProvider>
        </PwaInstallProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
