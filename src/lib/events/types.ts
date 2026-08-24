import type {
  AssetMoveStatus,
  BudgetStatus,
  DeliverableStatus,
  DepType,
  DocumentStatus,
  DocumentType,
  EventPriority,
  EventRag,
  EventStatus,
  InvoiceStatus,
  IssueSeverity,
  IssueStatus,
  MilestoneStatus,
  PayableKind,
  PayableStatus,
  ReadinessCategory,
  RiskSeverity,
  RiskStatus,
  TaskApprovalStatus,
  TaskEscalationLevel,
  TaskPriority,
  TaskStatus,
  WbsNodeType,
  WorkstreamDeptStatus,
} from "@/lib/events/constants";
import type { GateEval, HealthResult } from "@/lib/events/health";
import type { WorkstreamCode } from "@/lib/events/workstreams";

export interface EventLookup {
  id: string;
  code: string;
  label_en: string;
  label_ar: string;
  sort_order: number;
  active?: boolean;
  is_critical?: boolean;
  is_terminal?: boolean;
  is_linear?: boolean;
}

export interface EventStage extends EventLookup {
  is_critical: boolean;
  is_terminal: boolean;
  is_linear: boolean;
}

export interface EventGateRequirement {
  id: string;
  stage_id: string;
  code: string;
  label_en: string;
  label_ar: string;
  requirement_kind: string;
  is_blocking: boolean;
  threshold: number | null;
  sort_order: number;
  readiness_code?: string | null;
}

export interface EventListRow {
  id: string;
  event_number: string | null;
  name: string;
  event_name: string | null;
  client_name: string | null;
  venue_name: string | null;
  location_id: string;
  location_name: string | null;
  event_type_id: string | null;
  event_type_code: string | null;
  classification_id: string | null;
  stage_id: string | null;
  stage_code: string | null;
  stage_label_en: string | null;
  stage_label_ar: string | null;
  status: EventStatus;
  priority: EventPriority;
  event_start: string | null;
  event_end: string | null;
  setup_start: string | null;
  dismantle_date: string | null;
  pm_staff_id: string | null;
  pm_name: string | null;
  contracted_value: number | null;
  health_rag: EventRag;
  health_computed: EventRag;
  health_overridden: boolean;
  health_score: number;
  readiness_pct: number;
  days_until_event: number | null;
  currency: string;
  go_live_approved: boolean;
  overall_progress: number | null;
  pending_prs: number;
  linked_prs: number;
  overdue_prs: number;
  open_maintenance: number;
  staffing_assigned: number;
  overdue_hr_tasks: number;
  budget_revised?: number;
  budget_actual?: number;
  budget_committed?: number;
  saved_vs_budget?: number;
}

export interface EventBudgetTotals {
  original: number | null;
  approvedChanges: number | null;
  revised: number | null;
  committed: number | null;
  actual: number | null;
  forecast: number | null;
  variance: number | null;
  varianceForecast: number | null;
  varianceCommitted: number | null;
  remaining: number | null;
  contractValue: number | null;
  additionalRevenue: number | null;
  changeOrders: number | null;
  discounts: number | null;
  taxes: number | null;
  finalRevenue: number | null;
  recognizedRevenue: number | null;
  grossProfit: number | null;
  forecastProfit: number | null;
  actualProfit: number | null;
  marginPct: number | null;
  originalMarginPct: number | null;
  revisedMarginPct: number | null;
  forecastMarginPct: number | null;
  actualMarginPct: number | null;
  receivable: number | null;
  payable: number | null;
  hasBudget: boolean;
  hasInvoices: boolean;
}

