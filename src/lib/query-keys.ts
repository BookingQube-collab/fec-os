import type { DashboardPeriod } from "@/lib/dashboard.functions";

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    profile: (userId: string) => [...queryKeys.auth.all, "profile", userId] as const,
    roles: (userId: string) => [...queryKeys.auth.all, "roles", userId] as const,
  },
  sites: {
    all: ["sites"] as const,
    list: () => [...queryKeys.sites.all, "list"] as const,
  },
  locationAreas: {
    all: ["location-areas"] as const,
    list: (locationId: string | null, activeOnly = false) =>
      [...queryKeys.locationAreas.all, "list", locationId, activeOnly] as const,
  },
  maintenanceOptions: {
    all: ["maintenance-options"] as const,
    list: (kind: "category" | "issue_type", activeOnly = true) =>
      [...queryKeys.maintenanceOptions.all, "list", kind, activeOnly] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    kpis: (period: DashboardPeriod, locationId: string | null, view: string) =>
      [...queryKeys.dashboard.all, "kpis", period, locationId, view] as const,
    charts: (period: DashboardPeriod, locationId: string | null, year: number) =>
      [...queryKeys.dashboard.all, "charts", period, locationId, year] as const,
    secondary: (
      locationId: string | null,
      year: number,
      include: string,
      utilityBase?: number,
    ) =>
      [...queryKeys.dashboard.all, "secondary", locationId, year, include, utilityBase ?? null] as const,
    full: (period: DashboardPeriod, locationId: string | null, view: string) =>
      [...queryKeys.dashboard.all, "full", period, locationId, view] as const,
    branches: (period: DashboardPeriod, locationId: string | null) =>
      [...queryKeys.dashboard.all, "branches", period, locationId] as const,
  },
  operations: {
    all: ["operations"] as const,
    dashboard: (filters?: object) =>
      [...queryKeys.operations.all, "dashboard", filters ?? {}] as const,
    branches: (filters?: object) =>
      [...queryKeys.operations.all, "branches", filters ?? {}] as const,
    siteSummary: (locationId: string, filters?: object) =>
      [...queryKeys.operations.all, "site-summary", locationId, filters ?? {}] as const,
  },
  maintenance: {
    all: ["maintenance"] as const,
    dashboard: (filters?: object) =>
      [...queryKeys.maintenance.all, "dashboard", filters ?? {}] as const,
    pmSchedules: (locationId?: string | null) =>
      [...queryKeys.maintenance.all, "pm-schedules", locationId ?? null] as const,
    downtime: (filters?: object) =>
      [...queryKeys.maintenance.all, "downtime", filters ?? {}] as const,
    requests: (filters?: object) =>
      [...queryKeys.maintenance.all, "requests", filters ?? {}] as const,
    logistics: (filters?: object) =>
      [...queryKeys.maintenance.all, "logistics", filters ?? {}] as const,
    weeklyReport: (filters?: object) =>
      [...queryKeys.maintenance.all, "weekly-report", filters ?? {}] as const,
    weeklyReports: {
      all: ["maintenance-weekly-reports"] as const,
      list: (filters?: object) =>
        [...queryKeys.maintenance.weeklyReports.all, "list", filters ?? {}] as const,
      detail: (id?: string | null) =>
        [...queryKeys.maintenance.weeklyReports.all, "detail", id ?? null] as const,
      executiveList: (weekStart?: string | null) =>
        [...queryKeys.maintenance.weeklyReports.all, "executive-list", weekStart ?? null] as const,
      executiveDetail: (id?: string | null) =>
        [...queryKeys.maintenance.weeklyReports.all, "executive", id ?? null] as const,
    },
  },
  workOrders: {
    all: ["work-orders"] as const,
    list: (filters: { locationId?: string | null; status?: string | null; mine?: boolean }) =>
      [...queryKeys.workOrders.all, "list", filters] as const,
  },
  amc: {
    all: ["amc"] as const,
    contracts: (filters?: object) =>
      [...queryKeys.amc.all, "contracts", filters ?? {}] as const,
    schedules: (filters?: object) =>
      [...queryKeys.amc.all, "schedules", filters ?? {}] as const,
    dashboard: (filters?: object) =>
      [...queryKeys.amc.all, "dashboard", filters ?? {}] as const,
    summary: (filters?: object) =>
      [...queryKeys.amc.all, "summary", filters ?? {}] as const,
    dashboardContracts: (filters?: object) =>
      [...queryKeys.amc.all, "dashboard-contracts", filters ?? {}] as const,
    expiryAlerts: (filters?: object) =>
      [...queryKeys.amc.all, "expiry-alerts", filters ?? {}] as const,
    payments: (filters?: object) =>
      [...queryKeys.amc.all, "payments", filters ?? {}] as const,
    renewals: (filters?: object) =>
      [...queryKeys.amc.all, "renewals", filters ?? {}] as const,
  },
  assets: {
    all: ["assets"] as const,
    list: (locationId?: string | null) => [...queryKeys.assets.all, "list", locationId ?? null] as const,
  },
  inspections: {
    all: ["inspections"] as const,
    list: (filters?: object) =>
      [...queryKeys.inspections.all, "list", filters ?? {}] as const,
  },
  compliance: {
    all: ["compliance"] as const,
    renewals: (filters?: object) =>
      [...queryKeys.compliance.all, "renewals", filters ?? {}] as const,
    executiveKpis: (locationId: string | null) =>
      [...queryKeys.compliance.all, "executive-kpis", locationId] as const,
    dueItems: () => [...queryKeys.compliance.all, "due-items"] as const,
    documents: (filters?: object) =>
      [...queryKeys.compliance.all, "documents", filters ?? {}] as const,
    expiryAlerts: (filters?: object) =>
      [...queryKeys.compliance.all, "expiry-alerts", filters ?? {}] as const,
    expiryNotifications: (filters?: object) =>
      [...queryKeys.compliance.all, "expiry-notifications", filters ?? {}] as const,
    documentExpiryKpis: (locationId: string | null) =>
      [...queryKeys.compliance.all, "document-expiry-kpis", locationId] as const,
    locationTracker: (filters?: object) =>
      [...queryKeys.compliance.all, "location-tracker", filters ?? {}] as const,
    locationTrackerKpis: (filters?: object) =>
      [...queryKeys.compliance.all, "location-tracker-kpis", filters ?? {}] as const,
    locationTrackerAlerts: (filters?: object) =>
      [...queryKeys.compliance.all, "location-tracker-alerts", filters ?? {}] as const,
    command: (filters?: object) => [...queryKeys.compliance.all, "command", filters ?? {}] as const,
    alerts: (filters?: object) => [...queryKeys.compliance.all, "alerts", filters ?? {}] as const,
    trend: (params?: object) => [...queryKeys.compliance.all, "trend", params ?? {}] as const,
    calendarMonth: (params?: object) => [...queryKeys.compliance.all, "calendar-month", params ?? {}] as const,
    coverage: (filters?: object) => [...queryKeys.compliance.all, "coverage", filters ?? {}] as const,
    staffReadiness: (filters?: object) => [...queryKeys.compliance.all, "staff-readiness", filters ?? {}] as const,
    supervisor: (locationId?: string) => [...queryKeys.compliance.all, "supervisor", locationId ?? null] as const,
    vendorScorecard: (filters?: object) => [...queryKeys.compliance.all, "vendor-scorecard", filters ?? {}] as const,
    serviceHistory: (filters?: object) => [...queryKeys.compliance.all, "service-history", filters ?? {}] as const,
  },
  vendors: {
    all: ["vendors"] as const,
    list: (filters?: object) => [...queryKeys.vendors.all, "list", filters ?? {}] as const,
    dashboard: (filters?: object) => [...queryKeys.vendors.all, "dashboard", filters ?? {}] as const,
    detail: (id: string) => [...queryKeys.vendors.all, "detail", id] as const,
  },
  issues: {
    all: ["issues"] as const,
    list: (filters?: object) => [...queryKeys.issues.all, "list", filters ?? {}] as const,
  },
  bookings: {
    all: ["bookings"] as const,
    list: (filters?: object) => [...queryKeys.bookings.all, "list", filters ?? {}] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    instances: (filters?: object) => [...queryKeys.tasks.all, "instances", filters ?? {}] as const,
    templates: (filters?: object) => [...queryKeys.tasks.all, "templates", filters ?? {}] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    escalations: () => [...queryKeys.notifications.all, "escalations"] as const,
    list: (filters?: object) => [...queryKeys.notifications.all, "list", filters ?? {}] as const,
    inbox: (userId?: string | null) => [...queryKeys.notifications.all, "inbox", userId ?? "anon"] as const,
  },
  people: {
    all: ["people"] as const,
    dashboard: (filters?: object) => [...queryKeys.people.all, "dashboard", filters ?? {}] as const,
    staff: (locationId?: string | null, includeArchived?: boolean) =>
      [...queryKeys.people.all, "staff", locationId ?? null, includeArchived ? "archived" : "active"] as const,
    staffProfile: (id: string) => [...queryKeys.people.all, "staff-profile", id] as const,
    rosterImports: () => [...queryKeys.people.all, "roster-imports"] as const,
    departments: () => [...queryKeys.people.all, "departments"] as const,
    shifts: (locationId?: string | null) => [...queryKeys.people.all, "shifts", locationId ?? null] as const,
    training: (locationId?: string | null) => [...queryKeys.people.all, "training", locationId ?? null] as const,
    attendanceSummary: (filters?: { locationId?: string | null; dateFrom?: string; dateTo?: string }) =>
      [
        ...queryKeys.people.all,
        "attendance-summary",
        filters?.locationId ?? null,
        filters?.dateFrom ?? null,
        filters?.dateTo ?? null,
      ] as const,
    attendanceExceptions: (locationId?: string | null) =>
      [...queryKeys.people.all, "attendance-exceptions", locationId ?? null] as const,
    attendanceIngestLogs: () => [...queryKeys.people.all, "attendance-ingest-logs"] as const,
    attendanceHr: (filters?: object) => [...queryKeys.people.all, "attendance-hr", filters ?? {}] as const,
    hrOverview: (filters?: object) => [...queryKeys.people.all, "hr-overview", filters ?? {}] as const,
    hrDocs: (filters?: object) => [...queryKeys.people.all, "hr-docs", filters ?? {}] as const,
    hrChecklists: (filters?: object) => [...queryKeys.people.all, "hr-checklists", filters ?? {}] as const,
    hrAnnouncements: (filters?: object) => [...queryKeys.people.all, "hr-announcements", filters ?? {}] as const,
    hrOtPolicy: () => [...queryKeys.people.all, "hr-ot-policy"] as const,
    hrReports: (filters?: object) => [...queryKeys.people.all, "hr-reports", filters ?? {}] as const,
    hrLeaveBalances: (filters?: object) => [...queryKeys.people.all, "hr-leave-balances", filters ?? {}] as const,
  },
  performance: {
    all: ["performance"] as const,
    dashboard: () => [...queryKeys.performance.all, "dashboard"] as const,
    cycles: () => [...queryKeys.performance.all, "cycles"] as const,
    kraTemplates: () => [...queryKeys.performance.all, "kra-templates"] as const,
    kpiTemplates: () => [...queryKeys.performance.all, "kpi-templates"] as const,
    assignments: (cycleId?: string | null) =>
      [...queryKeys.performance.all, "assignments", cycleId ?? null] as const,
    evaluations: (filters?: object) =>
      [...queryKeys.performance.all, "evaluations", filters ?? {}] as const,
    evaluation: (id: string) => [...queryKeys.performance.all, "evaluation", id] as const,
    profile: (staffId: string) => [...queryKeys.performance.all, "profile", staffId] as const,
    achievements: (filters?: object) =>
      [...queryKeys.performance.all, "achievements", filters ?? {}] as const,
    nominations: (filters?: object) =>
      [...queryKeys.performance.all, "nominations", filters ?? {}] as const,
    scoreboard: (locationId?: string | null) =>
      [...queryKeys.performance.all, "scoreboard", locationId ?? null] as const,
  },
  facility: {
    all: ["facility"] as const,
    dashboard: (filters?: object) => [...queryKeys.facility.all, "dashboard", filters ?? {}] as const,
    tasks: (filters?: object) => [...queryKeys.facility.all, "tasks", filters ?? {}] as const,
  },
  utilities: {
    all: ["utilities"] as const,
    dashboard: (locationId?: string | null) => [...queryKeys.utilities.all, "dashboard", locationId ?? null] as const,
    list: (locationId?: string | null) => [...queryKeys.utilities.all, "list", locationId ?? null] as const,
  },
  complianceRegister: {
    all: ["compliance-register"] as const,
    list: (filters?: object) => [...queryKeys.complianceRegister.all, "list", filters ?? {}] as const,
    kpis: (filters?: object) => [...queryKeys.complianceRegister.all, "kpis", filters ?? {}] as const,
  },
  e3ComplianceTracker: {
    all: ["e3-compliance-tracker"] as const,
    summary: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "summary", filters ?? {}] as const,
    register: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "register", filters ?? {}] as const,
    vendors: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "vendors", filters ?? {}] as const,
    scheduler: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "scheduler", filters ?? {}] as const,
    missingDocuments: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "missing-documents", filters ?? {}] as const,
    amc: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "amc", filters ?? {}] as const,
    category: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "category", filters ?? {}] as const,
    licenseDocuments: (filters?: object) =>
      [...queryKeys.e3ComplianceTracker.all, "license-documents", filters ?? {}] as const,
  },
  snags: {
    all: ["snags"] as const,
    list: (filters?: object) => [...queryKeys.snags.all, "list", filters ?? {}] as const,
    detail: (id?: string) => [...queryKeys.snags.all, "detail", id ?? null] as const,
    dashboard: (filters?: object) => [...queryKeys.snags.all, "dashboard", filters ?? {}] as const,
  },
  occ: {
    all: ["occ"] as const,
    rollup: () => [...queryKeys.occ.all, "rollup"] as const,
    branchPack: (locationId?: string) => [...queryKeys.occ.all, "branch-pack", locationId ?? null] as const,
    handoverDigest: (locationId?: string) => [...queryKeys.occ.all, "handover-digest", locationId ?? null] as const,
    handovers: (locationId?: string) => [...queryKeys.occ.all, "handovers", locationId ?? null] as const,
    exceptions: () => [...queryKeys.occ.all, "exceptions"] as const,
  },
  revenue: {
    all: ["revenue"] as const,
    pace: (locationId?: string | null) => [...queryKeys.revenue.all, "pace", locationId ?? null] as const,
    pnl: () => [...queryKeys.revenue.all, "pnl"] as const,
    leakage: (locationId?: string | null) => [...queryKeys.revenue.all, "leakage", locationId ?? null] as const,
    assetRoi: (locationId?: string | null) => [...queryKeys.revenue.all, "asset-roi", locationId ?? null] as const,
    monthlyProgress: (locationId?: string | null) =>
      [...queryKeys.revenue.all, "monthly-progress", locationId ?? null] as const,
    syncStatus: () => [...queryKeys.revenue.all, "sync-status"] as const,
  },
  ceo: {
    all: ["ceo"] as const,
    overview: () => [...queryKeys.ceo.all, "overview"] as const,
    tickets: () => [...queryKeys.ceo.all, "tickets"] as const,
    incidents: () => [...queryKeys.ceo.all, "incidents"] as const,
  },
  admin: {
    all: ["admin"] as const,
    users: () => [...queryKeys.admin.all, "users"] as const,
    translations: (locale: string) =>
      [...queryKeys.admin.all, "translations", locale] as const,
    diagnostics: () => [...queryKeys.admin.all, "diagnostics"] as const,
    aiIntegrations: () => [...queryKeys.admin.all, "ai-integrations"] as const,
  },
  branches: {
    all: ["branches"] as const,
    league: () => [...queryKeys.branches.all, "league"] as const,
  },
  risk: {
    all: ["risk"] as const,
    list: (filters?: object) => [...queryKeys.risk.all, "list", filters ?? {}] as const,
    summary: (filters?: object) => [...queryKeys.risk.all, "summary", filters ?? {}] as const,
  },
  customer: {
    all: ["customer"] as const,
    complaints: (filters?: object) => [...queryKeys.customer.all, "complaints", filters ?? {}] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    items: () => [...queryKeys.inventory.all, "items"] as const,
    stock: (locationId?: string | null, filters?: object) =>
      [...queryKeys.inventory.all, "stock", locationId ?? null, filters ?? {}] as const,
    alerts: (locationId?: string | null) => [...queryKeys.inventory.all, "alerts", locationId ?? null] as const,
    dashboard: (filters?: object) => [...queryKeys.inventory.all, "dashboard", filters ?? {}] as const,
  },
  dailyOps: {
    all: ["dailyOps"] as const,
    kpis: (locationId?: string | null) => [...queryKeys.dailyOps.all, "kpis", locationId ?? null] as const,
    briefings: (locationId?: string | null) => [...queryKeys.dailyOps.all, "briefings", locationId ?? null] as const,
    incidents: (locationId?: string | null) => [...queryKeys.dailyOps.all, "incidents", locationId ?? null] as const,
    maintenance: (locationId?: string | null) => [...queryKeys.dailyOps.all, "maintenance", locationId ?? null] as const,
    roster: (locationId?: string | null) => [...queryKeys.dailyOps.all, "roster", locationId ?? null] as const,
    shiftRoster: (locationId?: string | null, from?: string | null, to?: string | null) =>
      [...queryKeys.dailyOps.all, "shiftRoster", locationId ?? null, from ?? null, to ?? null] as const,
    rosterUploads: (locationId?: string | null) =>
      [...queryKeys.dailyOps.all, "rosterUploads", locationId ?? null] as const,
    complaints: (locationId?: string | null) => [...queryKeys.dailyOps.all, "complaints", locationId ?? null] as const,
  },
  weeklyReports: {
    all: ["weeklyReports"] as const,
    list: (filters?: object) => [...queryKeys.weeklyReports.all, "list", filters ?? {}] as const,
    detail: (id?: string | null) => [...queryKeys.weeklyReports.all, "detail", id ?? null] as const,
    executiveDashboard: (weekStart: string) =>
      [...queryKeys.weeklyReports.all, "executive-dashboard", weekStart] as const,
    executiveList: (weekStart?: string | null) =>
      [...queryKeys.weeklyReports.all, "executive-list", weekStart ?? null] as const,
    executiveDetail: (id?: string | null) =>
      [...queryKeys.weeklyReports.all, "executive", id ?? null] as const,
  },
  procurement: {
    all: ["procurement"] as const,
    dashboard: (locationId?: string | null) =>
      [...queryKeys.procurement.all, "dashboard", locationId ?? null] as const,
    list: (filters?: object) => [...queryKeys.procurement.all, "list", filters ?? {}] as const,
    detail: (id?: string | null) => [...queryKeys.procurement.all, "detail", id ?? null] as const,
    options: () => [...queryKeys.procurement.all, "options"] as const,
    config: () => [...queryKeys.procurement.all, "config"] as const,
  },
  events: {
    all: ["events"] as const,
    dashboard: (locationId?: string | null) =>
      [...queryKeys.events.all, "dashboard", locationId ?? null] as const,
    list: (filters?: object) => [...queryKeys.events.all, "list", filters ?? {}] as const,
    calendar: (month: string, locationId?: string | null) =>
      [...queryKeys.events.all, "calendar", month, locationId ?? null] as const,
    myTasks: (locationId?: string | null) =>
      [...queryKeys.events.all, "my-tasks", locationId ?? null] as const,
    options: () => [...queryKeys.events.all, "options"] as const,
    detail: (id?: string | null) => [...queryKeys.events.all, "detail", id ?? null] as const,
    scope: (id?: string | null) => [...queryKeys.events.all, "scope", id ?? null] as const,
    plan: (id?: string | null) => [...queryKeys.events.all, "plan", id ?? null] as const,
    budget: (id?: string | null) => [...queryKeys.events.all, "budget", id ?? null] as const,
    reports: (filters?: object) => [...queryKeys.events.all, "reports", filters ?? {}] as const,
  },
} as const;
