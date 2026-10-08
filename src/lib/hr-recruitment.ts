/**
 * Workforce quota + job-request rules (Phase 9). Pure — no Supabase.
 * ATS selected/not-joined counts come from Phase 10 applications.
 */

import { HR_EMPLOYMENT_CATEGORIES, type HrEmploymentCategory } from "@/lib/hr-exit";

export { HR_EMPLOYMENT_CATEGORIES, type HrEmploymentCategory };

export const HR_JOB_REQUEST_TYPES = ["new", "replacement"] as const;
export type HrJobRequestType = (typeof HR_JOB_REQUEST_TYPES)[number];

export const HR_JOB_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type HrJobPriority = (typeof HR_JOB_PRIORITIES)[number];

export const HR_JOB_REQUEST_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "returned",
  "cancelled",
  "published",
  "on_hold",
  "closed",
] as const;
export type HrJobRequestStatus = (typeof HR_JOB_REQUEST_STATUSES)[number];

export const HR_JOB_APPROVAL_ROLES = ["dept_ops", "hr", "finance", "gm", "quota_override"] as const;
export type HrJobApprovalRole = (typeof HR_JOB_APPROVAL_ROLES)[number];

export const HR_JOB_APPROVAL_STATUSES = ["pending", "approved", "skipped", "rejected"] as const;
export type HrJobApprovalStatus = (typeof HR_JOB_APPROVAL_STATUSES)[number];

export const HR_QUOTA_OVERRIDE_STATUSES = ["none", "pending", "approved", "rejected"] as const;
export type HrQuotaOverrideStatus = (typeof HR_QUOTA_OVERRIDE_STATUSES)[number];

export const HR_VACANCY_STATUSES = ["open", "on_hold", "closed", "cancelled", "filled"] as const;
export type HrVacancyStatus = (typeof HR_VACANCY_STATUSES)[number];

/** Capability mapped per approval step (mirrors procurement STEP_CAPABILITY). */
export const JOB_STEP_CAPABILITY: Record<
  Exclude<HrJobApprovalRole, "quota_override">,
  | "recruitment.request"
  | "recruitment.manage"
  | "recruitment.view_salary_budget"
  | "quota.override_approve"
> = {
  dept_ops: "recruitment.request",
  hr: "recruitment.manage",
  finance: "recruitment.view_salary_budget",
  gm: "recruitment.manage",
};

/**
 * Default ladder: Dept/Ops → HR → (Finance if budget) → GM/CEO.
 * Quota override is a parallel gate, not a sequential step in the default list.
 */
export function defaultJobApprovalSteps(opts?: {
  requiresFinance?: boolean;
}): Array<{ stepOrder: number; stepRole: Exclude<HrJobApprovalRole, "quota_override"> }> {
  const steps: Array<{
    stepOrder: number;
    stepRole: Exclude<HrJobApprovalRole, "quota_override">;
  }> = [
    { stepOrder: 1, stepRole: "dept_ops" },
    { stepOrder: 2, stepRole: "hr" },
  ];
  if (opts?.requiresFinance) {
    steps.push({ stepOrder: 3, stepRole: "finance" });
    steps.push({ stepOrder: 4, stepRole: "gm" });
  } else {
    steps.push({ stepOrder: 3, stepRole: "gm" });
  }
  return steps;
}

export type QuotaHeadcountInput = {
  approvedHeadcount: number;
  activeCount: number;
  onLeaveCount: number;
  servingNoticeCount: number;
  openVacanciesCount: number;
  /** Phase 10 ATS — selected through ready_to_join (not yet joined). */
  selectedNotJoinedCount?: number;
};

export type QuotaHeadcountMetrics = {
  approvedQuota: number;
  activeCount: number;
  onLeaveCount: number;
  servingNoticeCount: number;
  openVacanciesCount: number;
  selectedNotJoinedCount: number;
  /** Seats still on payroll/roster (active + leave + notice). */
  occupiedCount: number;
  availablePositions: number;
  /** Positive = excess over quota; negative = shortage. */
  excessShortage: number;
};

