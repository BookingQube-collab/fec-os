import {
  Activity,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileBarChart,
  FolderKanban,
  Gamepad2,
  Package,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { isSidebarNavGroupItemActive, type NavItem } from "@/lib/nav-config";

/** Presentational shell groups. Every href must already exist in nav-config. */
export type ShellGroupId =
  | "overview"
  | "sites"
  | "operations"
  | "employees"
  | "attendance"
  | "roster"
  | "maintenance"
  | "arcade"
  | "inventory"
  | "purchase"
  | "events"
  | "safety"
  | "reports"
  | "approvals"
  | "settings";

export interface ShellGroupDef {
  id: ShellGroupId;
  labelKey: string;
  icon: LucideIcon;
}

export const SHELL_GROUP_DEFS: readonly ShellGroupDef[] = [
  { id: "overview", labelKey: "nav.shell.overview", icon: Activity },
  { id: "sites", labelKey: "nav.shell.sites", icon: Building2 },
  { id: "operations", labelKey: "nav.shell.operations", icon: ClipboardList },
  { id: "employees", labelKey: "nav.shell.employees", icon: Users },
  { id: "attendance", labelKey: "nav.shell.attendance", icon: Clock },
  { id: "roster", labelKey: "nav.shell.roster", icon: CalendarRange },
  { id: "maintenance", labelKey: "nav.shell.maintenance", icon: Wrench },
  { id: "arcade", labelKey: "nav.shell.arcade", icon: Gamepad2 },
  { id: "inventory", labelKey: "nav.shell.inventory", icon: Package },
  { id: "purchase", labelKey: "nav.shell.purchaseRequests", icon: Wallet },
  { id: "events", labelKey: "nav.shell.eventsBookings", icon: FolderKanban },
  { id: "safety", labelKey: "nav.shell.safety", icon: ShieldCheck },
  { id: "reports", labelKey: "nav.shell.reports", icon: FileBarChart },
  { id: "approvals", labelKey: "nav.shell.approvals", icon: ClipboardCheck },
  { id: "settings", labelKey: "nav.shell.settings", icon: Settings },
];

function pathOf(href: string): string {
  return href.split("?")[0]?.split("#")[0] ?? href;
}

/**
 * Map a real nav href onto a shell group. Specific prefixes win.
 * Returns null only for hrefs that are not in the catalog.
 */
export function shellGroupIdForHref(href: string): ShellGroupId | null {
  const path = pathOf(href);

  if (path === "/procurement/approvals" || path === "/decisions") return "approvals";
  if (path === "/notifications/planned" || path === "/admin" || path.startsWith("/admin/")) {
    return "settings";
  }
  if (path === "/" || path === "/occ" || path.startsWith("/occ/") || path === "/ceo" || path.startsWith("/ceo/")) {
    return "overview";
  }
  if (path === "/kpi" || path.startsWith("/kpi/")) return "overview";
  if (path === "/notifications" || path.startsWith("/notifications/")) return "overview";
  if (path === "/branches" || path.startsWith("/branches/")) return "sites";
  if (path === "/people/attendance" || path.startsWith("/people/attendance/")) return "attendance";
  if (path === "/people/roster" || path.startsWith("/people/roster/") || path === "/people/import") {
    return "roster";
  }
  if (
    path === "/people" ||
    path.startsWith("/people/") ||
    path === "/hr/me" ||
    path.startsWith("/hr/me/") ||
    path === "/leaderboard" ||
    path === "/sop"
  ) {
    return "employees";
  }
  if (
    path === "/maintenance" ||
    path.startsWith("/maintenance/") ||
    path === "/facility" ||
    path.startsWith("/facility/") ||
    path === "/snags" ||
    path.startsWith("/snags/") ||
    path === "/issues" ||
    path.startsWith("/issues/")
  ) {
    return "maintenance";
  }
  if (path === "/arcade" || path.startsWith("/arcade/")) return "arcade";
  if (path === "/inventory" || path.startsWith("/inventory/")) return "inventory";
  if (path === "/procurement" || path.startsWith("/procurement/") || path === "/vendors" || path.startsWith("/vendors/")) {
    return "purchase";
  }
  if (
    path === "/events" ||
    path.startsWith("/events/") ||
    path === "/bookings" ||
    path.startsWith("/bookings/") ||
    path === "/customer" ||
    path.startsWith("/customer/") ||
    path === "/pos" ||
    path.startsWith("/pos/")
  ) {
    return "events";
  }
  if (
    path === "/compliance" ||
    path.startsWith("/compliance/") ||
    path === "/compliance-documents" ||
    path.startsWith("/compliance-documents/") ||
    path === "/compliance-calendar" ||
    path.startsWith("/compliance-calendar/")
  ) {
    return "safety";
  }
  if (
    path === "/reports" ||
    path.startsWith("/reports/") ||
    path === "/operations/weekly-reports" ||
    path.startsWith("/operations/weekly-reports/") ||
    path === "/forecasts" ||
    path.startsWith("/forecasts/") ||
    path === "/revenue" ||
    path.startsWith("/revenue/")
  ) {
    return "reports";
  }
  if (
    path === "/daily-ops" ||
    path.startsWith("/daily-ops/") ||
    path === "/tasks" ||
    path.startsWith("/tasks/") ||
    path === "/supervisor" ||
    path.startsWith("/supervisor/") ||
    path === "/operations" ||
    path.startsWith("/operations/")
  ) {
    return "operations";
  }

  return null;
}

export interface ShellGroupView extends ShellGroupDef {
  items: NavItem[];
}

/** RBAC-filtered items, ordered by SHELL_GROUP_DEFS. Unassigned stay out of the rail. */
export function groupVisibleNav(items: readonly NavItem[]): {
  groups: ShellGroupView[];
  unassigned: NavItem[];
} {
  const buckets = new Map<ShellGroupId, NavItem[]>();
  const unassigned: NavItem[] = [];

  for (const item of items) {
    const id = shellGroupIdForHref(item.href);
    if (!id) {
      unassigned.push(item);
      continue;
    }
    const list = buckets.get(id) ?? [];
    list.push(item);
    buckets.set(id, list);
  }

  const groups = SHELL_GROUP_DEFS.flatMap((def) => {
    const groupItems = buckets.get(def.id);
    if (!groupItems || groupItems.length === 0) return [];
    return [{ ...def, items: groupItems }];
  });

  return { groups, unassigned };
}

/** Longest matching catalog href wins, using the existing sidebar active rules. */
export function isShellLinkActive(
  href: string,
  pathname: string,
  hrefs: readonly string[],
): boolean {
  const matching = hrefs.filter((candidate) => isSidebarNavGroupItemActive(candidate, pathname));
  const pool = matching.length > 0 ? matching : hrefs.filter((candidate) => prefixMatch(candidate, pathname));
  let best = "";
  for (const candidate of pool) {
    const base = pathOf(candidate);
    if (base.length > best.length) best = base;
  }
  return pathOf(href) === best && best !== "";
}

function prefixMatch(href: string, pathname: string): boolean {
  const base = pathOf(href);
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}
