"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { CallCenterShellSoftphone } from "@/components/call-center/call-center-shell-softphone";
import { GlobalComplianceExpiryBanner } from "@/components/compliance/global-compliance-expiry-banner";
import { AuroraBackdrop } from "@/components/layout/aurora-backdrop";
import { NotificationToastHost } from "@/components/layout/notification-toast-host";
import { AsciiPageReveal } from "@/components/loading/ascii-page-reveal";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { EmployeeMobileHeader } from "./employee-app-shell";
import { MobileAppHeader } from "./mobile-app-header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { SitesPrefetch } from "@/components/providers/data-providers";
import { useNavigationPerf } from "@/hooks/use-navigation-perf";
import { AppErrorBoundary } from "@/components/diagnostics/error-boundary";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useUserRoles } from "@/hooks/use-auth";
import { mayMountShellFx } from "@/lib/shell-fx";
import { isEmployeeHomeAudience } from "@/lib/rbac";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

const HrFieldSync = dynamic(
  () => import("@/components/attendance-hr/hr-field-sync").then((m) => m.HrFieldSync),
  { ssr: false },
);

/**
 * Overlay sparks only — never wrap the shell. A dynamic parent wrapper blanked
 * the whole app while the chunk loaded and remounted People on toggle/route change.
 */
const ShellClickSparks = dynamic(
  () => import("@/components/layout/shell-click-sparks").then((m) => m.ShellClickSparks),
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
  const shellFxEnabled = useAppStore((s) => s.shellFxEnabled);
  const prefersReducedMotion = usePrefersReducedMotion();
  const showShellFx = mayMountShellFx({
    pathname,
    shellFxEnabled,
    prefersReducedMotion,
  });
  const chatRoute = pathname === "/chat" || pathname === "/ember" || pathname.startsWith("/ember/");
  const accountRoute = pathname === "/profile";

  return (
    <CallCenterShellSoftphone>
      <div
        className={cn(
          "relative w-full max-w-full overflow-x-clip text-foreground",
          "min-h-screen lg:min-h-screen",
          "max-lg:flex max-lg:h-dvh max-lg:max-h-dvh max-lg:min-h-0 max-lg:flex-col max-lg:overflow-hidden",
        )}
        data-fec-app-shell
        data-surge-mode={surgeMode ? "true" : "false"}
        data-shell-fx={showShellFx ? "on" : "off"}
      >
        {showShellFx ? <AuroraBackdrop className="fixed inset-x-0 top-0 z-0 h-[42vh]" /> : null}
        <SitesPrefetch />
        <HrFieldSync />
        <NotificationToastHost />
        <AppSidebar />
        <div
          className={cn(
            "relative z-[1] flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-clip lg:min-h-screen lg:pe-5",
            "max-lg:h-full max-lg:overflow-hidden",
            "pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-4",
            sidebarExpanded ? "lg:ms-[16.25rem]" : "lg:ms-[5.25rem]",
            surgeMode ? "lg:pb-3" : "lg:pb-6",
          )}
        >
          <div
            className={cn(
              "mx-auto flex w-full min-h-0 min-w-0 max-w-[1600px] flex-1 flex-col px-4 pt-2 md:px-4",
              surgeMode ? "md:pt-3" : "md:pt-5",
              "max-lg:overflow-hidden",
            )}
          >
            <div className="shrink-0">
              {employeeChrome ? <EmployeeMobileHeader /> : <MobileAppHeader />}
              <AppTopbar />
            </div>
            <div
              className={cn(
                "min-h-0 min-w-0 flex-1",
                chatRoute
                  ? "flex flex-col overflow-hidden"
                  : "max-lg:overflow-y-auto max-lg:overscroll-contain",
              )}
            >
              <GlobalComplianceExpiryBanner />
              <DashboardPanel
                className={cn(
                  "min-w-0 max-w-full overflow-x-hidden",
                  chatRoute
                    ? "flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden p-3 lg:p-7"
                    : "min-h-[calc(100vh-8rem)] max-lg:min-h-0",
                  surgeMode ? "mt-2 p-3 md:p-4" : chatRoute ? "mt-2 md:mt-4" : "mt-4",
                  accountRoute && "account-hub-shell",
                )}
              >
                <AppErrorBoundary>
                  <AsciiPageReveal
                    className={cn("min-h-0 w-full", chatRoute && "flex min-h-0 flex-1 flex-col")}
                  >
                    {children}
                  </AsciiPageReveal>
                </AppErrorBoundary>
              </DashboardPanel>
            </div>
          </div>
        </div>
        <MobileBottomNav />
        {showShellFx ? <ShellClickSparks /> : null}
      </div>
    </CallCenterShellSoftphone>
  );
}