/** Dashboard math for one quota scope. */
export function computeQuotaMetrics(input: QuotaHeadcountInput): QuotaHeadcountMetrics {
  const approved = Math.max(0, Math.floor(input.approvedHeadcount));
  const active = Math.max(0, Math.floor(input.activeCount));
  const onLeave = Math.max(0, Math.floor(input.onLeaveCount));
  const notice = Math.max(0, Math.floor(input.servingNoticeCount));
  const open = Math.max(0, Math.floor(input.openVacanciesCount));
  const selected = Math.max(0, Math.floor(input.selectedNotJoinedCount ?? 0));
  const occupied = active + onLeave + notice;
  const availablePositions = approved - occupied - open - selected;
  return {
    approvedQuota: approved,
    activeCount: active,
    onLeaveCount: onLeave,
    servingNoticeCount: notice,
    openVacanciesCount: open,
    selectedNotJoinedCount: selected,
    occupiedCount: occupied,
    availablePositions,
    excessShortage: occupied - approved,
  };
}

export type QuotaMatchDims = {
  locationId?: string | null;
  departmentId?: string | null;
  designation?: string | null;
  employmentCategory?: string | null;
};

/** Quota row matches request when every non-null quota dimension equals the request. */
export function quotaMatchesRequest(
  quota: QuotaMatchDims,
  request: QuotaMatchDims,
): boolean {
  if (quota.locationId && quota.locationId !== request.locationId) return false;
  if (quota.departmentId && quota.departmentId !== request.departmentId) return false;
  if (quota.designation) {
    const q = quota.designation.trim().toLowerCase();
    const r = (request.designation ?? "").trim().toLowerCase();
    if (q !== r) return false;
  }
  if (quota.employmentCategory) {
    const q = quota.employmentCategory.trim().toLowerCase();
    const r = (request.employmentCategory ?? "").trim().toLowerCase();
    if (q !== r) return false;
  }
  return true;
}

/**
 * AT#15 — job request vacancies checked against matching dept/location quota.
 * Prefer the most specific matching quota (most non-null dimensions).
 */
export function evaluateJobRequestAgainstQuota(input: {
  request: QuotaMatchDims & { vacanciesCount: number };
  quotas: Array<QuotaMatchDims & { approvedHeadcount: number; id?: string }>;
  occupiedCount: number;
  openVacanciesCount?: number;
  selectedNotJoinedCount?: number;
  pendingRequestVacancies?: number;
}): {
  exceeds: boolean;
  matchedQuotaId: string | null;
  approvedHeadcount: number | null;
  projectedOccupied: number;
  availableBeforeRequest: number | null;
  warning: string | null;
} {
  const matches = input.quotas.filter((q) => quotaMatchesRequest(q, input.request));
  if (!matches.length) {
    return {
      exceeds: false,
      matchedQuotaId: null,
      approvedHeadcount: null,
      projectedOccupied: input.occupiedCount + input.request.vacanciesCount,
      availableBeforeRequest: null,
      warning: null,
    };
  }
  const specificity = (q: QuotaMatchDims) =>
    [q.locationId, q.departmentId, q.designation, q.employmentCategory].filter(Boolean).length;
  matches.sort((a, b) => specificity(b) - specificity(a));
  const best = matches[0]!;
  const metrics = computeQuotaMetrics({
    approvedHeadcount: best.approvedHeadcount,
    activeCount: input.occupiedCount,
    onLeaveCount: 0,
    servingNoticeCount: 0,
    openVacanciesCount: input.openVacanciesCount ?? 0,
    selectedNotJoinedCount: input.selectedNotJoinedCount ?? 0,
  });
  const pending = Math.max(0, input.pendingRequestVacancies ?? 0);
  const projected =
    metrics.occupiedCount +
    metrics.openVacanciesCount +
    metrics.selectedNotJoinedCount +
    pending +
    input.request.vacanciesCount;
  const exceeds = projected > metrics.approvedQuota;
  return {
    exceeds,
    matchedQuotaId: best.id ?? null,
    approvedHeadcount: metrics.approvedQuota,
    projectedOccupied: projected,
    availableBeforeRequest: metrics.availablePositions - pending,
    warning: exceeds
      ? `Request exceeds quota: projected ${projected} vs approved ${metrics.approvedQuota}.`
      : null,
  };
}

/**
 * AT#16 — exceeding quota requires higher-management override (`quota.override_approve`).
 */
