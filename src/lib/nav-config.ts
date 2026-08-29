import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Briefcase,
  Building,
  Building2,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Code2,
  Crown,
  FileBarChart,
  FileText,
  FolderKanban,
  Gavel,
  Gauge,
  Hammer,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Package,
  Radio,
  Settings,
  Smartphone,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TicketCheck,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { canUserDo, type AppRole, type Capability } from "@/lib/rbac";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  capability: Capability;
  departmentId?: NavDepartmentId;
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
  | "commercial"
  | "guest"
  | "maintenance"
  | "compliance"
  | "utilities"
  | "admin"
  | "procurement"
  | "events";

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

const PROCUREMENT_NAV_GROUP: SidebarNavGroup = {
  id: "procurement",
  labelKey: "nav.procurement",
  icon: Wallet,
  pathPrefix: "/procurement",
  viewCapability: "procurement.view",
  items: [
    { href: "/procurement", labelKey: "nav.procurementDashboard", capability: "procurement.view" },
    { href: "/procurement/requisitions", labelKey: "nav.procurementRequisitions", capability: "procurement.view" },
    { href: "/vendors", labelKey: "nav.vendors", capability: "vendors.view" },
    { href: "/procurement/my-requests", labelKey: "nav.procurementMyRequests", capability: "procurement.create" },
    { href: "/procurement/approvals", labelKey: "nav.procurementApprovals", capability: "procurement.view" },
    { href: "/procurement/config", labelKey: "nav.procurementConfig", capability: "procurement.configure" },
  ],
};

const EVENTS_NAV_GROUP: SidebarNavGroup = {
  id: "events",
  labelKey: "nav.events",
  icon: FolderKanban,
  pathPrefix: "/events",
  viewCapability: "events.view",
  items: [
    { href: "/events", labelKey: "nav.eventsDashboard", capability: "events.view" },
    { href: "/events/list", labelKey: "nav.eventsList", capability: "events.view" },
    { href: "/events/calendar", labelKey: "nav.eventsCalendar", capability: "events.view" },
    { href: "/events/tasks", labelKey: "nav.eventsTasks", capability: "events.view" },
    { href: "/events/reports", labelKey: "nav.eventsReports", capability: "events.view" },
  ],
};

/** HR IA — ordered for daily workflow: overview → people → attendance → workforce → admin → more. */
const HR_OVERVIEW_NAV_GROUP: SidebarNavGroup = {
  id: "hr-overview",
  labelKey: "nav.hrOverview",
  icon: LayoutDashboard,
  pathPrefix: "/people/hr",
  viewCapability: "people.view_roster",
  items: [
    { href: "/people/hr", labelKey: "nav.hrDashboard", capability: "people.view_roster" },
  ],
};

const HR_STAFF_NAV_GROUP: SidebarNavGroup = {
  id: "hr-staff",
  labelKey: "nav.hrStaff",
  icon: Users,
  pathPrefix: "/people",
  viewCapability: "people.view_roster",
  items: [
    { href: "/people", labelKey: "nav.hrDirectory", capability: "people.view_roster" },
    { href: "/people/import", labelKey: "nav.importRoster", capability: "people.import_roster" },
    { href: "/people/training", labelKey: "nav.training", capability: "people.view_roster" },
  ],
};

const HR_ATTENDANCE_NAV_GROUP: SidebarNavGroup = {
  id: "hr-attendance",
  labelKey: "nav.hrAttendance",
  icon: Clock,
  pathPrefix: "/people/attendance",
  viewCapability: "attendance.view",
  items: [
    { href: "/people/attendance", labelKey: "nav.attendanceDashboard", capability: "attendance.view" },
    { href: "/people/attendance/import", labelKey: "nav.attendanceImport", capability: "attendance.import" },
    { href: "/people/attendance/reports", labelKey: "nav.attendanceListing", capability: "attendance.view" },
    { href: "/people/attendance/mapping", labelKey: "nav.attendanceMapping", capability: "attendance.view" },
    { href: "/people/attendance/corrections", labelKey: "nav.attendanceCorrections", capability: "attendance.view" },
    { href: "/people/attendance/settings", labelKey: "nav.attendanceDevices", capability: "attendance.view" },
  ],
};

