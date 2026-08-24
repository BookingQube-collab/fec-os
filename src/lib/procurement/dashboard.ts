import type { AppRole } from "@/lib/rbac";
import { resolvePrActions } from "@/lib/procurement/actions";

export const PENDING_STATUSES = [
  "submitted",
  "dept_review",
  "gm_review",
  "ceo_review",
  "finance_review",
  "procurement_review",
] as const;

export const TERMINAL_STATUSES = ["approved", "rejected", "cancelled", "po_created"] as const;

export const PIPELINE_KEYS = [
  "draft",
  "dept",
  "gm",
  "ceo",
  "finance",
  "approved",
  "po",
] as const;

export type PipelineKey = (typeof PIPELINE_KEYS)[number];

const PIPELINE_STATUS_MAP: Record<string, PipelineKey> = {
  draft: "draft",
  submitted: "dept",
  dept_review: "dept",
  gm_review: "gm",
  ceo_review: "ceo",
  finance_review: "finance",
  procurement_review: "finance",
  approved: "approved",
  po_created: "po",
};

export type PrDashboardListRow = {
  id: string;
  pr_number: string | null;
  requested_at: string | null;
  requester_name: string;
  department_name: string;
  location_name: string;
  vendor_name: string | null;
  purpose: string;
  total_amount: number;
  status: string;
  current_step_role: string | null;
  required_by: string | null;
  priority: string;
  days_overdue: number | null;
  canAct: boolean;
  canReissue: boolean;
  isOwner: boolean;
};

export type PrDashboardNamedAmount = {
  id: string | null;
  name: string;
  count: number;
  amount: number;
};

export type PrDashboardPipelineStep = {
  key: PipelineKey;
  count: number;
  amount: number;
};

export type ProcurementDashboardData = {
  total: number;
  value: number;
  pending: number;
  approved: number;
  rejected: number;
  overdue: number;
  open: number;
  drafts: number;
  pendingMine: number;
  approvedThisPeriod: number;
  returned: number;
  urgent: number;
  requestedValue: number;
  approvedValue: number;
  orderedValue: number;
  requestedValuePeriod: number;
  approvedValuePeriod: number;
  orderedValuePeriod: number;
  periodStart: string;
  pipeline: PrDashboardPipelineStep[];
  spendByDepartment: PrDashboardNamedAmount[];
  spendBySite: PrDashboardNamedAmount[];
  vendors: PrDashboardNamedAmount[];
  needsAction: PrDashboardListRow[];
  recent: PrDashboardListRow[];
  overdueList: PrDashboardListRow[];
  urgentList: PrDashboardListRow[];
};

export type PrHeaderRow = {
  id: string;
  pr_number: string | null;
  requested_at: string | null;
  requested_by: string;
  department_id: string | null;
  location_id: string;
  justification: string | null;
  total_amount: number | null;
  status: string;
  current_step_role: string | null;
  required_by: string | null;
  priority: string | null;
  created_at: string;
};

export function monthStartIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isWatchStatus(status: string): boolean {
  return isPendingStatus(status) || status === "on_hold";
}

export function daysOverdue(requiredBy: string | null, today: string, status: string): number | null {
  if (!requiredBy || requiredBy >= today) return null;
  if (!isWatchStatus(status)) return null;
  const start = Date.parse(`${requiredBy}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function isPendingStatus(status: string): boolean {
  return (PENDING_STATUSES as readonly string[]).includes(status);
}

export function isApprovedStatus(status: string): boolean {
  return status === "approved" || status === "po_created";
}

export function isRejectedStatus(status: string): boolean {
  return status === "rejected";
}

/** Requester-side work (not waiting on an approver). */
export function isActiveWorkStatus(status: string): boolean {
  return status === "draft" || status === "returned" || status === "changes_requested" || status === "on_hold";
}

export type PrStatusBucket = "pending" | "approved" | "rejected" | "other";

export function statusBucket(status: string): PrStatusBucket {
  if (isPendingStatus(status)) return "pending";
  if (isApprovedStatus(status)) return "approved";
  if (isRejectedStatus(status)) return "rejected";
  return "other";
}

export function isOpenStatus(status: string): boolean {
  return isPendingStatus(status);
}

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function pipelineKeyForStatus(status: string): PipelineKey | null {
  return PIPELINE_STATUS_MAP[status] ?? null;
}

export function emptyPipeline(): PrDashboardPipelineStep[] {
  return PIPELINE_KEYS.map((key) => ({ key, count: 0, amount: 0 }));
}

export function isPendingMine(
  row: Pick<PrHeaderRow, "requested_by" | "current_step_role" | "status">,
  userId: string,
  roles: AppRole[],
): boolean {
  return resolvePrActions({
    status: row.status,
    currentStepRole: row.current_step_role,
    requestedBy: row.requested_by,
    userId,
    roles,
  }).canAct;
}

export function isUrgentPriority(priority: string | null | undefined): boolean {
  return priority === "high" || priority === "emergency";
}

export function priorityRank(priority: string | null | undefined): number {
  if (priority === "emergency") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  return 3;
}

export function amountOf(row: Pick<PrHeaderRow, "total_amount">): number {
  return Number(row.total_amount ?? 0);
}

export function addNamedAmount(
  map: Map<string, PrDashboardNamedAmount>,
  id: string | null,
  name: string,
  amount: number,
) {
  const key = id ?? `__${name}`;
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.amount += amount;
    return;
  }
  map.set(key, { id, name, count: 1, amount });
}

export function topNamed(map: Map<string, PrDashboardNamedAmount>, limit = 8): PrDashboardNamedAmount[] {
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, limit);
}

export function toListRow(
  row: PrHeaderRow,
  names: {
    requester: string;
    department: string;
    location: string;
    vendor: string | null;
  },
  today: string,
  actor: { userId: string; roles: AppRole[] },
): PrDashboardListRow {
  const flags = resolvePrActions({
    status: row.status,
    currentStepRole: row.current_step_role,
    requestedBy: row.requested_by,
    userId: actor.userId,
    roles: actor.roles,
  });
  return {
    id: row.id,
    pr_number: row.pr_number,
    requested_at: row.requested_at,
    requester_name: names.requester,
    department_name: names.department,
    location_name: names.location,
    vendor_name: names.vendor,
    purpose: (row.justification ?? "").slice(0, 80),
    total_amount: amountOf(row),
    status: row.status,
    current_step_role: row.current_step_role,
    required_by: row.required_by,
    priority: row.priority ?? "normal",
    days_overdue: daysOverdue(row.required_by, today, row.status),
    canAct: flags.canAct,
    canReissue: flags.canReissue,
    isOwner: flags.isOwner,
  };
}

export function sortActionQueue(rows: PrDashboardListRow[]): PrDashboardListRow[] {
  return [...rows].sort((a, b) => {
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    return (a.required_by ?? "9999").localeCompare(b.required_by ?? "9999");
  });
}

export function sortOverdue(rows: PrDashboardListRow[]): PrDashboardListRow[] {
  return [...rows].sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0));
}