export function assertQuotaOverrideAllowed(input: {
  exceedsQuota: boolean;
  overrideStatus: HrQuotaOverrideStatus;
  actorHasOverrideCapability: boolean;
  action: "submit" | "approve_step" | "grant_override" | "publish";
}): { requiresOverride: boolean; canProceed: boolean } {
  if (!input.exceedsQuota) {
    return { requiresOverride: false, canProceed: true };
  }
  if (input.overrideStatus === "approved") {
    return { requiresOverride: true, canProceed: true };
  }
  if (input.action === "grant_override") {
    if (!input.actorHasOverrideCapability) {
      throw new Error("Quota override requires quota.override_approve (higher management) (AT#16).");
    }
    return { requiresOverride: true, canProceed: true };
  }
  if (input.action === "submit") {
    // Submit allowed with warning; override must be granted before final approve/publish.
    return { requiresOverride: true, canProceed: true };
  }
  throw new Error(
    "Job request exceeds workforce quota — higher management override required (AT#16).",
  );
}

export function assertCanPublishVacancy(input: {
  jobRequestStatus: HrJobRequestStatus;
  exceedsQuota: boolean;
  overrideStatus: HrQuotaOverrideStatus;
}): void {
  if (input.jobRequestStatus !== "approved") {
    throw new Error("Cannot publish vacancy before job request approvals complete.");
  }
  assertQuotaOverrideAllowed({
    exceedsQuota: input.exceedsQuota,
    overrideStatus: input.overrideStatus,
    actorHasOverrideCapability: true,
    action: "publish",
  });
}

export type QuotaEmployeeDocInput = {
  staffId: string;
  fullName: string;
  employmentCategory?: string | null;
  staffQid?: string | null;
  documents?: Array<{
    docType: string;
    expiryDate?: string | null;
    filePath?: string | null;
  }>;
  asOfDate: string;
};

export type QuotaEmployeeRow = {
  staffId: string;
  fullName: string;
  employmentCategory: string | null;
  cvAvailable: boolean;
  qidAvailable: boolean;
  qidExpiry: string | null;
  qidExpired: boolean;
};

/**
 * AT#17 — quota employee list exposes name, employment category, CV + QID status.
 */
export function buildQuotaEmployeeRows(rows: QuotaEmployeeDocInput[]): QuotaEmployeeRow[] {
  return rows.map((r) => {
    const docs = r.documents ?? [];
    const cv = docs.find((d) => /cv|resume|curriculum/i.test(d.docType));
    const qidDoc = docs.find((d) => d.docType.toLowerCase() === "qid");
    const qidExpiry = qidDoc?.expiryDate?.slice(0, 10) ?? null;
    const qidFromStaff = Boolean(r.staffQid?.trim());
    const qidAvailable = qidFromStaff || Boolean(qidDoc?.filePath) || Boolean(qidExpiry);
    const asOf = r.asOfDate.slice(0, 10);
    const qidExpired = Boolean(qidExpiry && qidExpiry < asOf);
    return {
      staffId: r.staffId,
      fullName: r.fullName,
      employmentCategory: r.employmentCategory ?? null,
      cvAvailable: Boolean(cv?.filePath),
      qidAvailable,
      qidExpiry,
      qidExpired,
    };
  });
}

/** Requester may see progress but not salary unless authorized. */
export function maskJobRequestSalary<T extends { salaryBudgetQar?: number | null }>(
  row: T,
  canViewSalary: boolean,
): T {
  if (canViewSalary) return row;
  return { ...row, salaryBudgetQar: null };
}

/**
 * Desk filters group stored job-request statuses.
 * They do not add a step the approval ladder does not already have.
 */
export const JOB_REQUEST_DESK_GROUPS = ["in_review", "approved", "published", "returned", "closed"] as const;
export type JobRequestDeskGroup = (typeof JOB_REQUEST_DESK_GROUPS)[number];

const JOB_REQUEST_GROUP_OF: Record<HrJobRequestStatus, JobRequestDeskGroup> = {
  draft: "in_review",
  pending: "in_review",
  approved: "approved",
  published: "published",
  returned: "returned",
  on_hold: "returned",
  rejected: "closed",
  cancelled: "closed",
  closed: "closed",
};

export function jobRequestDeskGroup(status: string): JobRequestDeskGroup {
  if (status in JOB_REQUEST_GROUP_OF) return JOB_REQUEST_GROUP_OF[status as HrJobRequestStatus];
  return "closed";
}

type JobStepCapability =
  | "recruitment.request"
  | "recruitment.manage"
  | "recruitment.view_salary_budget"
  | "quota.override_approve"
  | "hr.manage";

