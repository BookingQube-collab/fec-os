import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Briefcase,
  Building,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Crown,
  FileBarChart,
  FileText,
  Gavel,
  Gauge,
  Hammer,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Medal,
  Package,
  Radio,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TicketCheck,
  TrendingUp,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  capability: Capability;
}

export interface SidebarNavGroupItem {
  href: string;
  labelKey: string;
  capability: Capability;
}

export interface SidebarNavGroup {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  pathPrefix: string;
  viewCapability: Capability;
  items: SidebarNavGroupItem[];
}

export type NavDepartmentId =
  | "operations"
  | "people"
  | "maintenance"
  | "compliance"
  | "utilities"
  | "administration";

export type NavAudience = "executive" | "supervisor" | "maintenance" | "all";

export interface NavDepartment {
  id: NavDepartmentId;
  labelKey: string;
  icon: LucideIcon;
  /** When set, department is hidden unless user matches audience or has any visible child. */
  audience?: NavAudience[];
  items: NavItem[];
  groups?: SidebarNavGroup[];
}

/** @deprecated Use getPrimaryRailNav — kept for tests and gradual migration */
export interface PrimaryNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  capability: Capability;
}

const MAINTENANCE_NAV_GROUP: SidebarNavGroup = {
  id: "maintenance",
  labelKey: "nav.maintenance",
  icon: Wrench,
  pathPrefix: "/maintenance",
  viewCapability: "maintenance.view",
  items: [
    { href: "/maintenance", labelKey: "nav.maintenanceDashboard", capability: "maintenance.view" },
    { href: "/maintenance/requests", labelKey: "nav.maintenanceRequests", capability: "maintenance.request_submit" },
    { href: "/maintenance/logistics", labelKey: "nav.maintenanceLogistics", capability: "maintenance.logistics_view" },
    { href: "/maintenance/weekly-report", labelKey: "nav.maintenanceWeeklyReport", capability: "maintenance.weekly_report" },
    { href: "/maintenance/weekly-report/review", labelKey: "nav.maintenanceWeeklyReportReview", capability: "maintenance.weekly_report.review" },
    { href: "/maintenance/weekly-report/executive", labelKey: "nav.maintenanceWeeklyReportExecutive", capability: "maintenance.weekly_report.executive" },
  ],
};

const WEEKLY_REPORTS_NAV_GROUP: SidebarNavGroup = {
  id: "weekly-reports",
  labelKey: "nav.weeklyReports",
  icon: FileBarChart,
  pathPrefix: "/operations/weekly-reports",
  viewCapability: "weekly_reports.view",
  items: [
    { href: "/operations/weekly-reports", labelKey: "nav.weeklyReportsList", capability: "weekly_reports.view" },
    { href: "/operations/weekly-reports/new", labelKey: "nav.weeklyReportsNew", capability: "weekly_reports.submit" },
    { href: "/operations/weekly-reports/review", labelKey: "nav.weeklyReportsReview", capability: "weekly_reports.review" },
    { href: "/operations/weekly-reports/executive", labelKey: "nav.weeklyReportsExecutive", capability: "weekly_reports.executive" },
  ],
};

