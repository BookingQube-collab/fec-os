export const EVENT_STATUSES = ["draft", "active", "on_hold", "cancelled", "closed"] as const;
export const EVENT_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export const EVENT_RAG = ["green", "amber", "red", "critical"] as const;
export const TASK_STATUSES = [
  "not_started",
  "planned",
  "in_progress",
  "waiting",
  "blocked",
  "under_review",
  "completed",
  "cancelled",
] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent", "critical"] as const;
export const DELIVERABLE_STATUSES = ["pending", "in_progress", "done", "cancelled"] as const;
export const MILESTONE_STATUSES = ["pending", "achieved", "missed"] as const;
export const DEP_TYPES = ["FS", "SS", "FF", "SF"] as const;
export const WBS_NODE_TYPES = ["phase", "workstream", "task", "subtask"] as const;
export const WBS_MAX_DEPTH = 3;
export const CLOSED_TASK_STATUSES = new Set(["completed", "cancelled"]);
export const BUDGET_STATUSES = ["draft", "approved", "locked"] as const;
export const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const RISK_STATUSES = ["open", "mitigating", "closed"] as const;
export const BASELINE_TYPES = ["schedule", "scope", "both", "budget"] as const;
export const INVOICE_STATUSES = ["draft", "submitted", "partial", "paid", "overdue"] as const;
export const TASK_APPROVAL_STATUSES = ["not_required", "pending", "approved", "rejected"] as const;
export const TASK_ESCALATION_LEVELS = ["none", "team", "pm", "director", "exec"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "blocked", "resolved", "closed"] as const;
export const ISSUE_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const DOCUMENT_TYPES = [
  "boq",
  "permit",
  "drawing",
  "floor_plan",
  "contract",
  "insurance",
  "photo",
  "manual",
  "other",
] as const;
export const DOCUMENT_STATUSES = ["missing", "uploaded", "waived"] as const;
export const PAYABLE_KINDS = ["po", "payment"] as const;
export const PAYABLE_STATUSES = ["pending", "partial", "paid", "overdue", "cancelled"] as const;
export const ASSET_MOVE_STATUSES = ["planned", "moved", "on_site", "missing", "returned"] as const;
export const WORKSTREAM_DEPT_STATUSES = ["not_started", "on_track", "delayed", "blocked"] as const;
export const PENDING_PO_STATUSES = new Set(["draft", "pending_approval", "approved"]);
export const OPEN_ISSUE_STATUSES = new Set(["open", "in_progress", "blocked"]);

export const READINESS_CATEGORIES = [
  "scope",
  "approvals",
  "budget",
  "procurement",
  "suppliers",
  "inventory",
  "manpower",
  "logistics",
  "venue",
  "permits",
  "production",
  "safety",
] as const;

export const READINESS_CATEGORY_WEIGHTS: Record<(typeof READINESS_CATEGORIES)[number], number> = {
  scope: 10,
  approvals: 8,
  budget: 10,
  procurement: 10,
  suppliers: 8,
  inventory: 6,
  manpower: 8,
  logistics: 6,
  venue: 8,
  permits: 8,
  production: 10,
  safety: 8,
};

