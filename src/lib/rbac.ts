/**
 * FEC-OS role-based access control matrix.
 * Roles match the public.app_role enum + role_level convention from the schema.
 * Higher level = more authority. role_level >= 80 = exec/regional access to all locations.
 */

export type AppRole =
  | "ceo"
  | "coo"
  | "cfo"
  | "regional_ops"
  | "branch_gm"
  | "duty_manager"
  | "tech_supervisor"
  | "technician"
  | "cashier_host"
  | "auditor"
  | "hr"
  | "customer_service";

export interface RoleAssignment {
  role: AppRole;
  role_level: number;
  location_ids: string[];
}

/** Canonical role levels — keep in sync with seed data / admin UI. */
export const ROLE_LEVELS: Record<AppRole, number> = {
  ceo: 100,
  coo: 95,
  cfo: 90,
  regional_ops: 80,
  branch_gm: 70,
  duty_manager: 60,
  tech_supervisor: 50,
  technician: 30,
  cashier_host: 20,
  auditor: 40,
  hr: 55,
  customer_service: 45,
};

/**
 * Capability → list of roles that may exercise it.
 * Use via `usePermission("capability")` in components.
 */
export const CAPABILITIES = {
  // OCC / Operations
  "occ.view_estate": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "occ.view_branch": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "occ.toggle_surge": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],
  "occ.run_handover": ["branch_gm", "duty_manager"],

  // Revenue / Finance
  "revenue.view": ["ceo", "coo", "cfo", "regional_ops", "branch_gm", "auditor"],
  "revenue.investigate_leakage": ["ceo", "cfo", "regional_ops", "branch_gm", "auditor"],
  "revenue.adjust_pricing": ["ceo", "coo", "regional_ops", "branch_gm"],
  "revenue.sync_bookingqube": ["ceo", "coo", "cfo"],

  // CEO dashboard
  "ceo.view_dashboard": ["ceo", "coo", "cfo"],
  "ceo.read_brief": ["ceo", "coo", "cfo", "regional_ops"],

  // Branches
  "branches.view_pnl": ["ceo", "coo", "cfo", "regional_ops", "branch_gm"],
  "branches.edit": ["ceo", "coo", "regional_ops"],

  // Issues / Tickets
  "issues.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host"],
  "issues.create": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host"],
  "issues.assign": ["branch_gm", "duty_manager", "tech_supervisor"],
  "issues.close": ["branch_gm", "duty_manager", "tech_supervisor"],

  // Maintenance
  "maintenance.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician"],
  "maintenance.schedule_pm": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "maintenance.execute_wo": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician"],
  "maintenance.manage": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "maintenance.request_submit": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host"],
  "maintenance.weekly_report": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "maintenance.weekly_report.submit": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician"],
  "maintenance.weekly_report.review": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "maintenance.weekly_report.executive": ["ceo", "coo", "regional_ops"],
  "maintenance.logistics_view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "auditor"],
  "maintenance.logistics_submit": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "maintenance.logistics_warehouse": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "maintenance.logistics_verify": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],

  // Tasks / Checklists
  "tasks.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host"],
  "tasks.complete": ["branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host"],
  "tasks.manage_templates": ["branch_gm", "regional_ops", "duty_manager"],
  "tasks.generate_ai": ["branch_gm", "regional_ops", "duty_manager", "tech_supervisor"],

  // Bookings
  "bookings.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "cashier_host"],
  "bookings.create": ["branch_gm", "duty_manager", "cashier_host"],
  "bookings.confirm": ["branch_gm", "duty_manager"],

  // People / HR
  "people.view_roster": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "hr"],
  "people.edit_roster": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "hr"],

  // Compliance
  "compliance.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "compliance.manage_documents": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "compliance.run_audit": ["auditor", "regional_ops"],
  "compliance.close_incident": ["branch_gm", "regional_ops"],

  // Customer
  "customer.view_complaints": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "cashier_host", "customer_service"],
  "customer.resolve_complaint": ["branch_gm", "duty_manager", "customer_service"],

  // Forecasts / What-if
  "forecast.view": ["ceo", "coo", "cfo", "regional_ops"],
  "forecast.create": ["ceo", "coo", "cfo"],

  // Decisions / Voting
  "decision.view": ["ceo", "coo", "cfo", "regional_ops", "branch_gm"],
  "decision.vote": ["ceo", "coo", "cfo", "regional_ops", "branch_gm"],
  "decision.manage": ["ceo", "coo"],

  // Leaderboard / Gamification
  "leaderboard.view": ["ceo", "coo", "cfo", "regional_ops", "branch_gm", "duty_manager"],

  // Admin
  "admin.view": ["ceo", "coo"],
  "admin.manage_users": ["ceo", "coo"],
  "admin.manage_roles": ["ceo"],
  "admin.provision_users": ["ceo", "coo"],

  // Operations dashboard
  "dashboard.view": ["ceo", "coo", "cfo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host", "auditor", "hr", "customer_service"],
  "dashboard.view_estate": ["ceo", "coo", "cfo", "regional_ops", "auditor"],
  "dashboard.view_branch": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "dashboard.view_maintenance": ["tech_supervisor", "technician", "branch_gm", "duty_manager"],
  "dashboard.view_tasks": ["cashier_host", "duty_manager", "branch_gm", "technician"],
  "dashboard.view_hr": ["hr", "branch_gm", "ceo", "coo"],
  "dashboard.view_customer": ["customer_service", "branch_gm", "duty_manager"],

  // KPI engine
  "kpi.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "hr", "auditor"],
  "kpi.manage_templates": ["ceo", "coo", "hr", "regional_ops"],
  "kpi.score_entry": ["branch_gm", "duty_manager", "hr"],
  "kpi.view_own": ["cashier_host", "technician", "customer_service", "tech_supervisor"],

  // SOP management
  "sop.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host", "hr", "customer_service", "auditor"],
  "sop.manage": ["ceo", "coo", "regional_ops", "branch_gm"],
  "sop.acknowledge": ["branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host", "hr", "customer_service"],

  // Attendance
  "attendance.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "hr", "auditor"],
  "attendance.import": ["branch_gm", "duty_manager", "hr"],
  "attendance.manage_devices": ["branch_gm", "hr", "regional_ops"],
  "attendance.correct": ["branch_gm", "duty_manager", "hr", "cashier_host", "technician"],
  "attendance.approve": ["branch_gm", "duty_manager", "hr"],

  // Snags
  "snags.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "auditor"],
  "snags.create": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician"],
  "snags.manage": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "snags.verify": ["branch_gm", "duty_manager", "regional_ops"],

  // Vendors
  "vendors.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "vendors.manage": ["ceo", "coo", "regional_ops", "branch_gm"],

  // Compliance calendar
  "compliance.calendar.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "compliance.calendar.manage": ["branch_gm", "regional_ops", "auditor"],

  // Location compliance master tracker
  "compliance.tracker.manage": ["ceo", "coo", "regional_ops"],
  "compliance.tracker.edit": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],
  "compliance.tracker.upload": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],

  // E3 AMC & compliance tracker register
  "compliance.edit_e3_tracker": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],

  // Notifications
  "notifications.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host", "hr", "customer_service", "auditor"],
  "notifications.manage_preferences": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "technician", "cashier_host", "hr", "customer_service", "auditor"],
  "notifications.dispatch": ["ceo", "coo", "regional_ops", "branch_gm"],

  // Inventory
  "inventory.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "inventory.move": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],
  "inventory.manage": ["ceo", "coo", "regional_ops", "branch_gm"],
  "inventory.import": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],

  // Daily Operations
  "daily_ops.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "cashier_host", "customer_service", "auditor"],
  "daily_ops.manage": ["branch_gm", "duty_manager", "tech_supervisor"],
  "daily_ops.view_all": ["ceo", "coo", "regional_ops", "auditor"],
  "daily_ops.roster.upload": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "hr"],
  "daily_ops.roster.generate": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor"],

  // AMC scheduler & compliance
  "amc.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "amc.manage": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],
  "amc.verify": ["branch_gm", "duty_manager", "regional_ops", "auditor"],

  // Utilities & energy
  "utilities.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "utilities.manage": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],

  // Risk register
  "risk.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "risk.manage": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager"],

  // Facility management
  "facility.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "facility.manage": ["branch_gm", "duty_manager", "tech_supervisor", "regional_ops"],

  // Planned notification queue
  "notifications.planned.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "auditor"],
  "notifications.planned.manage": ["ceo", "coo", "regional_ops", "branch_gm"],

  // Weekly operations reporting
  "weekly_reports.view": ["ceo", "coo", "regional_ops", "branch_gm", "duty_manager", "tech_supervisor", "auditor"],
  "weekly_reports.submit": ["ceo", "coo", "branch_gm", "duty_manager", "tech_supervisor", "regional_ops"],
  "weekly_reports.review": ["ceo", "coo", "regional_ops", "branch_gm"],
  "weekly_reports.executive": ["ceo", "coo", "regional_ops"],
  /** @deprecated alias — use weekly_reports.executive */
  "weekly_reports.view_executive": ["ceo", "coo", "cfo", "regional_ops", "auditor"],
  /** @deprecated alias — use weekly_reports.executive */
  "weekly_reports.generate": ["ceo", "coo", "regional_ops"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Capability = keyof typeof CAPABILITIES;

export function canUserDo(roles: AppRole[], capability: Capability): boolean {
  const allowed = CAPABILITIES[capability];
  return roles.some((r) => (allowed as readonly AppRole[]).includes(r));
}

/** Roles that unlock full (non-floor) forms and revenue/finance UI. */
const ELEVATED_OPERATIONAL_ROLES: readonly AppRole[] = [
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "auditor",
  "hr",
];

/** Floor supervisors/technicians see simplified create/edit forms without finance fields. */
export function isFloorSupervisorView(roles: AppRole[]): boolean {
  if (roles.some((r) => ELEVATED_OPERATIONAL_ROLES.includes(r))) return false;
  return roles.some((r) =>
    (["tech_supervisor", "technician", "cashier_host"] as AppRole[]).includes(r),
  );
}

export function canViewRevenue(roles: AppRole[]): boolean {
  return canUserDo(roles, "revenue.view");
}

/** Where a freshly signed-in user should land based on their highest role. */
export function defaultHomeForRoles(roles: AppRole[]): string {
  if (roles.includes("ceo") || roles.includes("coo") || roles.includes("cfo")) return "/";
  if (roles.includes("regional_ops")) return "/";
  if (roles.includes("branch_gm") || roles.includes("duty_manager")) return "/";
  if (roles.includes("hr")) return "/";
  if (roles.includes("customer_service")) return "/";
  if (roles.includes("tech_supervisor")) return "/";
  if (roles.includes("technician")) return "/";
  if (roles.includes("cashier_host")) return "/";
  if (roles.includes("auditor")) return "/compliance";
  return "/";
}

export type DashboardView =
  | "estate"
  | "branch"
  | "maintenance"
  | "tasks"
  | "hr"
  | "customer";

/** Resolve which dashboard variant to show on the home page. */
export function dashboardViewForRoles(roles: AppRole[]): DashboardView {
  if (roles.some((r) => ["ceo", "coo", "cfo", "regional_ops"].includes(r))) return "estate";
  if (roles.includes("hr")) return "hr";
  if (roles.includes("customer_service")) return "customer";
  if (roles.some((r) => ["tech_supervisor", "technician"].includes(r))) return "maintenance";
  if (roles.includes("cashier_host")) return "tasks";
  if (roles.some((r) => ["branch_gm", "duty_manager"].includes(r))) return "branch";
  return "estate";
}