export interface EventOpsSummary {
  tasksTotal: number;
  tasksCompleted: number;
  tasksOverdue: number;
  tasksCritical: number;
  openRisks: number;
  criticalRisks: number;
  openIssues: number | null;
  criticalIssues: number | null;
  pendingPrs: number;
  pendingPos: number | null;
  pendingPayments: number | null;
  pendingApprovals: number | null;
  procurementPct: number | null;
  manpowerPct: number | null;
  logisticsPct: number | null;
  inventoryPct: number | null;
  permitPct: number | null;
  linkedPrCount: number;
  overduePrs: number;
  blockedTasks: number;
  openSnags: number;
  criticalSafety: number;
  missingAssets: number;
  bumpInPct: number | null;
  staffingPct: number | null;
  procurementRisks: number;
}

export interface EventDetail extends EventListRow {
  description: string | null;
  notes: string | null;
  lessons_learned: string | null;
  inquiry_date: string | null;
  contract_date: string | null;
  setup_end: string | null;
  classification_code: string | null;
  client_contact: string | null;
  business_unit: string | null;
  director_staff_id: string | null;
  director_name: string | null;
  department_id: string | null;
  department_name: string | null;
  country: string | null;
  city: string | null;
  planning_start: string | null;
  venue_access: string | null;
  rehearsal_date: string | null;
  client_inspection_date: string | null;
  dismantle_start: string | null;
  dismantle_end: string | null;
  handover_date: string | null;
  financial_close_target: string | null;
  final_closure_date: string | null;
  health_override_rag: EventRag | null;
  health_override_justification: string | null;
  event_type_label_en: string | null;
  event_type_label_ar: string | null;
  go_live_approved_at: string | null;
  bump_in_start: string | null;
  bump_in_end: string | null;
  bump_out_start: string | null;
  bump_out_end: string | null;
}

export interface EventOverview {
  event: EventDetail;
  stages: EventStage[];
  nextStage: EventStage | null;
  gates: GateEval[];
  health: HealthResult;
  readinessParts: Record<string, number>;
  readinessBand: EventRag;
  finance: EventBudgetTotals;
  budgetStatus: BudgetStatus | null;
  tasks: { total: number; completed: number; overdue: number; overdueCritical: number };
  ops: EventOpsSummary;
  risks: EventRiskRow[];
  readinessItems: EventReadinessRow[];
  team: Array<{ id: string; staff_id: string; full_name: string; role_label: string; is_pm: boolean }>;
  audit: EventAuditRow[];
  linkedPrCount: number;
  linkedPrs: EventLinkedPrRow[];
  linkedMaintenance: EventLinkedMaintenanceRow[];
  documents: EventDocumentRow[];
  issues: EventIssueRow[];
  payables: EventPayableRow[];
  assets: EventAssetRow[];
  workstreams: EventWorkstreamStatus[];
  overdueActions: EventTaskRow[];
}

export interface EventDocumentStub {
  title: string;
  url: string;
}

export interface EventChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface EventTaskComment {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

export interface EventScheduleVariance {
  startDays: number | null;
  dueDays: number | null;
  progressDelta: number | null;
}

export interface EventTaskRow {
  id: string;
  event_id: string;
  task_number: string | null;
  wbs_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  duration_days: number | null;
  owner_staff_id: string | null;
  owner_name: string | null;
  assignee_staff_id: string | null;
  assignee_name: string | null;
  department_id: string | null;
  department_name: string | null;
  percent_complete: number;
  is_critical: boolean;
  is_milestone: boolean;
  estimated_hours: number | null;
  actual_hours: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  checklist: EventChecklistItem[];
  comments: EventTaskComment[];
  documents: EventDocumentStub[];
  supporter_ids: string[];
  supporter_names: string[];
  approval_status: TaskApprovalStatus;
  delay_reason: string | null;
  escalation_level: TaskEscalationLevel;
  cost_impact: number | null;
  evidence_url: string | null;
  is_snag: boolean;
  phase_id: string | null;
  phase_title: string | null;
  workstream_id: string | null;
  workstream_title: string | null;
  workstream_code: string | null;
  lifecycle_phase: string | null;
  baseline_start: string | null;
  baseline_due: string | null;
  baseline_percent: number | null;
  variance: EventScheduleVariance;
  event_name?: string;
  event_number?: string | null;
}

export interface EventWbsNode {
  id: string;
  event_id: string;
  parent_id: string | null;
  node_type: WbsNodeType;
  code: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  owner_staff_id: string | null;
  owner_name: string | null;
  budget_amount: number;
  actual_cost: number;
  start_date: string | null;
  due_date: string | null;
  percent_complete: number;
  documents: EventDocumentStub[];
  depth: number;
  rolled_progress: number;
}

export interface EventDependencyRow {
  id: string;
  event_id: string;
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
}

export interface EventMilestoneRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  due_date: string;
  status: MilestoneStatus;
  achieved_at: string | null;
  is_critical: boolean;
  owner_staff_id: string | null;
  owner_name: string | null;
  wbs_id: string | null;
  wbs_title: string | null;
  task_id: string | null;
  task_title: string | null;
  baseline_due: string | null;
  variance_days: number | null;
}