const HR_WORKFORCE_NAV_GROUP: SidebarNavGroup = {
  id: "hr-workforce",
  labelKey: "nav.hrWorkforce",
  icon: Wallet,
  pathPrefix: "/people/payroll",
  viewCapability: "payroll.view",
  items: [
    { href: "/people/payroll", labelKey: "nav.hrPayroll", capability: "payroll.view" },
    { href: "/people/leave", labelKey: "nav.hrLeave", capability: "hr.leave.manage" },
    { href: "/people/field", labelKey: "nav.hrField", capability: "attendance.view" },
  ],
};

const HR_ADMIN_NAV_GROUP: SidebarNavGroup = {
  id: "hr-admin",
  labelKey: "nav.hrAdmin",
  icon: ClipboardList,
  pathPrefix: "/people/hr/documents",
  viewCapability: "hr.manage",
  items: [
    { href: "/people/hr/documents", labelKey: "nav.hrDocuments", capability: "hr.manage" },
    { href: "/people/hr/onboarding", labelKey: "nav.hrOnboarding", capability: "hr.manage" },
    { href: "/people/hr/announcements", labelKey: "nav.hrAnnouncements", capability: "hr.manage" },
    { href: "/people/hr/settings", labelKey: "nav.hrSettings", capability: "hr.manage" },
    { href: "/people/hr/reports", labelKey: "nav.hrReports", capability: "hr.manage" },
    { href: "/people/employee-app", labelKey: "nav.hrEmployeeApp", capability: "attendance.view" },
  ],
};

const HR_EMPLOYEE_NAV_GROUP: SidebarNavGroup = {
  id: "hr-employee",
  labelKey: "nav.hrEmployee",
  icon: Smartphone,
  pathPrefix: "/hr/me",
  viewCapability: "hr.employee_app",
  items: [
    { href: "/hr/me", labelKey: "nav.hrMyApp", capability: "hr.employee_app" },
  ],
};

const HR_MORE_NAV_GROUP: SidebarNavGroup = {
  id: "hr-more",
  labelKey: "nav.hrMore",
  icon: Gauge,
  pathPrefix: "/people/performance",
  viewCapability: "performance.view",
  items: [
    { href: "/people/performance", labelKey: "nav.performance", capability: "performance.view" },
    { href: "/leaderboard", labelKey: "nav.leaderboard", capability: "leaderboard.view" },
    { href: "/sop", labelKey: "nav.sop", capability: "sop.view" },
    { href: "/people/extras", labelKey: "nav.peopleExtras", capability: "people.view_roster" },
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
      { href: "/reports", labelKey: "nav.reports", icon: FileBarChart, capability: "occ.view_estate" },
      { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, capability: "tasks.view" },
      { href: "/supervisor", labelKey: "nav.supervisor", icon: ClipboardList, capability: "tasks.complete" },
      { href: "/kpi", labelKey: "nav.kpi", icon: BarChart3, capability: "kpi.view" },
      { href: "/decisions", labelKey: "nav.decisions", icon: Gavel, capability: "decision.view" },
      { href: "/notifications", labelKey: "nav.notifications", icon: Bell, capability: "notifications.view" },
    ],
  },
  {
    id: "people",
    labelKey: "nav.departments.people",
    icon: Users,
    audience: ["executive", "supervisor", "all"],
    items: [],
    groups: [
      HR_OVERVIEW_NAV_GROUP,
      HR_STAFF_NAV_GROUP,
      HR_ATTENDANCE_NAV_GROUP,
      HR_WORKFORCE_NAV_GROUP,
      HR_ADMIN_NAV_GROUP,
      HR_EMPLOYEE_NAV_GROUP,
      HR_MORE_NAV_GROUP,
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
    ],
    groups: [MAINTENANCE_NAV_GROUP],
  },
  {
    id: "commercial",
    labelKey: "nav.departments.commercial",
    icon: LineChart,
    audience: ["executive", "supervisor", "all"],
    items: [
      { href: "/revenue", labelKey: "nav.revenue", icon: LineChart, capability: "revenue.view" },
      { href: "/forecasts", labelKey: "nav.forecasts", icon: TrendingUp, capability: "forecast.view" },
    ],
  },
  {
    id: "guest",
    labelKey: "nav.departments.guest",
    icon: Briefcase,
    audience: ["executive", "supervisor", "all"],
    items: [
      { href: "/bookings", labelKey: "nav.bookings", icon: Calendar, capability: "bookings.view" },
      { href: "/customer", labelKey: "nav.customer", icon: Briefcase, capability: "customer.view_complaints" },
      { href: "/pos", labelKey: "nav.pos", icon: ShoppingCart, capability: "bookings.view" },
    ],
  },
  {
    id: "procurement",
    labelKey: "nav.departments.procurement",
    icon: Wallet,
    audience: ["executive", "supervisor", "all"],
    items: [],
    groups: [PROCUREMENT_NAV_GROUP],
  },
  {
    id: "events",
    labelKey: "nav.departments.events",
    icon: FolderKanban,
    audience: ["executive", "supervisor", "all"],
    items: [],
    groups: [EVENTS_NAV_GROUP],
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
    id: "admin",
    labelKey: "nav.departments.admin",
    icon: Settings,
    audience: ["executive", "all"],
    items: [
      { href: "/admin", labelKey: "nav.settings", icon: Settings, capability: "admin.view" },
      { href: "/admin/ai-integrations", labelKey: "nav.aiIntegrations", icon: Sparkles, capability: "admin.view" },
      { href: "/admin/diagnostics", labelKey: "nav.diagnostics", icon: HeartPulse, capability: "admin.diagnostics" },
      { href: "/admin/api-explorer", labelKey: "nav.apiExplorer", icon: Code2, capability: "admin.view" },
      { href: "/notifications/planned", labelKey: "nav.plannedNotifications", icon: BellRing, capability: "notifications.planned.view" },
    ],
    groups: [WEEKLY_REPORTS_NAV_GROUP],
  },
];