/** Department-organized navigation — all routes preserved, grouped for sidebar & overflow. */
export const NAV_DEPARTMENTS: NavDepartment[] = [
  {
    id: "operations",
    labelKey: "nav.departments.operations",
    icon: LayoutDashboard,
    audience: ["executive", "supervisor", "all"],
    items: [
      { href: "/", labelKey: "nav.dashboard", icon: Activity, capability: "dashboard.view" },
      { href: "/occ", labelKey: "nav.occ", icon: Radio, capability: "occ.view_estate" },
      { href: "/ceo", labelKey: "nav.ceo", icon: Crown, capability: "ceo.view_dashboard" },
      { href: "/daily-ops", labelKey: "nav.dailyOps", icon: ClipboardList, capability: "daily_ops.view" },
      { href: "/branches", labelKey: "nav.sites", icon: Building2, capability: "branches.view_pnl" },
      { href: "/revenue", labelKey: "nav.revenue", icon: LineChart, capability: "revenue.view" },
      { href: "/reports", labelKey: "nav.reports", icon: FileBarChart, capability: "occ.view_estate" },
      { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, capability: "tasks.view" },
      { href: "/supervisor", labelKey: "nav.supervisor", icon: ClipboardList, capability: "tasks.complete" },
      { href: "/bookings", labelKey: "nav.bookings", icon: Calendar, capability: "bookings.view" },
      { href: "/kpi", labelKey: "nav.kpi", icon: BarChart3, capability: "kpi.view" },
      { href: "/forecasts", labelKey: "nav.forecasts", icon: TrendingUp, capability: "forecast.view" },
      { href: "/decisions", labelKey: "nav.decisions", icon: Gavel, capability: "decision.view" },
      { href: "/customer", labelKey: "nav.customer", icon: Briefcase, capability: "customer.view_complaints" },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, capability: "notifications.view" },
      { href: "/pos", labelKey: "nav.pos", icon: ShoppingCart, capability: "bookings.view" },
    ],
  },
  {
    id: "people",
    labelKey: "nav.departments.people",
    icon: Users,
    audience: ["executive", "supervisor", "all"],
    items: [
      { href: "/people", labelKey: "nav.people", icon: Users, capability: "people.view_roster" },
      { href: "/leaderboard", labelKey: "nav.leaderboard", icon: Medal, capability: "leaderboard.view" },
      { href: "/sop", labelKey: "nav.sop", icon: BookOpen, capability: "sop.view" },
    ],
  },
  {
    id: "maintenance",
    labelKey: "nav.departments.maintenance",
    icon: Wrench,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: [
      { href: "/facility", labelKey: "nav.facility", icon: Building, capability: "facility.view" },
      { href: "/snags", labelKey: "nav.snags", icon: Hammer, capability: "snags.view" },
      { href: "/issues", labelKey: "nav.issues", icon: TicketCheck, capability: "issues.view" },
      { href: "/vendors", labelKey: "nav.vendors", icon: Truck, capability: "vendors.view" },
    ],
    groups: [MAINTENANCE_NAV_GROUP],
  },
  {
    id: "compliance",
    labelKey: "nav.departments.compliance",
    icon: ShieldCheck,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: [
      { href: "/compliance/e3-tracker", labelKey: "nav.e3Tracker", icon: ShieldCheck, capability: "compliance.view" },
      { href: "/compliance/amc-schedule", labelKey: "nav.inspections", icon: ClipboardCheck, capability: "amc.view" },
      { href: "/compliance", labelKey: "nav.compliance", icon: ShieldCheck, capability: "compliance.view" },
      { href: "/compliance/dashboard", labelKey: "nav.complianceDashboard", icon: ShieldCheck, capability: "compliance.view" },
      { href: "/compliance/register", labelKey: "nav.complianceRegister", icon: FileText, capability: "compliance.view" },
      { href: "/compliance/amc-dashboard", labelKey: "nav.amcDashboard", icon: ClipboardCheck, capability: "amc.view" },
      { href: "/compliance/documents", labelKey: "nav.complianceDocumentsRegister", icon: FileText, capability: "compliance.view" },
      { href: "/compliance/expiry-alerts", labelKey: "nav.complianceExpiryAlerts", icon: AlertTriangle, capability: "compliance.view" },
      { href: "/compliance/location-tracker", labelKey: "nav.locationComplianceTracker", icon: FileText, capability: "compliance.view" },
      { href: "/compliance/risk-register", labelKey: "nav.riskRegister", icon: AlertOctagon, capability: "risk.view" },
      { href: "/compliance-documents", labelKey: "nav.complianceDocuments", icon: FileText, capability: "compliance.view" },
      { href: "/compliance-calendar", labelKey: "nav.complianceCalendar", icon: CalendarDays, capability: "compliance.calendar.view" },
    ],
  },
  {
    id: "utilities",
    labelKey: "nav.departments.utilities",
    icon: Gauge,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: [
      { href: "/operations/utilities", labelKey: "nav.utilities", icon: Gauge, capability: "utilities.view" },
      { href: "/inventory", labelKey: "nav.inventory", icon: Package, capability: "inventory.view" },
    ],
  },
  {
    id: "administration",
    labelKey: "nav.departments.administration",
    icon: Settings,
    audience: ["executive", "all"],
    items: [
      { href: "/admin", labelKey: "nav.settings", icon: Settings, capability: "admin.view" },
      { href: "/notifications/planned", labelKey: "nav.plannedNotifications", icon: BellRing, capability: "notifications.planned.view" },
    ],
    groups: [WEEKLY_REPORTS_NAV_GROUP],
  },
];

/** @deprecated Use NAV_DEPARTMENTS — legacy flat groups export */
export const SIDEBAR_NAV_GROUPS: SidebarNavGroup[] = [WEEKLY_REPORTS_NAV_GROUP, MAINTENANCE_NAV_GROUP];

const PRIMARY_RAIL_ORDER: Record<NavAudience, string[]> = {
  executive: ["/", "/occ", "/branches", "/reports", "/maintenance", "/compliance/e3-tracker", "/inventory", "/admin"],
  supervisor: ["/", "/daily-ops", "/branches", "/issues", "/snags", "/maintenance", "/compliance/e3-tracker"],
  maintenance: ["/", "/maintenance", "/maintenance/requests", "/inventory", "/compliance/amc-schedule", "/issues", "/maintenance/logistics"],
  all: ["/", "/branches", "/maintenance", "/compliance/e3-tracker", "/inventory", "/compliance/amc-schedule", "/reports"],
};

const EXECUTIVE_ROLES: AppRole[] = ["ceo", "coo", "cfo", "regional_ops"];
const SUPERVISOR_ROLES: AppRole[] = ["branch_gm", "duty_manager"];
const MAINTENANCE_ROLES: AppRole[] = ["tech_supervisor", "technician"];