export interface EventDeliverableRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  status: DeliverableStatus;
  due_date: string | null;
  owner_staff_id: string | null;
  owner_name: string | null;
  sort_order: number;
}

export interface EventScopeVersion {
  id: string;
  event_id: string;
  version_no: number;
  title: string;
  sections: EventScopeSection[];
  is_baseline: boolean;
  created_at: string;
}

export interface EventScopeSection {
  key: string;
  title: string;
  body: string;
}

export interface EventCostSubcategory {
  id: string;
  category_id: string;
  code: string;
  label_en: string;
  label_ar: string;
  sort_order: number;
  active?: boolean;
}

export interface EventBudgetLineRow {
  id: string;
  category_id: string;
  category_code: string;
  category_label_en: string;
  category_label_ar: string;
  subcategory_id: string | null;
  subcategory_code: string | null;
  subcategory_label_en: string | null;
  subcategory_label_ar: string | null;
  title: string;
  original_amount: number;
  approved_changes: number;
  revised_amount: number;
  committed_amount: number;
  actual_amount: number;
  forecast_amount: number;
  variance: number;
  variance_forecast: number;
  variance_committed: number;
  remaining: number;
  notes: string | null;
  sort_order: number;
}

export interface EventClientInvoiceRow {
  id: string;
  invoice_number: string;
  title: string | null;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  fx_rate: number;
  base_amount: number;
  paid_amount: number;
  outstanding: number;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
}

export interface EventLinkedPrRow {
  id: string;
  pr_number: string | null;
  title?: string | null;
  status: string;
  total_amount: number;
  currency: string;
  cost_category_id: string | null;
  category_code: string | null;
  category_label_en: string | null;
  category_label_ar: string | null;
  exceed_by: number | null;
  current_step_role?: string | null;
  required_by?: string | null;
  requester_name?: string | null;
  canAct?: boolean;
  canReissue?: boolean;
  isOwner?: boolean;
  overdue?: boolean;
  match?: "event_id" | "project_name";
}

export interface EventLinkedMaintenanceRow {
  id: string;
  request_number: string;
  status: string;
  priority: string;
  category: string;
  description: string;
  area: string | null;
  work_order_id: string | null;
  reported_at: string;
  match: "event_id" | "notes";
}

export interface EventBudgetAlert {
  kind: "line_threshold" | "forecast_over_revised" | "contingency_usage" | "pr_exceeds_category";
  categoryId?: string;
  categoryCode?: string;
  lineId?: string;
  prId?: string;
  amount: number;
  pct?: number;
}

export interface EventMarginPoint {
  key: string;
  at: string;
  marginPct: number | null;
  source: "baseline" | "derived";
}

export interface EventBudgetBaselineCompare {
  baselineId: string | null;
  savedAt: string | null;
  original: number | null;
  currentRevised: number | null;
  variance: number | null;
}

export interface EventRiskRow {
  id: string;
  title: string;
  severity: RiskSeverity;
  status: RiskStatus;
  due_date: string | null;
}

