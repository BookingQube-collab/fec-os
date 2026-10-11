"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { loadEnglishCatalog } from "@/i18n";
import { useEnglishCatalog } from "@/i18n/use-english-catalog";

if (typeof window !== "undefined") {
  void loadEnglishCatalog();
}

function AuthShellSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-3">
        <Skeleton className="mx-auto h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
      </div>
    </div>
  );
}

export function ProtectedGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, roles, rolesSettled } = useAuth();
  const catalog = useEnglishCatalog();
  const router = useRouter();
  const shellReady = useRef(false);

  if (user && roles.length > 0 && catalog.ready) {
    shellReady.current = true;
  }
  if (!user && !loading) {
    shellReady.current = false;
  }

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [loading, user, router]);

  // Once shown, keep the shell mounted. Soft re-auth must not flash skeleton and
  // remount route trees (attendance matrix refetch / filter state loss).
  // Catalog must be in memory first so nav labels are not raw keys like people.title.
  if (shellReady.current && user && catalog.ready) {
    return <AppShell>{children}</AppShell>;
  }

  if (!loading && user && rolesSettled && roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">{t("auth.accessPending")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.accessPendingBody")}</p>
        </div>
      </div>
    );
  }

  if (!loading && user && rolesSettled && catalog.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">{t("errors.somethingWrong")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("errors.unexpected")}</p>
          <button
            type="button"
            className="mt-4 text-sm font-medium text-foreground underline"
            onClick={() => void loadEnglishCatalog()}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  // Wait for auth + role hydration and the English catalog. Empty roles before settle is unknown.
  if (loading || !user || !rolesSettled || !catalog.ready) {
    return <AuthShellSkeleton />;
  }

  return <AppShell>{children}</AppShell>;
}
