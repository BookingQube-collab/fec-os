"use client";

import dynamic from "next/dynamic";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { PwaInstallProvider } from "@/hooks/use-pwa-install";
import { AuthProvider } from "@/hooks/use-auth";
import { TranslationEditProvider } from "@/components/i18n/translation-edit-provider";
import { applyAppLanguage } from "@/i18n";
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
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    setHydrated(useAppStore.persist.hasHydrated());
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  useEffect(() => {
    // Ignore the English default until localStorage has restored the saved language.
    if (!hydrated) return;
    void applyAppLanguage(language);
  }, [hydrated, language]);

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
