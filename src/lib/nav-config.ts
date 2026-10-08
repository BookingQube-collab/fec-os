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
  History,
  LifeBuoy,
  Mail,
  Receipt,
  Scale,
  ScrollText,
  Archive,
  Palmtree,
  Gavel,
  Gauge,
  GripVertical,
  Hammer,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  ListChecks,
  LogOut,
  MessagesSquare,
  Package,
  Plane,
  Phone,
  Presentation,
  Radio,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TicketCheck,
  TrendingUp,
  UserRound,
  Users,
  Gamepad2,
  GraduationCap,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { canUserDo, isEmployeeHomeAudience, type AppRole, type Capability } from "@/lib/rbac";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  capability: Capability;
  /** Visible when any listed capability matches. Falls back to `capability`. */
  anyCapabilities?: readonly Capability[];
  departmentId?: NavDepartmentId;
  /** Consecutive items with the same key render under one visible section heading. */
  sectionKey?: string;
}

export interface SidebarNavGroupItem {
  href: string;
  labelKey: string;
  capability: Capability;
  /** Optional cluster inside a group. Consecutive items with the same key render together. */
  sectionKey?: string;
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
  | "arcade"
  | "compliance"
  | "utilities"
  | "admin"
  | "procurement"
  | "events"
  | "training";

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

function withSection<T extends NavItem | SidebarNavGroupItem>(
  sectionKey: string,
  items: readonly T[],
): Array<T & { sectionKey: string }> {
  return items.map((item) => ({ ...item, sectionKey }));
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

const ARCADE_NAV_GROUP: SidebarNavGroup = {
  id: "arcade",
  labelKey: "nav.arcade",
  icon: Gamepad2,
  pathPrefix: "/arcade",
  viewCapability: "arcade.view",
  items: [
    { href: "/arcade", labelKey: "nav.arcadeDashboard", capability: "arcade.view" },
    { href: "/arcade/week", labelKey: "nav.arcadeWeek", capability: "arcade.view" },
    { href: "/arcade/sites", labelKey: "nav.arcadeSites", capability: "arcade.view" },
    { href: "/arcade/faults", labelKey: "nav.arcadeFaults", capability: "arcade.view" },
    ...withSection("nav.arcadeGroupMaintenance", [
      { href: "/arcade/pm", labelKey: "nav.arcadePm", capability: "arcade.view" },
      { href: "/arcade/observation", labelKey: "nav.arcadeObservation", capability: "arcade.view" },
    ]),
    ...withSection("nav.arcadeGroupSuppliers", [
      { href: "/arcade/suppliers", labelKey: "nav.arcadeSuppliers", capability: "arcade.view" },
      { href: "/arcade/support", labelKey: "nav.arcadeSupport", capability: "arcade.view" },
    ]),
    ...withSection("nav.arcadeGroupParts", [
      { href: "/arcade/parts", labelKey: "nav.arcadeParts", capability: "arcade.view" },
    ]),
    ...withSection("nav.arcadeGroupManuals", [
      { href: "/arcade/manuals", labelKey: "nav.arcadeManuals", capability: "arcade.view" },
      { href: "/arcade/history", labelKey: "nav.arcadeHistory", capability: "arcade.view" },
    ]),
    ...withSection("nav.arcadeGroupInstalls", [
      { href: "/arcade/installations", labelKey: "nav.arcadeInstallations", capability: "arcade.view" },
      { href: "/arcade/damage", labelKey: "nav.arcadeDamage", capability: "arcade.view" },
    ]),
    ...withSection("nav.arcadeGroupMore", [
      { href: "/arcade/reports", labelKey: "nav.arcadeReports", capability: "arcade.reports" },
      { href: "/arcade/search", labelKey: "nav.arcadeSearch", capability: "arcade.view" },
    ]),
  ],
};

const PROCUREMENT_NAV_GROUP: SidebarNavGroup = {
  id: "procurement",
  labelKey: "nav.procurement",
  icon: Wallet,
  pathPrefix: "/procurement",
  viewCapability: "procurement.view",
  items: [
    ...withSection("nav.procSectionBuying", [
      { href: "/procurement", labelKey: "nav.procurementDashboard", capability: "procurement.view" },
      { href: "/procurement/requisitions", labelKey: "nav.procurementRequisitions", capability: "procurement.view" },
      { href: "/procurement/my-requests", labelKey: "nav.procurementMyRequests", capability: "procurement.create" },
    ]),
    ...withSection("nav.vendors", [
      { href: "/vendors", labelKey: "nav.vendors", capability: "vendors.view" },
      { href: "/procurement/compliance", labelKey: "nav.procurementCompliance", capability: "vendors.view" },
    ]),
    ...withSection("nav.procSectionReview", [
      { href: "/procurement/approvals", labelKey: "nav.procurementApprovals", capability: "procurement.view" },
      { href: "/procurement/analytics", labelKey: "nav.procurementAnalytics", capability: "procurement.view" },
    ]),
    ...withSection("nav.procSectionSetup", [
      { href: "/procurement/help", labelKey: "nav.procurementHelp", capability: "procurement.view" },
      { href: "/procurement/config", labelKey: "nav.procurementConfig", capability: "procurement.configure" },
    ]),
  ],
};

const EVENTS_NAV_GROUP: SidebarNavGroup = {
  id: "events",
  labelKey: "nav.events",
  icon: FolderKanban,
  pathPrefix: "/events",
  viewCapability: "events.view",
  items: [
    ...withSection("nav.eventsSectionPlan", [
      { href: "/events", labelKey: "nav.eventsDashboard", capability: "events.view" },
      { href: "/events/list", labelKey: "nav.eventsList", capability: "events.view" },
      { href: "/events/calendar", labelKey: "nav.eventsCalendar", capability: "events.view" },
    ]),
    ...withSection("nav.eventsSectionFollow", [
      { href: "/events/tasks", labelKey: "nav.eventsTasks", capability: "events.view" },
      { href: "/events/reports", labelKey: "nav.eventsReports", capability: "events.view" },
    ]),
  ],
};

/** Own My day entry. Attendance, roster, leave, issues, documents, payslips, and KRA stay inside the page. */
export const EMPLOYEE_SECTION_NAV: Array<NavItem> = [
  { href: "/hr/me", labelKey: "nav.hrMyDay", icon: UserRound, capability: "hr.employee_app" },
];

export function getEmployeeSectionNav(roles: AppRole[]): NavItem[] {
  return EMPLOYEE_SECTION_NAV.filter((item) => canUserDo(roles, item.capability));
}

/**
 * Roles that keep the operations home, and still need their own My Day rail.
 * My Day is the person's employee page, separate from team manager modules.
 */
const MY_DAY_RAIL_ROLES: readonly AppRole[] = ["branch_gm", "duty_manager", "tech_supervisor"];

/** Collapsed and expanded sidebar rail. Employees, supervisors, and reporting managers. */
export function showsMyDayNav(roles: AppRole[], hasDirectReports = false): boolean {
  if (!canUserDo(roles, "hr.employee_app")) return false;
  if (isEmployeeHomeAudience(roles) || hasDirectReports) return true;
  return roles.some((role) => MY_DAY_RAIL_ROLES.includes(role));
}

/**
 * Front-line staff who are not technicians or reporting managers.
 * Their collapsed icons and expanded labels are this list, in this order.
 * Technicians keep the department rail so arcade and maintenance stay reachable.
 */
const EMPLOYEE_FLAT_RAIL_ROLES: readonly AppRole[] = ["cashier_host", "customer_service"];

/** Day-to-day destinations. Capability filtering drops rows the role cannot open. */
const EMPLOYEE_FLAT_RAIL: NavItem[] = [
  { href: "/hr/me", labelKey: "nav.hrMyDay", icon: UserRound, capability: "hr.employee_app" },
  { href: "/chat#hub", labelKey: "nav.communicationHub", icon: MessagesSquare, capability: "chat.view" },
  { href: "/training/learning", labelKey: "nav.trainingLearning", icon: GraduationCap, capability: "training.learn" },
  { href: "/people/hr/helpdesk", labelKey: "nav.hrHelpdesk", icon: LifeBuoy, capability: "hr.employee_app" },
  { href: "/daily-ops", labelKey: "nav.dailyOps", icon: ClipboardList, capability: "daily_ops.view" },
  { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, capability: "tasks.view" },
  { href: "/customer", labelKey: "nav.customer", icon: Briefcase, capability: "customer.view_complaints" },
  { href: "/issues", labelKey: "nav.issues", icon: TicketCheck, capability: "issues.view" },
  { href: "/maintenance/requests", labelKey: "nav.maintenanceRequests", icon: Wrench, capability: "maintenance.request_submit" },
  { href: "/procurement/my-requests", labelKey: "nav.procurementMyRequests", icon: Wallet, capability: "procurement.create" },
];

/** Training and HR help desk for employee-home roles that still use the department rail. */
const EMPLOYEE_PINNED_RAIL: NavItem[] = [
  { href: "/training/learning", labelKey: "nav.trainingLearning", icon: GraduationCap, capability: "training.learn" },
  { href: "/people/hr/helpdesk", labelKey: "nav.hrHelpdesk", icon: LifeBuoy, capability: "hr.employee_app" },
];

export function usesEmployeeFlatRail(roles: AppRole[], hasDirectReports = false): boolean {
  if (hasDirectReports) return false;
  if (!isEmployeeHomeAudience(roles)) return false;
  if (roles.some((role) => role === "technician" || role === "tech_supervisor")) return false;
  return roles.some((role) => EMPLOYEE_FLAT_RAIL_ROLES.includes(role));
}

/** Same modules when the sidebar is collapsed or expanded. */
export function getEmployeeFlatRail(roles: AppRole[]): NavItem[] {
  if (!usesEmployeeFlatRail(roles)) return [];
  return EMPLOYEE_FLAT_RAIL.filter((item) => canUserDo(roles, item.capability));
}

/**
 * Extra rail rows for employee-home staff who keep the department sidebar.
 * Skipped when the flat rail already lists them, and when that exact href is already a primary icon.
 */
export function employeePinnedRailItems(
  roles: AppRole[],
  hasDirectReports: boolean,
  primaryHrefs: ReadonlySet<string>,
): NavItem[] {
  if (!isEmployeeHomeAudience(roles) || usesEmployeeFlatRail(roles, hasDirectReports)) return [];
  return EMPLOYEE_PINNED_RAIL.filter(
    (item) => canUserDo(roles, item.capability) && !primaryHrefs.has(item.href),
  );
}

/** Visible People & HR section headings. English and Arabic live on these keys. */
const PEOPLE_SECTION = {
  workspace: "nav.peopleSectionWorkspace",
  people: "nav.peopleSectionPeople",
  workTime: "nav.peopleSectionWorkTime",
  pay: "nav.peopleSectionPay",
  services: "nav.peopleSectionServices",
  development: "nav.peopleSectionDevelopment",
  insights: "nav.peopleSectionInsights",
  admin: "nav.peopleSectionAdmin",
} as const;

/**
 * Older People rows that are not the picker modules.
 * Leave, Payroll, and Performance stay in the sectioned list so the same label is not repeated.
 * Every row has a section so closing Administration hides setup pages instead of leaving untitled rows.
 */
const PEOPLE_NAV_ITEMS: NavItem[] = [
  { href: "/people/roster", labelKey: "nav.monthlyRoster", icon: CalendarDays, capability: "people.view_roster", departmentId: "people", sectionKey: PEOPLE_SECTION.workTime },
  { href: "/people/import", labelKey: "nav.importRoster", icon: ClipboardList, capability: "people.import_roster", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/recruitment/jobs", labelKey: "nav.hrJobRequests", icon: Briefcase, capability: "recruitment.request", departmentId: "people", sectionKey: PEOPLE_SECTION.people },
  { href: "/people/recruitment/jobs/admin", labelKey: "nav.hrJobAdmin", icon: Briefcase, capability: "recruitment.manage", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/kra", labelKey: "nav.kraScorecard", icon: ClipboardList, capability: "performance.view", departmentId: "people", sectionKey: PEOPLE_SECTION.development },
  { href: "/people/hr/engagement", labelKey: "nav.hrEngagement", icon: Sparkles, capability: "people.view_roster", departmentId: "people", sectionKey: PEOPLE_SECTION.development },
  { href: "/people/hr/quota", labelKey: "nav.hrQuota", icon: BarChart3, capability: "quota.view", departmentId: "people", sectionKey: PEOPLE_SECTION.insights },
  { href: "/people/hr/reports", labelKey: "nav.hrReports", icon: FileBarChart, capability: "hr.manage", departmentId: "people", sectionKey: PEOPLE_SECTION.insights },
  { href: "/people/attendance/import", labelKey: "nav.attendanceImport", icon: Clock, capability: "attendance.import", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/attendance/mapping", labelKey: "nav.attendanceMapping", icon: Clock, capability: "attendance.view", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/attendance/settings", labelKey: "nav.attendanceDevices", icon: Clock, capability: "attendance.view", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/field", labelKey: "nav.hrField", icon: Clock, capability: "attendance.view", departmentId: "people", sectionKey: PEOPLE_SECTION.workTime },
  { href: "/people/hr/shift-policy", labelKey: "nav.hrShiftPolicy", icon: Clock, capability: "hr.manage", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  {
    href: "/people/hr/probation-exit",
    labelKey: "nav.hrProbationExit",
    icon: LogOut,
    capability: "hr.probation.manage",
    anyCapabilities: ["hr.probation.manage", "hr.resignation.manage", "hr.termination.initiate"],
    departmentId: "people",
    sectionKey: PEOPLE_SECTION.people,
  },
  { href: "/people/hr/announcements", labelKey: "nav.hrAnnouncements", icon: Bell, capability: "hr.manage", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/hr/hierarchy", labelKey: "nav.operationsHierarchy", icon: Users, capability: "admin.view", departmentId: "people", sectionKey: PEOPLE_SECTION.people },
  { href: "/people/hr/settings", labelKey: "nav.hrSettings", icon: Settings, capability: "hr.policy.configure", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  { href: "/people/employee-app", labelKey: "nav.hrEmployeeApp", icon: UserRound, capability: "attendance.view", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
  ...EMPLOYEE_SECTION_NAV.map((item) => ({
    ...item,
    departmentId: "people" as const,
    sectionKey: PEOPLE_SECTION.workspace,
  })),
  { href: "/leaderboard", labelKey: "nav.leaderboard", icon: BarChart3, capability: "leaderboard.view", departmentId: "people", sectionKey: PEOPLE_SECTION.development },
  { href: "/people/extras", labelKey: "nav.peopleExtras", icon: ClipboardList, capability: "people.view_roster", departmentId: "people", sectionKey: PEOPLE_SECTION.admin },
];

function withPeopleSection(sectionKey: string, items: NavItem[]): NavItem[] {
  return withSection(sectionKey, items);
}

/**
 * Picker modules under section headings. They lead the People flyout.
 * Leave, Payroll, and Performance keep their existing labels inside the matching section.
 * Hash links open a shared page from People without marking another department active.
 */
const PICKER_SIDEBAR_ITEMS: NavItem[] = [
  ...withPeopleSection(PEOPLE_SECTION.workspace, [
    { href: "/people/hr", labelKey: "nav.dashboard", icon: LayoutDashboard, capability: "people.view_roster", departmentId: "people" },
    { href: "/profile#account", labelKey: "nav.myAccount", icon: UserRound, capability: "dashboard.view", departmentId: "people" },
    { href: "/chat#hub", labelKey: "nav.communicationHub", icon: MessagesSquare, capability: "chat.view", departmentId: "people" },
    { href: "/people/hr/helpdesk", labelKey: "nav.hrHelpdesk", icon: LifeBuoy, capability: "hr.manage", departmentId: "people" },
    { href: "/people/hr/privacy", labelKey: "nav.privacyRequests", icon: Shield, capability: "hr.manage", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.people, [
    { href: "/people", labelKey: "nav.employeeDatabase", icon: Users, capability: "people.view_roster", departmentId: "people" },
    { href: "/people/hr/hierarchy", labelKey: "nav.organizationCharts", icon: Users, capability: "admin.view", departmentId: "people" },
    { href: "/people/recruitment", labelKey: "nav.recruitment", icon: Briefcase, capability: "recruitment.request", departmentId: "people" },
    { href: "/people/hr/onboarding", labelKey: "nav.onboardingOffboarding", icon: ClipboardList, capability: "hr.manage", departmentId: "people" },
    { href: "/people/hr/end-of-service", labelKey: "nav.endOfService", icon: Scale, capability: "hr.manage", departmentId: "people" },
    { href: "/people/hr/service-history", labelKey: "nav.employmentHistory", icon: History, capability: "people.view_roster", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.workTime, [
    { href: "/people/hr/team", labelKey: "nav.teamOverview", icon: Users, capability: "people.view_roster", departmentId: "people" },
    { href: "/people/hr/workforce", labelKey: "nav.hrWorkforce", icon: Building2, capability: "people.view_roster", departmentId: "people" },
    { href: "/events#event-staff", labelKey: "nav.eventStaff", icon: FolderKanban, capability: "events.view", departmentId: "people" },
    { href: "/people/attendance", labelKey: "nav.attendance", icon: Clock, capability: "attendance.view", departmentId: "people" },
    { href: "/people/attendance/corrections", labelKey: "nav.attendanceCorrections", icon: Wrench, capability: "attendance.correct", departmentId: "people" },
    { href: "/people/attendance/settings", labelKey: "nav.biometricDevices", icon: Clock, capability: "attendance.view", departmentId: "people" },
    { href: "/people/hr/ot", labelKey: "nav.timesheets", icon: Clock, capability: "hr.ot.verify", departmentId: "people" },
    { href: "/people/leave", labelKey: "nav.hrLeave", icon: Palmtree, capability: "hr.leave.manage", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.pay, [
    { href: "/people/payroll", labelKey: "nav.hrPayroll", icon: Wallet, capability: "payroll.view", departmentId: "people" },
    { href: "/people/hr/air-tickets", labelKey: "nav.benefitsEntitlements", icon: Plane, capability: "hr.air_ticket.manage", departmentId: "people" },
    { href: "/people/hr/expenses", labelKey: "nav.hrExpenses", icon: Receipt, capability: "payroll.view", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.services, [
    { href: "/people/hr/documents", labelKey: "nav.hrServiceDocuments", icon: FileText, capability: "hr.docs.manage", departmentId: "people" },
    { href: "/people/hr/letters", labelKey: "nav.hrLetters", icon: Mail, capability: "hr.docs.manage", departmentId: "people" },
    { href: "/people/hr/warnings", labelKey: "nav.incidentReports", icon: AlertTriangle, capability: "hr.warnings.manage", departmentId: "people" },
    { href: "/people/hr/contracts", labelKey: "nav.hrContracts", icon: ScrollText, capability: "hr.docs.manage", departmentId: "people" },
    { href: "/people/hr/equipment", labelKey: "nav.equipmentReturns", icon: Package, capability: "hr.manage", departmentId: "people" },
    { href: "/sop#handbook", labelKey: "nav.employeeHandbook", icon: FileText, capability: "sop.view", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.development, [
    { href: "/people/training", labelKey: "nav.learningTraining", icon: GraduationCap, capability: "people.view_roster", departmentId: "people" },
    { href: "/people/performance", labelKey: "nav.performance", icon: BarChart3, capability: "performance.view", departmentId: "people" },
    { href: "/training/practicals#reviews", labelKey: "nav.assignmentReviews", icon: ClipboardCheck, capability: "training.assessment.grade", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.insights, [
    { href: "/people/hr/reports", labelKey: "nav.reportsAnalytics", icon: FileBarChart, capability: "hr.manage", departmentId: "people" },
  ]),
  ...withPeopleSection(PEOPLE_SECTION.admin, [
    { href: "/people/hr/retention", labelKey: "nav.recordRetention", icon: Archive, capability: "hr.docs.manage", departmentId: "people" },
    { href: "/people/import", labelKey: "nav.bulkImport", icon: ClipboardList, capability: "people.import_roster", departmentId: "people" },
    { href: "/inventory#hardware", labelKey: "nav.hardwareTools", icon: Wrench, capability: "inventory.view", departmentId: "people" },
    { href: "/people/hr/settings", labelKey: "nav.hrRulesSettings", icon: Settings, capability: "hr.policy.configure", departmentId: "people" },
  ]),
];

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
      ...withSection("nav.opsSectionCommand", [
        { href: "/", labelKey: "nav.dashboard", icon: Activity, capability: "dashboard.view" },
        { href: "/occ", labelKey: "nav.occ", icon: Radio, capability: "occ.view_estate" },
        { href: "/ceo", labelKey: "nav.ceo", icon: Crown, capability: "ceo.view_dashboard" },
        { href: "/daily-ops", labelKey: "nav.dailyOps", icon: ClipboardList, capability: "daily_ops.view" },
        { href: "/branches", labelKey: "nav.sites", icon: Building2, capability: "branches.view_pnl" },
        { href: "/reports", labelKey: "nav.reports", icon: FileBarChart, capability: "occ.view_estate" },
      ]),
      ...withSection("nav.opsSectionWork", [
        { href: "/tasks", labelKey: "nav.tasks", icon: ListChecks, capability: "tasks.view" },
        { href: "/supervisor", labelKey: "nav.supervisor", icon: ClipboardList, capability: "tasks.complete" },
        { href: "/kpi", labelKey: "nav.kpi", icon: BarChart3, capability: "kpi.view" },
        { href: "/operations/weekly-review", labelKey: "nav.weeklyReview", icon: Presentation, capability: "weekly_review.view" },
        { href: "/operations/corporate-deals", labelKey: "nav.corporateDeals", icon: FileBarChart, capability: "corporate_deals.view" },
        { href: "/decisions", labelKey: "nav.decisions", icon: Gavel, capability: "decision.view" },
      ]),
      ...withSection("nav.opsSectionWorkspace", [
        { href: "/notifications", labelKey: "nav.notifications", icon: Bell, capability: "notifications.view" },
        { href: "/chat", labelKey: "nav.chat", icon: MessagesSquare, capability: "chat.view" },
        { href: "/chat", labelKey: "nav.communicationHub", icon: MessagesSquare, capability: "chat.view" },
        { href: "/profile", labelKey: "nav.myAccount", icon: UserRound, capability: "dashboard.view" },
      ]),
    ],
  },
  {
    id: "people",
    labelKey: "nav.departments.people",
    icon: Users,
    audience: ["executive", "supervisor", "all"],
    items: [...PICKER_SIDEBAR_ITEMS, ...PEOPLE_NAV_ITEMS],
  },
  {
    id: "maintenance",
    labelKey: "nav.departments.maintenance",
    icon: Wrench,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: withSection("nav.maintSectionFacilities", [
      { href: "/facility", labelKey: "nav.facility", icon: Building, capability: "facility.view" },
      { href: "/snags", labelKey: "nav.snags", icon: Hammer, capability: "snags.view" },
      { href: "/issues", labelKey: "nav.issues", icon: TicketCheck, capability: "issues.view" },
    ]),
    groups: [MAINTENANCE_NAV_GROUP],
  },
  {
    id: "arcade",
    labelKey: "nav.departments.arcade",
    icon: Gamepad2,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: [],
    groups: [ARCADE_NAV_GROUP],
  },
  {
    id: "commercial",
    labelKey: "nav.departments.commercial",
    icon: LineChart,
    audience: ["executive", "supervisor", "all"],
    items: withSection("nav.commercialSection", [
      { href: "/revenue", labelKey: "nav.revenue", icon: LineChart, capability: "revenue.view" },
      { href: "/forecasts", labelKey: "nav.forecasts", icon: TrendingUp, capability: "forecast.view" },
    ]),
  },
  {
    id: "guest",
    labelKey: "nav.departments.guest",
    icon: Briefcase,
    audience: ["executive", "supervisor", "all"],
    items: withSection("nav.guestSection", [
      { href: "/bookings", labelKey: "nav.bookings", icon: Calendar, capability: "bookings.view" },
      { href: "/customer", labelKey: "nav.customer", icon: Briefcase, capability: "customer.view_complaints" },
      { href: "/pos", labelKey: "nav.pos", icon: ShoppingCart, capability: "pos.view" },
    ]),
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
    id: "training",
    labelKey: "nav.departments.training",
    icon: GraduationCap,
    audience: ["executive", "supervisor", "all"],
    items: [
      ...withSection("nav.trainingSectionLearn", [
        { href: "/training/learning", labelKey: "nav.trainingLearning", icon: GraduationCap, capability: "training.learn" },
        {
          href: "/training/calendar",
          labelKey: "nav.trainingCalendar",
          icon: Calendar,
          capability: "training.learn",
          anyCapabilities: ["training.view", "training.session.create", "training.learn"],
        },
      ]),
      ...withSection("nav.trainingSectionCatalog", [
        { href: "/training", labelKey: "nav.trainingCourses", icon: GraduationCap, capability: "training.view" },
        { href: "/training/assignments", labelKey: "nav.trainingAssignments", icon: GraduationCap, capability: "training.view" },
        { href: "/training/questions", labelKey: "nav.trainingQuestions", icon: GraduationCap, capability: "training.assessment.manage" },
        { href: "/training/practicals", labelKey: "nav.trainingPracticals", icon: GraduationCap, capability: "training.assessment.grade" },
      ]),
      ...withSection("nav.trainingSectionRecords", [
        { href: "/training/certificates", labelKey: "nav.trainingCertificates", icon: GraduationCap, capability: "training.certificate.view" },
        { href: "/training/paths", labelKey: "nav.trainingPaths", icon: GraduationCap, capability: "training.view" },
        { href: "/training/matrix", labelKey: "nav.trainingMatrix", icon: GraduationCap, capability: "training.view" },
        { href: "/training/links", labelKey: "nav.trainingLinks", icon: GraduationCap, capability: "training.view" },
        { href: "/training/reports", labelKey: "nav.trainingReports", icon: FileBarChart, capability: "training.analytics.view" },
      ]),
    ],
  },
  {
    id: "compliance",
    labelKey: "nav.departments.compliance",
    icon: ShieldCheck,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: [
      ...withSection("nav.compSectionTracker", [
        { href: "/compliance/e3-tracker", labelKey: "nav.e3Tracker", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/master-register", labelKey: "nav.e3MasterRegister", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/amc-dashboard", labelKey: "nav.e3MaintenanceContracts", icon: ClipboardCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/amc-tracker", labelKey: "nav.e3ContractTracker", icon: ClipboardCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/vendor-register", labelKey: "nav.e3VendorRegister", icon: Briefcase, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/monthly-scheduler", labelKey: "nav.e3MonthlyScheduler", icon: CalendarDays, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/missing-documents", labelKey: "nav.e3MissingDocuments", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/license-documents", labelKey: "nav.e3LicenseDocuments", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/qcdd", labelKey: "nav.e3Qcdd", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/fire-alarm", labelKey: "nav.e3FireAlarm", icon: AlertTriangle, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/pest-control", labelKey: "nav.e3PestControl", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/cctv", labelKey: "nav.e3Cctv", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/kitchen-compliance", labelKey: "nav.e3Kitchen", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/e3-tracker/third-party-certification", labelKey: "nav.e3ThirdParty", icon: ShieldCheck, capability: "compliance.view" },
      ]),
      ...withSection("nav.compSectionContracts", [
        { href: "/compliance/amc-schedule", labelKey: "nav.inspections", icon: ClipboardCheck, capability: "amc.view" },
        { href: "/compliance/amc-dashboard", labelKey: "nav.amcDashboard", icon: ClipboardCheck, capability: "amc.view" },
        { href: "/compliance/amc-contracts", labelKey: "nav.amcContracts", icon: ClipboardCheck, capability: "amc.view" },
      ]),
      ...withSection("nav.compSectionRegister", [
        { href: "/compliance", labelKey: "nav.compliance", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/dashboard", labelKey: "nav.complianceDashboard", icon: ShieldCheck, capability: "compliance.view" },
        { href: "/compliance/register", labelKey: "nav.complianceRegister", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/documents", labelKey: "nav.complianceDocumentsRegister", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/expiry-alerts", labelKey: "nav.complianceExpiryAlerts", icon: AlertTriangle, capability: "compliance.view" },
        { href: "/compliance/location-tracker", labelKey: "nav.locationComplianceTracker", icon: FileText, capability: "compliance.view" },
        { href: "/compliance/risk-register", labelKey: "nav.riskRegister", icon: AlertOctagon, capability: "risk.view" },
        { href: "/compliance-documents", labelKey: "nav.complianceDocuments", icon: FileText, capability: "compliance.view" },
        { href: "/compliance-calendar", labelKey: "nav.complianceCalendar", icon: CalendarDays, capability: "compliance.calendar.view" },
      ]),
    ],
  },
  {
    id: "utilities",
    labelKey: "nav.departments.utilities",
    icon: Gauge,
    audience: ["executive", "supervisor", "maintenance", "all"],
    items: withSection("nav.utilitiesSection", [
      { href: "/operations/utilities", labelKey: "nav.utilities", icon: Gauge, capability: "utilities.view" },
      { href: "/inventory", labelKey: "nav.inventory", icon: Package, capability: "inventory.view" },
    ]),
  },
  {
    id: "admin",
    labelKey: "nav.departments.admin",
    icon: Settings,
    audience: ["executive", "all"],
    items: [
      ...withSection("nav.adminSectionAccess", [
        { href: "/admin", labelKey: "nav.settings", icon: Settings, capability: "admin.view" },
        { href: "/admin/locations", labelKey: "nav.locationMaster", icon: Building2, capability: "admin.view" },
        { href: "/admin/roles", labelKey: "nav.rolesAccess", icon: Shield, capability: "admin.view" },
      ]),
      ...withSection("nav.adminSectionIntegrations", [
        { href: "/admin/ai-integrations", labelKey: "nav.aiIntegrations", icon: Sparkles, capability: "admin.view" },
        { href: "/admin/livekit", labelKey: "nav.livekit", icon: Phone, capability: "admin.view" },
      ]),
      ...withSection("nav.adminSectionSystem", [
        { href: "/admin/sidebar", labelKey: "nav.sidebarOrder", icon: GripVertical, capability: "admin.view" },
        { href: "/admin/diagnostics", labelKey: "nav.diagnostics", icon: HeartPulse, capability: "admin.diagnostics" },
        { href: "/admin/api-explorer", labelKey: "nav.apiExplorer", icon: Code2, capability: "admin.view" },
        { href: "/notifications/planned", labelKey: "nav.plannedNotifications", icon: BellRing, capability: "notifications.planned.view" },
      ]),
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
];

const PRIMARY_RAIL_MAX = 8;
const ADMIN_RAIL_HREF = "/admin";

/** One representative href per department — rail construction also unique-by-departmentId. */
const PRIMARY_RAIL_ORDER: Record<NavAudience, string[]> = {
  executive: ["/", "/people", "/admin", "/revenue", "/events", "/maintenance", "/procurement", "/compliance/e3-tracker"],
  supervisor: ["/", "/people", "/events", "/maintenance", "/compliance/e3-tracker", "/procurement", "/inventory", "/admin"],
  maintenance: ["/", "/arcade", "/maintenance", "/inventory", "/compliance/amc-schedule", "/people", "/procurement", "/events"],
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
function canSeeNavItem(roles: AppRole[], item: { capability: Capability; anyCapabilities?: readonly Capability[] }) {
  const keys = item.anyCapabilities?.length ? item.anyCapabilities : [item.capability];
  return keys.some((capability) => canUserDo(roles, capability));
}

export function getVisibleDepartments(roles: AppRole[]): VisibleNavDepartment[] {
  return NAV_DEPARTMENTS.flatMap((dept) => {
    const items = dept.items.filter((item) => canSeeNavItem(roles, item));
    const groups = (dept.groups ?? [])
      .map((g) => filterNavGroup(g, roles))
      .filter((g): g is SidebarNavGroup => g !== null);

    if (items.length === 0 && groups.length === 0) return [];

    return [{ ...dept, items, groups }];
  });
}

/** Full nav catalog (no role filter) — role × page matrix admin UI. */
export function listCatalogNavPages(): Array<NavItem & { departmentId: NavDepartmentId; departmentLabelKey: string }> {
  const seen = new Set<string>();
  const result: Array<NavItem & { departmentId: NavDepartmentId; departmentLabelKey: string }> = [];

  for (const dept of NAV_DEPARTMENTS) {
    for (const item of dept.items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      result.push({ ...item, departmentId: dept.id, departmentLabelKey: dept.labelKey });
    }
    for (const group of dept.groups ?? []) {
      for (const sub of group.items) {
        if (seen.has(sub.href)) continue;
        seen.add(sub.href);
        result.push({
          href: sub.href,
          labelKey: sub.labelKey,
          icon: group.icon,
          capability: sub.capability,
          departmentId: dept.id,
          departmentLabelKey: dept.labelKey,
        });
      }
    }
  }

  return result;
}

/** All nav items flattened from visible departments (for search, mobile grid). */
function navEntryKey(href: string, labelKey: string) {
  return `${labelKey}\0${href}`;
}

export function getAllVisibleNavItems(
  roles: AppRole[],
  departments: VisibleNavDepartment[] = getVisibleDepartments(roles),
): NavItem[] {
  const seen = new Set<string>();
  const result: NavItem[] = [];

  for (const dept of departments) {
    for (const item of dept.items) {
      const key = navEntryKey(item.href, item.labelKey);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...item, departmentId: dept.id });
    }
    for (const group of dept.groups) {
      for (const sub of group.items) {
        const key = navEntryKey(sub.href, sub.labelKey);
        if (seen.has(key)) continue;
        seen.add(key);
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

/**
 * Existing people-manager modules a reporting line unlocks.
 * Labels, icons, and routes stay the ones already in the People department.
 * Team overview holds team approvals. Leave, attendance, the monthly roster,
 * and a view-only operations hierarchy are the team-scoped manager surfaces.
 */
export const REPORTING_MANAGER_MODULE_HREFS = [
  "/people/hr/team",
  "/people/leave",
  "/people/attendance",
  "/people/attendance/corrections",
  "/people/attendance/mapping",
  "/people/roster",
  "/people/hr/hierarchy",
] as const;

export function reportingManagerNavItems(): NavItem[] {
  return REPORTING_MANAGER_MODULE_HREFS.flatMap((href) => {
    const item = NAV_ITEM_LOOKUP.get(href);
    return item ? [item] : [];
  });
}

/** Adds manager modules the role cannot already open. No-op without direct reports. */
export function mergeReportingManagerDepartments(
  departments: VisibleNavDepartment[],
  hasDirectReports: boolean,
): VisibleNavDepartment[] {
  if (!hasDirectReports) return departments;
  const present = new Set(departments.flatMap((dept) => dept.items.map((item) => item.href)));
  const extras = reportingManagerNavItems().filter((item) => !present.has(item.href));
  if (extras.length === 0) return departments;
  const peopleIndex = departments.findIndex((dept) => dept.id === "people");
  if (peopleIndex < 0) {
    const template = NAV_DEPARTMENTS.find((dept) => dept.id === "people");
    if (!template) return departments;
    return [...departments, { ...template, items: extras, groups: [] }];
  }
  return departments.map((dept, index) =>
    index === peopleIndex ? { ...dept, items: [...dept.items, ...extras] } : dept,
  );
}

/**
 * Manager modules for the collapsed icon rail.
 * When People is already a primary rail icon, its flyout shows these links
 * without the expand control, so they are not repeated as extra icons.
 */
export function reportingManagerRailItems(
  hasDirectReports: boolean,
  primaryDepartmentIds: ReadonlySet<string>,
): NavItem[] {
  if (!hasDirectReports) return [];
  return reportingManagerNavItems().filter((item) => {
    if (item.departmentId && primaryDepartmentIds.has(item.departmentId)) return false;
    return true;
  });
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

/** Hash anchors on `/` stay inactive. Other hash links highlight on their path (`/profile#account`). */
export function navHrefPath(href: string): string | null {
  if (!href.includes("#")) return href;
  const path = href.slice(0, href.indexOf("#")) || "/";
  if (path === "/") return null;
  return path;
}

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  // Index rows stay exact so a sibling page does not light the parent row.
  if (href === "/people") return pathname === "/people" || pathname.startsWith("/people/staff/");
  if (href === "/people/hr" || href === "/people/attendance" || href === "/people/recruitment") {
    return pathname === href;
  }
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
  if (href === "/procurement/analytics" || href === "/procurement/help") {
    return pathname === href || pathname.startsWith(`${href}/`);
  }
  if (href === "/people") {
    return pathname === href;
  }
  if (href === "/people/hr") {
    // Exact match — nested /people/hr/* are sibling admin children
    return pathname === href;
  }
  if (href === "/people/attendance") {
    return pathname === href;
  }
  if (href === "/events") {
    return pathname === href;
  }
  if (href === "/arcade") {
    return pathname === href;
  }
  if (href === "/training") {
    return pathname === href || /^\/training\/[0-9a-f-]{36}(?:\/|$)/i.test(pathname);
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
    if (
      pathname === "/people" ||
      pathname.startsWith("/people/staff/") ||
      pathname.startsWith("/people/training")
    ) {
      return true;
    }
    return extraHrefs.some(
      (href) => href !== pathPrefix && (pathname === href || pathname.startsWith(`${href}/`)),
    );
  }
  if (pathPrefix === "/people/hr") {
    if (pathname === "/people/hr" || pathname.startsWith("/people/hr/")) return true;
    return extraHrefs.some(
      (href) => href !== pathPrefix && (pathname === href || pathname.startsWith(`${href}/`)),
    );
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
  /** Visible heading shared by consecutive links. */
  sectionKey?: string;
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

  for (const item of department.items) {
    const key = navEntryKey(item.href, item.labelKey);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ ...item, fromGroup: false });
  }
  for (const group of department.groups) {
    for (const sub of group.items) {
      const key = navEntryKey(sub.href, sub.labelKey);
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        href: sub.href,
        labelKey: sub.labelKey,
        icon: group.icon,
        capability: sub.capability,
        fromGroup: true,
        sectionKey: sub.sectionKey,
      });
    }
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

/** Flattened links for a department flyout (rail + overflow). Prefer getDepartmentFlyoutTree for UI. */
export function getDepartmentFlyoutLinks(department: VisibleNavDepartment): RailFlyoutLink[] {
  const tree = getDepartmentFlyoutTree(department);
  const links: RailFlyoutLink[] = [];
  for (const item of tree.items) {
    links.push({ ...item, fromGroup: false });
  }
  for (const group of tree.groups) {
    for (const sub of group.items) {
      links.push({
        href: sub.href,
        labelKey: sub.labelKey,
        icon: group.icon,
        capability: sub.capability,
        fromGroup: true,
        sectionKey: sub.sectionKey,
      });
    }
  }
  return links;
}

/** Hierarchical sections for flyout / expanded sidebar (promoted items, then parent groups). */
export function getDepartmentFlyoutTree(department: VisibleNavDepartment): {
  groups: SidebarNavGroup[];
  items: NavItem[];
} {
  return {
    items: department.items,
    groups: department.groups,
  };
}

/** One heading per section. Item order inside a section follows the list. Rows without a key stay together at the end. */
export function clusterItemsBySection<T extends { sectionKey?: string }>(items: readonly T[]) {
  const blocks: { sectionKey: string | null; items: T[] }[] = [];
  const indexByKey = new Map<string, number>();
  const plain: T[] = [];
  for (const item of items) {
    const sectionKey = item.sectionKey ?? null;
    if (!sectionKey) {
      plain.push(item);
      continue;
    }
    const existing = indexByKey.get(sectionKey);
    if (existing == null) {
      indexByKey.set(sectionKey, blocks.length);
      blocks.push({ sectionKey, items: [item] });
    } else {
      blocks[existing]?.items.push(item);
    }
  }
  if (plain.length > 0) blocks.push({ sectionKey: null, items: plain });
  return blocks;
}