/** @deprecated Use NAV_DEPARTMENTS — legacy flat groups export */
export const SIDEBAR_NAV_GROUPS: SidebarNavGroup[] = [
  WEEKLY_REPORTS_NAV_GROUP,
  MAINTENANCE_NAV_GROUP,
  PROCUREMENT_NAV_GROUP,
  EVENTS_NAV_GROUP,
  HR_OVERVIEW_NAV_GROUP,
  HR_STAFF_NAV_GROUP,
  HR_ATTENDANCE_NAV_GROUP,
  HR_WORKFORCE_NAV_GROUP,
  HR_ADMIN_NAV_GROUP,
  HR_EMPLOYEE_NAV_GROUP,
  HR_MORE_NAV_GROUP,
];

const PRIMARY_RAIL_MAX = 8;
const ADMIN_RAIL_HREF = "/admin";

/** One representative href per department — rail construction also unique-by-departmentId. */
const PRIMARY_RAIL_ORDER: Record<NavAudience, string[]> = {
  executive: ["/", "/people", "/admin", "/revenue", "/events", "/maintenance", "/procurement", "/compliance/e3-tracker"],
  supervisor: ["/", "/people", "/events", "/maintenance", "/compliance/e3-tracker", "/procurement", "/inventory", "/admin"],
  maintenance: ["/", "/maintenance", "/inventory", "/compliance/amc-schedule", "/people", "/procurement", "/events", "/admin"],
  all: ["/", "/people", "/events", "/maintenance", "/compliance/e3-tracker", "/inventory", "/procurement", "/admin"],
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
  // Filter by child capabilities only so mixed groups (e.g. HR workforce: payroll +
  // leave + field) stay visible when the user can open any child — even if they lack
  // the group's nominal viewCapability (CFO has payroll.view but not people.view_roster).
  const items = group.items.filter((item) => canUserDo(roles, item.capability));
  if (items.length === 0) return null;
  return { ...group, items };
}

function canSeeAdminModule(roles: AppRole[]): boolean {
  return canUserDo(roles, "admin.view") || canUserDo(roles, "admin.diagnostics");
}

export interface VisibleNavDepartment extends NavDepartment {
  items: NavItem[];
  groups: SidebarNavGroup[];
}

/**
 * Capability-filtered departments with at least one visible link.
 * Audience only ranks the primary rail — it must not hide a department that
 * already has a child the role can open.
 */
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
      result.push({ ...item, departmentId: dept.id });
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
          departmentId: dept.id,
        });
      }
    }
  }

  return result;
}

const NAV_ITEM_LOOKUP = (() => {
  const map = new Map<string, NavItem>();
  for (const dept of NAV_DEPARTMENTS) {
    for (const item of dept.items) map.set(item.href, { ...item, departmentId: dept.id });
    for (const group of dept.groups ?? []) {
      for (const sub of group.items) {
        if (!map.has(sub.href)) {
          map.set(sub.href, {
            href: sub.href,
            labelKey: sub.labelKey,
            icon: group.icon,
            capability: sub.capability,
            departmentId: dept.id,
          });
        }
      }
    }
  }
  return map;
})();

