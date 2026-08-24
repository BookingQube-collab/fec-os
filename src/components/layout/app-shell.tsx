"use client";

import type { ReactNode } from "react";

import { GlobalComplianceExpiryBanner } from "@/components/compliance/global-compliance-expiry-banner";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SitesPrefetch } from "@/components/providers/data-providers";
import { useNavigationPerf } from "@/hooks/use-navigation-perf";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  useNavigationPerf();
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const surgeMode = useAppStore((s) => s.surgeMode);
  return (
    <div className="min-h-screen text-foreground" data-surge-mode={surgeMode ? "true" : "false"}>
      <SitesPrefetch />
      <AppSidebar />
      <div
        className={cn(
          "relative z-0 flex min-h-screen min-w-0 max-w-full flex-col overflow-x-hidden pb-20 md:pe-5",
          sidebarExpanded ? "md:ms-[15.5rem]" : "md:ms-[5.25rem]",
          surgeMode ? "md:pb-3" : "md:pb-6",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-3 md:px-4",
            surgeMode ? "md:pt-3" : "md:pt-5",
          )}
        >
          <AppTopbar />
          <GlobalComplianceExpiryBanner />
          <DashboardPanel
            className={cn(
              "min-h-[calc(100vh-8rem)] min-w-0 max-w-full overflow-x-hidden",
              surgeMode ? "mt-2 p-3 md:p-4" : "mt-4",
            )}
          >
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
}