/** Resolve nav audience from role assignments (Head of Ops / Supervisors / Maintenance). */
export function navAudienceForRoles(roles: AppRole[]): NavAudience {
  if (roles.some((r) => EXECUTIVE_ROLES.includes(r))) return "executive";
  if (roles.some((r) => SUPERVISOR_ROLES.includes(r))) return "supervisor";
  if (roles.some((r) => MAINTENANCE_ROLES.includes(r))) return "maintenance";
  return "all";
}

function filterNavGroup(group: SidebarNavGroup, roles: AppRole[]): SidebarNavGroup | null {
  if (!canUserDo(roles, group.viewCapability)) return null;
  const items = group.items.filter((item) => canUserDo(roles, item.capability));
  if (items.length === 0) return null;
  return { ...group, items };
}

export interface VisibleNavDepartment extends NavDepartment {
  items: NavItem[];
  groups: SidebarNavGroup[];
}

/** RBAC + audience-filtered departments with at least one visible link. */
export function getVisibleDepartments(roles: AppRole[]): VisibleNavDepartment[] {
  return NAV_DEPARTMENTS.flatMap((dept) => {
    const items = dept.items.filter((item) => canUserDo(roles, item.capability));
    const groups = (dept.groups ?? [])
      .map((g) => filterNavGroup(g, roles))
      .filter((g): g is SidebarNavGroup => g !== null);

    if (items.length === 0 && groups.length === 0) return [];

    return [{ ...dept, items, groups }];
  });
}

/** All nav items flattened from visible departments (for search, mobile grid). */
export function getAllVisibleNavItems(roles: AppRole[]): NavItem[] {
  const seen = new Set<string>();
  const result: NavItem[] = [];

  for (const dept of getVisibleDepartments(roles)) {
    for (const item of dept.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      result.push(item);
    }
    for (const group of dept.groups) {
      for (const sub of group.items) {
        if (seen.has(sub.href)) continue;
        seen.add(sub.href);
        result.push({
          href: sub.href,
          labelKey: sub.labelKey,
          icon: group.icon,
          capability: sub.capability,
        });
      }
    }
  }

  return result;
}

const NAV_ITEM_LOOKUP = (() => {
  const map = new Map<string, NavItem>();
  for (const dept of NAV_DEPARTMENTS) {
    for (const item of dept.items) map.set(item.href, item);
    for (const group of dept.groups ?? []) {
      for (const sub of group.items) {
        if (!map.has(sub.href)) {
          map.set(sub.href, {
            href: sub.href,
            labelKey: sub.labelKey,
            icon: group.icon,
            capability: sub.capability,
          });
        }
      }
    }
  }
  return map;
})();

/** Icon-only primary sidebar rail — role-prioritized shortcuts, max 8 items. */
export function getPrimaryRailNav(roles: AppRole[]): NavItem[] {
  const audience = navAudienceForRoles(roles);
  const order = PRIMARY_RAIL_ORDER[audience];
  const visible = getAllVisibleNavItems(roles);
  const visibleHrefs = new Set(visible.map((i) => i.href));

  const picked: NavItem[] = [];
  for (const href of order) {
    if (!visibleHrefs.has(href)) continue;
    const item = NAV_ITEM_LOOKUP.get(href);
    if (item && canUserDo(roles, item.capability)) picked.push(item);
    if (picked.length >= 8) break;
  }

  if (picked.length > 0) return picked;

  return visible.slice(0, 8);
}

/** @deprecated Use getPrimaryRailNav */
export const PRIMARY_NAV: PrimaryNavItem[] = [
  { href: "/", label: "Dashboard", icon: Activity, capability: "dashboard.view" },
  { href: "/branches", label: "Sites", icon: Building2, capability: "branches.view_pnl" },
  { href: "/maintenance", label: "Work Orders", icon: Wrench, capability: "maintenance.view" },
  { href: "/compliance/e3-tracker", label: "E3 Tracker", icon: ShieldCheck, capability: "compliance.view" },
  { href: "/inventory", label: "Assets", icon: Package, capability: "inventory.view" },
  { href: "/compliance/amc-schedule", label: "Inspections", icon: ClipboardCheck, capability: "amc.view" },
  { href: "/reports", label: "Reports", icon: FileBarChart, capability: "occ.view_estate" },
  { href: "/admin", label: "Settings", icon: Settings, capability: "admin.view" },
];

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Active state for weekly reports sidebar sub-routes (list vs new/review/executive/[id]). */
export function isSidebarNavGroupItemActive(href: string, pathname: string): boolean {
  if (href === "/operations/weekly-reports") {
    if (pathname === href) return true;
    const rest = pathname.slice(href.length);
    return /^\/[^/]+$/.test(rest);
  }
  if (href === "/operations/weekly-reports/new") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSidebarNavGroupActive(pathPrefix: string, pathname: string): boolean {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`);
}

export function isDepartmentActive(dept: VisibleNavDepartment, pathname: string): boolean {
  if (dept.items.some((item) => isNavItemActive(item.href, pathname))) return true;
  return dept.groups.some((group) => isSidebarNavGroupActive(group.pathPrefix, pathname));
}