export interface EventReadinessRow {
  id: string;
  code: string;
  title: string;
  category: ReadinessCategory | string;
  is_required: boolean;
  is_complete: boolean;
  weight: number;
  phase_code?: string | null;
}

export interface EventAuditRow {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface EventBaselineSnapshotTask {
  id: string;
  task_number?: string | null;
  title: string;
  start_date: string | null;
  due_date: string | null;
  percent_complete?: number;
  status?: string;
  wbs_id?: string | null;
}

export interface EventBaselineSnapshotWbs {
  id: string;
  parent_id: string | null;
  title: string;
  node_type: string;
  start_date: string | null;
  due_date: string | null;
  budget_amount?: number;
  percent_complete?: number;
}

export interface EventBaselineRow {
  id: string;
  baseline_type: string;
  snapshot: {
    tasks?: EventBaselineSnapshotTask[];
    wbs?: EventBaselineSnapshotWbs[];
    milestones?: Array<{ id: string; title: string; due_date: string; status?: string }>;
    scope_version_id?: string | null;
    saved_at?: string;
    revenue?: {
      contractValue?: number;
      additionalRevenue?: number;
      changeOrders?: number;
      discounts?: number;
      taxes?: number;
      finalRevenue?: number;
    };
    lines?: Array<{
      id?: string;
      category_id?: string;
      category_code?: string;
      original_amount?: number;
      approved_changes?: number;
      revised_amount?: number;
      committed_amount?: number;
      actual_amount?: number;
      forecast_amount?: number;
    }>;
    totals?: { original?: number; revised?: number; forecast?: number; marginPct?: number | null };
  };
  created_at: string;
}

export interface EventDepViolation {
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  needed_date: string;
  message: string;
}

export interface EventDashboard {
  total: number;
  upcoming: number;
  live: number;
  rag: { green: number; amber: number; red: number; critical: number };
  contractedValue: number;
  budgetRevised: number;
  budgetCommitted: number;
  savedVsBudget: number;
  overdueTasks: number;
  blockedTasks: number;
  budgetActual: number;
  avgReadiness: number;
  pendingPrs: number;
  pendingPos: number;
  pendingPayments: number;
  procurementRisks: number;
  openSnags: number;
  criticalSafety: number;
  missingAssets: number;
  goLivePending: number;
  events: EventListRow[];
}

export interface EventWorkstreamStatus {
  code: WorkstreamCode;
  title_en: string;
  title_ar: string;
  wbs_id: string | null;
  status: WorkstreamDeptStatus;
  pct: number;
  taskCount: number;
  overdue: number;
  blocked: number;
}

export interface EventIssueRow {
  id: string;
  title: string;
  description: string | null;
  severity: IssueSeverity;
  status: IssueStatus;
  owner_staff_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  is_snag: boolean;
  is_safety: boolean;
  overdue: boolean;
}

export interface EventDocumentRow {
  id: string;
  title: string;
  doc_type: DocumentType;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  notes: string | null;
  required: boolean;
  status: DocumentStatus;
  owner_staff_id: string | null;
  owner_name: string | null;
  wbs_id: string | null;
  workstream_code: string | null;
  workstream_title: string | null;
  department_id: string | null;
  is_addendum: boolean;
  line_count: number;
  line_total: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string | null;
}

export interface EventBoqLineRow {
  id: string;
  event_id: string;
  document_id: string;
  workstream_code: string | null;
  line_no: number;
  description: string;
  qty: number;
  unit: string | null;
  rate: number | null;
  amount: number;
  cost_category: string | null;
}

export interface EventPayableRow {
  id: string;
  kind: PayableKind;
  title: string;
  reference: string | null;
  vendor_name: string | null;
  amount: number;
  currency: string;
  status: PayableStatus;
  due_date: string | null;
  source: "payable" | "po" | "pr";
}

export interface EventAssetRow {
  id: string;
  item_name: string;
  qty: number;
  status: AssetMoveStatus;
  due_date: string | null;
  notes: string | null;
}