/** Same step rules the server uses before approve / reject. */
export function canActOnJobStep(
  stepRole: HrJobApprovalRole,
  can: (capability: JobStepCapability) => boolean,
  roles: readonly string[] = [],
): boolean {
  if (stepRole === "quota_override") return can("quota.override_approve");
  if (stepRole === "dept_ops") {
    return can("recruitment.request") || can("recruitment.manage") || can("hr.manage");
  }
  if (stepRole === "gm") {
    return can("recruitment.manage") || roles.includes("ceo") || roles.includes("coo");
  }
  return can(JOB_STEP_CAPABILITY[stepRole]);
}

export function jobRequestOverrideOpen(
  exceedsQuota: boolean,
  quotaOverrideStatus: HrQuotaOverrideStatus | string | null | undefined,
): boolean {
  return exceedsQuota && quotaOverrideStatus !== "approved";
}

export type JobRequestDeskMessage =
  | "approve_step"
  | "awaiting_approval"
  | "override_required"
  | "publish"
  | "awaiting_publish"
  | "published"
  | "returned"
  | "rejected"
  | "on_hold"
  | "closed"
  | "draft";

export type JobRequestDeskAction = {
  message: JobRequestDeskMessage;
  approve: boolean;
  returnForCorrection: boolean;
  reject: boolean;
  publish: boolean;
  grantOverride: boolean;
};

const NO_JOB_DESK_BUTTONS: Pick<
  JobRequestDeskAction,
  "approve" | "returnForCorrection" | "reject" | "publish" | "grantOverride"
> = {
  approve: false,
  returnForCorrection: false,
  reject: false,
  publish: false,
  grantOverride: false,
};

/**
 * Buttons only when a server action exists and this viewer can call it.
 * Approve and publish stay off while a quota override is still open.
 */
export function jobRequestDeskAction(input: {
  status: string;
  canActOnCurrentStep: boolean;
  canManage: boolean;
  canGrantOverride: boolean;
  exceedsQuota: boolean;
  quotaOverrideStatus: HrQuotaOverrideStatus | string | null | undefined;
}): JobRequestDeskAction {
  const overrideOpen = jobRequestOverrideOpen(input.exceedsQuota, input.quotaOverrideStatus);
  const grantOverride =
    overrideOpen &&
    input.canGrantOverride &&
    (input.status === "pending" || input.status === "approved");

  if (input.status === "pending") {
    return {
      message: overrideOpen
        ? "override_required"
        : input.canActOnCurrentStep
          ? "approve_step"
          : "awaiting_approval",
      approve: input.canActOnCurrentStep && !overrideOpen,
      returnForCorrection: input.canManage,
      reject: input.canActOnCurrentStep,
      publish: false,
      grantOverride,
    };
  }
  if (input.status === "approved") {
    return {
      message: overrideOpen ? "override_required" : input.canManage ? "publish" : "awaiting_publish",
      ...NO_JOB_DESK_BUTTONS,
      publish: input.canManage && !overrideOpen,
      grantOverride,
    };
  }
  if (input.status === "published") return { message: "published", ...NO_JOB_DESK_BUTTONS };
  if (input.status === "returned") return { message: "returned", ...NO_JOB_DESK_BUTTONS };
  if (input.status === "rejected") return { message: "rejected", ...NO_JOB_DESK_BUTTONS };
  if (input.status === "on_hold") return { message: "on_hold", ...NO_JOB_DESK_BUTTONS };
  if (input.status === "draft") return { message: "draft", ...NO_JOB_DESK_BUTTONS };
  return { message: "closed", ...NO_JOB_DESK_BUTTONS };
}

/** Drop a salary sentence from free text when the viewer cannot see budget. */
export function jobRequestVisibleText(
  text: string | null | undefined,
  canViewSalary: boolean,
): string | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (canViewSalary) return trimmed;
  const redacted = trimmed
    .replace(/\s*salary budget:\s*[^.\n]*\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();
  return redacted || null;
}

export function jobRequestSearchText(
  row: {
    jobTitle: string;
    locationName?: string | null;
    departmentName?: string | null;
    status?: string | null;
    priority?: string | null;
    employmentCategory?: string | null;
    jobDescription?: string | null;
    salaryBudgetQar?: number | null;
  },
  canViewSalary: boolean,
): string {
  return [
    row.jobTitle,
    row.locationName,
    row.departmentName,
    row.status,
    row.priority,
    row.employmentCategory,
    jobRequestVisibleText(row.jobDescription, canViewSalary),
    canViewSalary && row.salaryBudgetQar != null ? String(row.salaryBudgetQar) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function requiresFinanceForBudget(salaryBudgetQar: number | null | undefined): boolean {
  return salaryBudgetQar != null && Number(salaryBudgetQar) > 0;
}
