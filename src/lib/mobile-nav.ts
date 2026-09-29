import type { Capability } from "@/lib/rbac";

export type MobileTabId = "home" | "sites" | "tasks" | "more";

export type MobileTabDef = {
  id: MobileTabId;
  href: string | null;
  labelKey: string;
  /** When set, tab is hidden unless the role can do this. `more` has no capability gate. */
  capability: Capability | null;
};

/**
 * Phone bottom nav. JARVIS is omitted until a real route exists.
 * CSS-visible below `md`, not JS matchMedia.
 */
export const MOBILE_TABS: readonly MobileTabDef[] = [
  { id: "home", href: "/", labelKey: "nav.tabs.home", capability: "dashboard.view" },
  { id: "sites", href: "/branches", labelKey: "nav.tabs.sites", capability: "branches.view_pnl" },
  { id: "tasks", href: "/tasks", labelKey: "nav.tabs.tasks", capability: "tasks.view" },
  { id: "more", href: null, labelKey: "nav.tabs.more", capability: null },
] as const;

export function isSitesPath(pathname: string): boolean {
  return pathname === "/branches" || pathname.startsWith("/branches/");
}

export function isTasksPath(pathname: string): boolean {
  return pathname === "/tasks" || pathname.startsWith("/tasks/");
}

/** Which bottom-nav tab should light up for this route (excl. sheet-only "more"). */
export function getActiveMobileTab(pathname: string): Exclude<MobileTabId, "more"> | null {
  if (pathname === "/") return "home";
  if (isSitesPath(pathname)) return "sites";
  if (isTasksPath(pathname)) return "tasks";
  return null;
}

export function isMobileTabActive(id: MobileTabId, pathname: string, moreOpen = false): boolean {
  if (id === "more") return moreOpen || getActiveMobileTab(pathname) === null;
  return getActiveMobileTab(pathname) === id;
}
