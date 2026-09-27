"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { GlobalComplianceExpiryBanner } from "@/components/compliance/global-compliance-expiry-banner";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { EmployeeMobileHeader } from "./employee-app-shell";
import { MobileAppHeader } from "./mobile-app-header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SitesPrefetch } from "@/components/providers/data-providers";
import { useNavigationPerf } from "@/hooks/use-navigation-perf";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";
import { useUserRoles } from "@/hooks/use-auth";
import { isEmployeeHomeAudience } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const HrFieldSync = dynamic(
  () => import("@/components/attendance-hr/hr-field-sync").then((m) => m.HrFieldSync),
  { ssr: false },
);

/** /hr/me keeps this shell on desktop. Phone swaps ops chrome for the employee header. */
function isEmployeeHome(pathname: string) {
  return pathname === "/hr/me" || pathname.startsWith("/hr/me/");
}

export function AppShell({ children }: { children: ReactNode }) {
  useNavigationPerf();
  const pathname = usePathname();
  const employeeRoute = isEmployeeHome(pathname);
  const employeeAudience = isEmployeeHomeAudience(useUserRoles());
  const employeeChrome = employeeRoute || (employeeAudience && pathname === "/");
  const sidebarExpanded = useAppStore((s) => s.sidebarExpanded);
  const surgeMode = useAppStore((s) => s.surgeMode);
  return (
    <div className="min-h-screen text-foreground" data-surge-mode={surgeMode ? "true" : "false"}>
      <SitesPrefetch />
      <HrFieldSync />
      <AppSidebar />
      <div
        className={cn(
          "relative z-0 flex min-h-screen min-w-0 max-w-full flex-col overflow-x-hidden md:pe-5",
          employeeChrome ? "pb-[max(1.25rem,env(safe-area-inset-bottom))]" : "pb-20",
          sidebarExpanded ? "md:ms-[16.25rem]" : "md:ms-[5.25rem]",
          surgeMode ? "md:pb-3" : "md:pb-6",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-3 md:px-4",
            surgeMode ? "md:pt-3" : "md:pt-5",
          )}
        >
          {employeeChrome ? <EmployeeMobileHeader /> : <MobileAppHeader />}
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
      {employeeChrome ? null : <MobileBottomNav />}
    </div>
  );
}