/** Default checklist seeded on create — codes are also used as stage-gate readiness_item keys. */
export const DEFAULT_READINESS_ITEMS: Array<{
  code: string;
  title: string;
  category: (typeof READINESS_CATEGORIES)[number];
  weight: number;
  phase_code: string;
}> = [
  { code: "client_brief", title: "Client brief signed", category: "scope", weight: 10, phase_code: "initiation" },
  { code: "objectives", title: "Event objectives agreed", category: "scope", weight: 8, phase_code: "initiation" },
  { code: "location_dates", title: "Location and dates locked", category: "venue", weight: 8, phase_code: "initiation" },
  { code: "capacity", title: "Capacity and audience size set", category: "scope", weight: 6, phase_code: "initiation" },
  { code: "scope_approved", title: "Client-approved scope", category: "approvals", weight: 12, phase_code: "initiation" },
  { code: "stakeholders", title: "Stakeholders mapped", category: "approvals", weight: 6, phase_code: "initiation" },
  { code: "site_survey", title: "Site survey complete", category: "venue", weight: 8, phase_code: "feasibility" },
  { code: "measurements", title: "Site measurements recorded", category: "venue", weight: 6, phase_code: "feasibility" },
  { code: "utilities", title: "Utilities survey complete", category: "venue", weight: 6, phase_code: "feasibility" },
  { code: "site_access", title: "Access route confirmed", category: "venue", weight: 6, phase_code: "feasibility" },
  { code: "permits_identified", title: "Required permits identified", category: "permits", weight: 12, phase_code: "feasibility" },
  { code: "risk_assessment", title: "Risk assessment completed", category: "safety", weight: 12, phase_code: "feasibility" },
  { code: "budget_ack", title: "Estimated budget reviewed with finance", category: "budget", weight: 8, phase_code: "budget_approval" },
  { code: "quotation_compare", title: "Quotation comparison complete", category: "budget", weight: 8, phase_code: "budget_approval" },
  { code: "payment_schedule", title: "Payment schedule agreed", category: "budget", weight: 6, phase_code: "budget_approval" },
  { code: "floor_plan", title: "Layout / floor plan approved", category: "venue", weight: 8, phase_code: "design" },
  { code: "renders", title: "Renders issued", category: "production", weight: 6, phase_code: "design" },
  { code: "branding_pack", title: "Branding pack approved", category: "production", weight: 6, phase_code: "design" },
  { code: "power_plan", title: "Electrical / load plan", category: "production", weight: 8, phase_code: "design" },
  { code: "equipment_list", title: "Equipment list locked", category: "inventory", weight: 6, phase_code: "design" },
  { code: "customer_flow", title: "Customer flow approved", category: "venue", weight: 6, phase_code: "design" },
  { code: "critical_prs", title: "Critical purchase items approved", category: "procurement", weight: 12, phase_code: "procurement" },
  { code: "pos_issued", title: "Purchase orders issued", category: "procurement", weight: 8, phase_code: "procurement" },
  { code: "critical_suppliers", title: "Critical suppliers appointed", category: "suppliers", weight: 12, phase_code: "procurement" },
  { code: "delivery_dates", title: "Delivery dates confirmed", category: "procurement", weight: 8, phase_code: "procurement" },
  { code: "payment_status", title: "Supplier payment status reviewed", category: "budget", weight: 6, phase_code: "procurement" },
  { code: "production_schedule", title: "Production schedule available", category: "production", weight: 12, phase_code: "pre_production" },
  { code: "fabrication", title: "Fabrication in progress or complete", category: "production", weight: 8, phase_code: "pre_production" },
  { code: "printing", title: "Printing complete", category: "production", weight: 6, phase_code: "pre_production" },
  { code: "equipment_prep", title: "Equipment prepared", category: "inventory", weight: 8, phase_code: "pre_production" },
  { code: "preprod_testing", title: "Pre-production testing done", category: "production", weight: 6, phase_code: "pre_production" },
  { code: "packing", title: "Packing list complete", category: "logistics", weight: 6, phase_code: "pre_production" },
  { code: "kit_list", title: "Kit / inventory list drafted", category: "inventory", weight: 8, phase_code: "pre_production" },
  { code: "manpower_plan", title: "Manpower requirement completed", category: "manpower", weight: 12, phase_code: "staffing" },
  { code: "roster", title: "Roster published", category: "manpower", weight: 8, phase_code: "staffing" },
  { code: "uniforms", title: "Uniforms confirmed", category: "manpower", weight: 6, phase_code: "staffing" },
  { code: "training", title: "Staff training complete", category: "manpower", weight: 8, phase_code: "staffing" },
  { code: "access_passes", title: "Access passes issued", category: "manpower", weight: 6, phase_code: "staffing" },
  { code: "logistics_plan", title: "Vehicle / logistics plan drafted", category: "logistics", weight: 8, phase_code: "logistics" },
  { code: "loading_list", title: "Loading list complete", category: "logistics", weight: 6, phase_code: "logistics" },
  { code: "delivery_slots", title: "Delivery slots booked", category: "logistics", weight: 8, phase_code: "logistics" },
  { code: "mall_access", title: "Mall / venue access booked", category: "venue", weight: 8, phase_code: "logistics" },
  { code: "asset_movement_plan", title: "Asset movement plan issued", category: "inventory", weight: 6, phase_code: "logistics" },
  { code: "installation", title: "Installation complete", category: "production", weight: 8, phase_code: "bump_in" },
  { code: "technical_setup", title: "Technical setup complete", category: "production", weight: 8, phase_code: "bump_in" },
  { code: "pos_setup", title: "POS live on site", category: "production", weight: 8, phase_code: "bump_in" },
  { code: "network_setup", title: "Network live on site", category: "production", weight: 6, phase_code: "bump_in" },
  { code: "branding_install", title: "Branding installed", category: "production", weight: 6, phase_code: "bump_in" },
  { code: "inspections", title: "Site inspections passed", category: "safety", weight: 8, phase_code: "bump_in" },
  { code: "equipment_testing", title: "Equipment testing complete", category: "production", weight: 8, phase_code: "testing" },
  { code: "safety_checks", title: "Safety checks complete", category: "safety", weight: 10, phase_code: "testing" },
  { code: "snagging", title: "Snagging closed or accepted", category: "safety", weight: 8, phase_code: "testing" },
  { code: "operational_rehearsal", title: "Operational rehearsal complete", category: "production", weight: 8, phase_code: "testing" },
  { code: "run_of_show", title: "Run of show draft", category: "production", weight: 8, phase_code: "testing" },
  { code: "go_live_approval", title: "Opening / go-live approval", category: "approvals", weight: 12, phase_code: "go_live" },
  { code: "command_structure", title: "Command structure posted", category: "approvals", weight: 8, phase_code: "go_live" },
  { code: "incident_reporting", title: "Incident reporting live", category: "safety", weight: 6, phase_code: "go_live" },
  { code: "daily_reporting", title: "Daily reporting cadence set", category: "approvals", weight: 6, phase_code: "go_live" },
  { code: "comms", title: "Client comms cadence set", category: "approvals", weight: 6, phase_code: "go_live" },
  { code: "sales_ops", title: "Sales process live", category: "production", weight: 6, phase_code: "operations" },
  { code: "attendance_ops", title: "Attendance tracking live", category: "manpower", weight: 6, phase_code: "operations" },
  { code: "staffing_ops", title: "Live staffing covered", category: "manpower", weight: 6, phase_code: "operations" },
  { code: "maintenance_ops", title: "Maintenance cover in place", category: "production", weight: 6, phase_code: "operations" },
  { code: "stock_ops", title: "Stock / consumables tracked", category: "inventory", weight: 6, phase_code: "operations" },
  { code: "incidents_ops", title: "Incidents logged daily", category: "safety", weight: 6, phase_code: "operations" },
  { code: "feedback_ops", title: "Guest feedback captured", category: "approvals", weight: 4, phase_code: "operations" },
  { code: "dismantling", title: "Dismantling complete", category: "production", weight: 8, phase_code: "bump_out" },
  { code: "asset_reconciliation", title: "Asset reconciliation complete", category: "inventory", weight: 10, phase_code: "bump_out" },
  { code: "return_transport", title: "Return transport complete", category: "logistics", weight: 8, phase_code: "bump_out" },
  { code: "damage_reporting", title: "Damage report issued", category: "safety", weight: 6, phase_code: "bump_out" },
  { code: "supplier_settlement", title: "Supplier settlement complete", category: "budget", weight: 8, phase_code: "closure" },
  { code: "final_cost", title: "Final cost locked", category: "budget", weight: 8, phase_code: "closure" },
  { code: "profitability_review", title: "Profitability reviewed", category: "budget", weight: 8, phase_code: "closure" },
  { code: "lessons_learned", title: "Lessons learned recorded", category: "approvals", weight: 8, phase_code: "closure" },
  { code: "closure_signoff", title: "Closure sign-off", category: "approvals", weight: 10, phase_code: "closure" },
  { code: "venue_confirmed", title: "Venue confirmed", category: "venue", weight: 10, phase_code: "feasibility" },
  { code: "permits", title: "Permits in progress or issued", category: "permits", weight: 8, phase_code: "feasibility" },
  { code: "insurance", title: "Insurance certificate", category: "safety", weight: 8, phase_code: "feasibility" },
  { code: "safety", title: "HSE briefing prepared", category: "safety", weight: 8, phase_code: "testing" },
];

