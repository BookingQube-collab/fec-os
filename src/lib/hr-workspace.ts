export type HrWorkspaceStatus = "live" | "partial" | "later";

export interface HrWorkspaceModule {
  id: string;
  labelKey: string;
  href: string | null;
  status: HrWorkspaceStatus;
  phase: string | null;
}

/** Shell index for HRMS 2.0. Later rows are placeholders, not new modules. */
export const HR_WORKSPACE_MODULES: HrWorkspaceModule[] = [
  { id: "01", labelKey: "hr.workspace.modules.command", href: "/people/hr", status: "partial", phase: null },
  { id: "02", labelKey: "hr.workspace.modules.employees", href: "/people", status: "partial", phase: null },
  { id: "03", labelKey: "hr.workspace.modules.recruitment", href: "/people/recruitment", status: "partial", phase: null },
  { id: "04", labelKey: "hr.workspace.modules.attendance", href: "/people/attendance", status: "partial", phase: null },
  { id: "05", labelKey: "hr.workspace.modules.rosters", href: "/people/roster", status: "partial", phase: null },
  { id: "06", labelKey: "hr.workspace.modules.leave", href: "/people/leave", status: "partial", phase: null },
  { id: "07", labelKey: "hr.workspace.modules.payroll", href: "/people/payroll", status: "partial", phase: null },
  { id: "08", labelKey: "hr.workspace.modules.performance", href: "/people/performance", status: "partial", phase: null },
  { id: "09", labelKey: "hr.workspace.modules.learning", href: "/people/training", status: "partial", phase: null },
  { id: "10", labelKey: "hr.workspace.modules.engagement", href: "/people/hr/engagement", status: "partial", phase: null },
  { id: "11", labelKey: "hr.workspace.modules.planning", href: "/people/hr/quota", status: "partial", phase: null },
  { id: "12", labelKey: "hr.workspace.modules.compliance", href: null, status: "later", phase: "P7" },
  { id: "13", labelKey: "hr.workspace.modules.relations", href: "/people/hr/warnings", status: "partial", phase: null },
  { id: "14", labelKey: "hr.workspace.modules.documents", href: "/people/hr/documents", status: "partial", phase: null },
  { id: "15", labelKey: "hr.workspace.modules.lifecycle", href: "/people/hr/onboarding", status: "partial", phase: null },
  { id: "16", labelKey: "hr.workspace.modules.ess", href: "/hr/me", status: "partial", phase: null },
  { id: "17", labelKey: "hr.workspace.modules.reports", href: "/people/hr/reports", status: "partial", phase: null },
  { id: "18", labelKey: "hr.workspace.modules.workflow", href: null, status: "later", phase: "P10" },
  { id: "19", labelKey: "hr.workspace.modules.copilot", href: null, status: "later", phase: "P9" },
  { id: "20", labelKey: "hr.workspace.modules.admin", href: "/people/hr/settings", status: "partial", phase: null },
  { id: "ac", labelKey: "hr.workspace.modules.actionCenter", href: null, status: "later", phase: "P9" },
];
