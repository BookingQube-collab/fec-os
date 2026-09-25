import type { Capability } from "@/lib/rbac";

export type MobileTabId = "home" | "people" | "attendance" | "operations" | "more";

export type MobileTabDef = {
  id: MobileTabId;
  href: string | null;
  labelKey: string;
  /** When set, tab is hidden unless the role can do this. `more` has no capability gate. */
  capability: Capability | null;
};

/** Fixed phone bottom-nav slots — CSS-visible below `md`, not JS matchMedia. */
export const MOBILE_TABS: readonly MobileTabDef[] = [
  { id: "home", href: "/", labelKey: "nav.tabs.home", capability: "dashboard.view" },
  { id: "people", href: "/people", labelKey: "nav.tabs.people", capability: "people.view_roster" },
  {
    id: "attendance",
    href: "/people/attendance",
    labelKey: "nav.tabs.attendance",
    capability: "attendance.view",
  },
  {
    id: "operations",
    href: "/daily-ops",
    labelKey: "nav.tabs.operations",
    capability: "daily_ops.view",
  },
  { id: "more", href: null, labelKey: "nav.tabs.more", capability: null },
] as const;

export function isAttendancePath(pathname: string): boolean {
  return pathname === "/people/attendance" || pathname.startsWith("/people/attendance/");
}

export function isPeoplePath(pathname: string): boolean {
  if (pathname === "/people") return true;
  if (!pathname.startsWith("/people/")) return false;
  return !isAttendancePath(pathname);
}

export function isOperationsPath(pathname: string): boolean {
  if (pathname === "/daily-ops" || pathname.startsWith("/daily-ops/")) return true;
  if (pathname.startsWith("/operations/")) return true;
  return false;
}

/** Which bottom-nav tab should light up for this route (excl. sheet-only "more"). */
export function getActiveMobileTab(pathname: string): Exclude<MobileTabId, "more"> | null {
  if (pathname === "/") return "home";
  if (isAttendancePath(pathname)) return "attendance";
  if (isPeoplePath(pathname)) return "people";
  if (isOperationsPath(pathname)) return "operations";
  return null;
}

export function isMobileTabActive(id: MobileTabId, pathname: string, moreOpen = false): boolean {
  if (id === "more") return moreOpen || getActiveMobileTab(pathname) === null;
  return getActiveMobileTab(pathname) === id;
}
