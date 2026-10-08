"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { GlobalComplianceExpiryBanner } from "@/components/compliance/global-compliance-expiry-banner";
import { AuroraBackdrop } from "@/components/layout/aurora-backdrop";
import ClickSpark from "@/components/react-bits/click-spark";
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

/** Employee home and /hr/me use the employee phone header. Footer stays the shared bottom nav. */
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
  const chatRoute = pathname === "/chat";
  const accountRoute = pathname === "/profile";
  return (
    <ClickSpark sparkColor="#1a1a1a" sparkSize={8} sparkRadius={14} sparkCount={8} className="min-h-screen">
    <div
      className="relative min-h-screen text-foreground"
      data-surge-mode={surgeMode ? "true" : "false"}
    >
      <AuroraBackdrop className="fixed inset-x-0 top-0 z-0 h-[42vh]" />
      <SitesPrefetch />
      <HrFieldSync />
      <AppSidebar />
      <div
        className={cn(
          "relative z-[1] flex min-h-screen min-w-0 max-w-full flex-col overflow-x-hidden md:pe-5",
          chatRoute
            ? "h-dvh overflow-hidden pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-4"
            : "pb-20",
          sidebarExpanded ? "md:ms-[5.25rem] lg:ms-[16.25rem]" : "md:ms-[5.25rem]",
          surgeMode ? "md:pb-3" : "md:pb-6",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full min-w-0 max-w-[1600px] flex-1 px-4 pt-3 md:px-4",
            surgeMode ? "md:pt-3" : "md:pt-5",
            chatRoute && "flex min-h-0 flex-col overflow-hidden",
          )}
        >
          {employeeChrome ? <EmployeeMobileHeader /> : <MobileAppHeader />}
          <AppTopbar />
          <GlobalComplianceExpiryBanner />
          <DashboardPanel
            className={cn(
              "min-w-0 max-w-full overflow-x-hidden",
              chatRoute
                ? "flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:min-h-[calc(100vh-8rem)] md:p-7"
                : "min-h-[calc(100vh-8rem)]",
              surgeMode ? "mt-2 p-3 md:p-4" : chatRoute ? "mt-2 md:mt-4" : "mt-4",
              accountRoute && "account-hub-shell",
            )}
          >
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </DashboardPanel>
        </div>
      </div>
      <MobileBottomNav />
    </div>
    </ClickSpark>
  );
}
