"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useTranslation } from "react-i18next";

import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

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

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, roles } = useAuth();
  const router = useRouter();
  const shellReady = useRef(false);

  if (user && roles.length > 0) {
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

  if (shellReady.current && user) {
    return <AppShell>{children}</AppShell>;
  }

  if (loading || !user) {
    return <AuthShellSkeleton />;
  }

  if (roles.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">{t("auth.accessPending")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.accessPendingBody")}</p>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
