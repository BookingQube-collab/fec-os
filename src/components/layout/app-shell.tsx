"use client";

import type { ReactNode } from "react";

import { GlobalComplianceExpiryBanner } from "@/components/compliance/global-compliance-expiry-banner";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SitesPrefetch } from "@/components/providers/data-providers";
import { useNavigationPerf } from "@/hooks/use-navigation-perf";

export function AppShell({ children }: { children: ReactNode }) {
  useNavigationPerf();
  return (
    <div className="min-h-screen bg-[#EEF0FF] text-[#111827]">
      <SitesPrefetch />
      <AppSidebar />
      <div className="flex min-h-screen flex-col pb-20 md:ms-[5.5rem] md:pb-6 md:pe-5 md:ps-2">
        <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 pt-4 md:px-2 md:pt-5">
          <AppTopbar />
          <GlobalComplianceExpiryBanner />
          <DashboardPanel className="mt-2 min-h-[calc(100vh-8rem)]">{children}</DashboardPanel>
        </div>
      </div>
    </div>
  );
}
