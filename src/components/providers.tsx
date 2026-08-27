"use client";

import dynamic from "next/dynamic";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Toaster } from "@/components/ui/sonner";
import { PwaInstallProvider } from "@/hooks/use-pwa-install";
import { AuthProvider } from "@/hooks/use-auth";
import { TranslationEditProvider } from "@/components/i18n/translation-edit-provider";
import { applyLanguageToDocument } from "@/i18n";
import "@/i18n";
import { getQueryClient } from "@/lib/query-client";
import { useAppStore } from "@/stores/app-store";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";
import { PasskeyEnrollDialog } from "@/components/auth/passkey-enroll-dialog";

const PwaServiceWorker = dynamic(
  () => import("@/components/pwa/pwa-service-worker").then((m) => m.PwaServiceWorker),
  { ssr: false },
);
const HrFieldSync = dynamic(
  () => import("@/components/attendance-hr/hr-field-sync").then((m) => m.HrFieldSync),
  { ssr: false },
);
const InstallAppDialogHost = dynamic(
  () => import("@/components/pwa/install-app-control").then((m) => m.InstallAppDialogHost),
  { ssr: false },
);

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const language = useAppStore((s) => s.language);
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    applyLanguageToDocument(language);
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
            <HrFieldSync />
            <Toaster richColors position={language === "ar" ? "top-left" : "top-right"} />
          </TranslationEditProvider>
        </PwaInstallProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