export const EARLY_STAGE_CODES = new Set([
  "initiation",
  "feasibility",
  "budget_approval",
  "design",
  "lead",
  "opportunity",
  "proposal_prep",
  "proposal_submitted",
  "negotiation",
  "inquiry",
  "proposal",
]);

export const LIVE_STAGE_CODES = new Set([
  "bump_in",
  "testing",
  "go_live",
  "operations",
  "setup",
  "ready_for_opening",
  "live_event",
  "live",
]);

export const SIDE_STAGE_CODES = new Set(["cancelled", "on_hold"]);

export const PENDING_PR_STATUSES = new Set([
  "draft",
  "submitted",
  "dept_review",
  "gm_review",
  "ceo_review",
  "finance_review",
  "procurement_review",
  "returned",
  "on_hold",
]);

export const APPROVED_PR_STATUSES = new Set(["approved", "po_created"]);

export const REJECTED_PR_STATUSES = new Set(["rejected", "cancelled"]);

export const EVENT_DATE_FIELDS = [
  "planning_start",
  "venue_access",
  "setup_start",
  "setup_end",
  "rehearsal_date",
  "client_inspection_date",
  "event_start",
  "event_end",
  "dismantle_start",
  "dismantle_end",
  "handover_date",
  "financial_close_target",
  "final_closure_date",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];
export type EventPriority = (typeof EVENT_PRIORITIES)[number];
export type EventRag = (typeof EVENT_RAG)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type DepType = (typeof DEP_TYPES)[number];
export type WbsNodeType = (typeof WBS_NODE_TYPES)[number];
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];
export type RiskStatus = (typeof RISK_STATUSES)[number];
export type BaselineType = (typeof BASELINE_TYPES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];
export type TaskApprovalStatus = (typeof TASK_APPROVAL_STATUSES)[number];
export type TaskEscalationLevel = (typeof TASK_ESCALATION_LEVELS)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type PayableKind = (typeof PAYABLE_KINDS)[number];
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];
export type AssetMoveStatus = (typeof ASSET_MOVE_STATUSES)[number];
export type WorkstreamDeptStatus = (typeof WORKSTREAM_DEPT_STATUSES)[number];