function uniquePrimaryByDepartment(items: NavItem[]): PrimaryRailItem[] {
  const seen = new Set<NavDepartmentId>();
  const unique: PrimaryRailItem[] = [];
  for (const item of items) {
    if (!item.departmentId || seen.has(item.departmentId)) continue;
    seen.add(item.departmentId);
    unique.push({ ...item, departmentId: item.departmentId });
  }
  return unique;
}

/** Icon-only primary sidebar rail — one icon per department, max 8 items. */
export function getPrimaryRailNav(roles: AppRole[]): PrimaryRailItem[] {
  const audience = navAudienceForRoles(roles);
  const order = PRIMARY_RAIL_ORDER[audience];
  const visible = getAllVisibleNavItems(roles);
  const visibleHrefs = new Set(visible.map((i) => i.href));

  const picked: NavItem[] = [];
  for (const href of order) {
    if (!visibleHrefs.has(href)) continue;
    const item = NAV_ITEM_LOOKUP.get(href);
    if (item && canUserDo(roles, item.capability)) picked.push(item);
  }

  const unique = uniquePrimaryByDepartment(picked.length > 0 ? picked : visible);
  const rail = unique.slice(0, PRIMARY_RAIL_MAX);

  // Executive order used to omit /admin (already at the 8-slot cap). Pin it
  // whenever the user has admin capabilities so Settings / integrations stay reachable.
  const adminItem = NAV_ITEM_LOOKUP.get(ADMIN_RAIL_HREF);
  if (
    adminItem &&
    canSeeAdminModule(roles) &&
    visibleHrefs.has(ADMIN_RAIL_HREF) &&
    !rail.some((item) => item.departmentId === "admin")
  ) {
    const pinned: PrimaryRailItem = { ...adminItem, departmentId: "admin" };
    if (rail.length >= PRIMARY_RAIL_MAX) {
      rail[PRIMARY_RAIL_MAX - 1] = pinned;
    } else {
      rail.push(pinned);
    }
  }

  return rail;
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
  if (href === "/procurement") {
    return pathname === href;
  }
  if (href === "/procurement/requisitions") {
    return pathname === href || pathname.startsWith("/procurement/requisitions/");
  }
  if (href === "/people") {
    return pathname === href;
  }
  if (href === "/people/hr") {
    // Exact match — nested /people/hr/* belongs to HR admin items
    return pathname === href;
  }
  if (href === "/people/attendance") {
    return pathname === href;
  }
  if (href === "/events") {
    return pathname === href;
  }
  if (href === "/events/list") {
    if (pathname === href) return true;
    if (!pathname.startsWith("/events/")) return false;
    const first = pathname.slice("/events/".length).split("/")[0] ?? "";
    return first.length > 0 && !["calendar", "tasks", "new", "list", "reports"].includes(first);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSidebarNavGroupActive(
  pathPrefix: string,
  pathname: string,
  extraHrefs: string[] = [],
): boolean {
  if (pathPrefix === "/people") {
    if (pathname === "/people" || pathname.startsWith("/people/staff/") || pathname.startsWith("/people/import") || pathname.startsWith("/people/training")) {
      return true;
    }
    return extraHrefs.some(
      (href) => href !== pathPrefix && (pathname === href || pathname.startsWith(`${href}/`)),
    );
  }
  // HR dashboard root — do not treat /people/hr/documents etc. as overview
  if (pathPrefix === "/people/hr") {
    return pathname === "/people/hr";
  }
  if (pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)) return true;
  return extraHrefs.some(
    (href) => href !== pathPrefix && (pathname === href || pathname.startsWith(`${href}/`)),
  );
}

export function isDepartmentActive(dept: VisibleNavDepartment, pathname: string): boolean {
  if (dept.items.some((item) => isNavItemActive(item.href, pathname))) return true;
  return dept.groups.some((group) =>
    isSidebarNavGroupActive(
      group.pathPrefix,
      pathname,
      group.items.map((item) => item.href),
    ),
  );
}

/** Resolve the department that owns a primary-rail (or any) href for flyout subs. */
export function findDepartmentForHref(
  href: string,
  departments: VisibleNavDepartment[],
): VisibleNavDepartment | null {
  for (const dept of departments) {
    if (dept.items.some((item) => item.href === href)) return dept;
    for (const group of dept.groups) {
      if (group.pathPrefix === href) return dept;
      if (group.items.some((item) => item.href === href)) return dept;
    }
  }

  // Prefix match (e.g. deep links under a department path)
  let best: VisibleNavDepartment | null = null;
  let bestLen = -1;
  for (const dept of departments) {
    for (const item of dept.items) {
      if (isNavItemActive(item.href, href) && item.href.length > bestLen) {
        best = dept;
        bestLen = item.href.length;
      }
    }
    for (const group of dept.groups) {
      const extra = group.items.map((item) => item.href);
      if (isSidebarNavGroupActive(group.pathPrefix, href, extra) && group.pathPrefix.length > bestLen) {
        best = dept;
        bestLen = group.pathPrefix.length;
      }
    }
  }
  return best;
}

export interface RailFlyoutLink {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  capability: Capability;
  /** True when link comes from a SidebarNavGroup (use group active helpers). */
  fromGroup: boolean;
}

/** Flattened, RBAC-filtered sub-links for a primary rail icon’s flyout. */
export function getRailFlyoutLinks(
  href: string,
  departments: VisibleNavDepartment[],
): { department: VisibleNavDepartment | null; links: RailFlyoutLink[] } {
  const department = findDepartmentForHref(href, departments);
  if (!department) {
    const lone = NAV_ITEM_LOOKUP.get(href);
    if (!lone) return { department: null, links: [] };
    return {
      department: null,
      links: [{ ...lone, fromGroup: false }],
    };
  }

  const seen = new Set<string>();
  const links: RailFlyoutLink[] = [];

  for (const group of department.groups) {
    for (const sub of group.items) {
      if (seen.has(sub.href)) continue;
      seen.add(sub.href);
      links.push({
        href: sub.href,
        labelKey: sub.labelKey,
        icon: group.icon,
        capability: sub.capability,
        fromGroup: true,
      });
    }
  }
  for (const item of department.items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    links.push({ ...item, fromGroup: false });
  }

  return { department, links };
}

/** Whether a primary rail icon should show as the active module. */
export function isPrimaryRailActive(
  href: string,
  pathname: string,
  departments: VisibleNavDepartment[],
  primaryHrefs: string[] = [],
): boolean {
  if (isNavItemActive(href, pathname)) return true;

  const department = findDepartmentForHref(href, departments);
  if (!department || !isDepartmentActive(department, pathname)) return false;

  // Group-backed rail icons stay lit across their sub-routes
  for (const group of department.groups) {
    const isGroupRail =
      group.pathPrefix === href || group.items.some((item) => item.href === href);
    if (
      isGroupRail &&
      isSidebarNavGroupActive(
        group.pathPrefix,
        pathname,
        group.items.map((item) => item.href),
      )
    ) {
      return true;
    }
  }

  const deptPrimaryHrefs = primaryHrefs.filter(
    (h) => findDepartmentForHref(h, departments)?.id === department.id,
  );

  // Sole primary for this department → represent the whole module
  if (deptPrimaryHrefs.length === 1 && deptPrimaryHrefs[0] === href) return true;

  // Multiple primaries in one department: only the best path match wins
  let best: string | null = null;
  let bestLen = -1;
  for (const h of deptPrimaryHrefs) {
    if (isNavItemActive(h, pathname) && h.length > bestLen) {
      best = h;
      bestLen = h.length;
    }
  }
  return best === href;
}

export type PrimaryRailItem = NavItem & { departmentId: NavDepartmentId };

/** Flattened links for a department flyout (rail + overflow). */
export function getDepartmentFlyoutLinks(department: VisibleNavDepartment): RailFlyoutLink[] {
  const seen = new Set<string>();
  const links: RailFlyoutLink[] = [];
  for (const group of department.groups) {
    for (const sub of group.items) {
      if (seen.has(sub.href)) continue;
      seen.add(sub.href);
      links.push({
        href: sub.href,
        labelKey: sub.labelKey,
        icon: group.icon,
        capability: sub.capability,
        fromGroup: true,
      });
    }
  }
  for (const item of department.items) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    links.push({ ...item, fromGroup: false });
  }
  return links;
}

