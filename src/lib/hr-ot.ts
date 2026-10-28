/**
 * OT claim rules (Phase 4). Pure — no Supabase.
 * Eligible minutes come from attendance-hr overtime_minutes / computeAttendanceOvertimeMinutes;
 * this module only rounds, gates the 1-hour minimum, rates, amounts, and workflow.
 */

import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";

export const HR_OT_RATE_TYPES = ["weekday", "weekly_off", "public_holiday", "eid"] as const;
export type HrOtRateType = (typeof HR_OT_RATE_TYPES)[number];

export const HR_OT_STATUSES = [
  "draft",
  "submitted",
  "manager_verified",
  "ops_approved",
  "hr_approved",
  "gm_approved",
  "payroll_posted",
  "changes_requested",
  "rejected",
  "cancelled",
] as const;
export type HrOtStatus = (typeof HR_OT_STATUSES)[number];

export const HR_OT_ROUNDING = ["down", "up", "minutes"] as const;
export type HrOtRounding = (typeof HR_OT_ROUNDING)[number];

export type HrOtActor = "employee" | "manager" | "ops" | "gm" | "hr" | "payroll";

/**
 * Approval chain:
 *   supervisor submit → submitted → manager_verified (Sr. Site Supervisor)
 *   → ops_approved (Head of Operations) → hr_approved → gm_approved → payroll_posted
 * Venue / Site supervisors who file for their team wait on Sr. Site Supervisor (Mary);
 * only a Sr. Site Supervisor title may auto-complete that seat on submit (same product
 * idea as missed-punch: submitter ≠ seat unless they hold it). Approvers may send back
 * (`changes_requested`); the submitter cancels or resubmits to restart at `submitted`.
 */

/**
 * Supervisor OT team submit may auto-stamp `manager_verified` only when the submitter
 * holds the Sr. Site Supervisor seat (Mary). Venue / Site / other supervisors leave the
 * claim on `submitted` for that seat — they must not self-approve past Mary to HoO.
 */
export function otSubmitterAutoCompletesSiteSeat(
  jobTitle: string | null | undefined,
  _staffRole?: string | null | undefined,
): boolean {
  return isSrSiteSupervisorTitle(jobTitle);
}

/**
 * Open supervisor OT that self-stamped the site seat without a Sr. Site Supervisor title
 * (e.g. Venue Supervisor Ashfaq → HoO). Heal back to `submitted` for Mary.
 */
export function shouldHealOtSiteSelfApprove(input: {
  status: string;
  claimSource?: string | null;
  submittedBy: string | null | undefined;
  verifiedBy: string | null | undefined;
  submitterJobTitle?: string | null;
}): boolean {
  if (input.status !== "manager_verified") return false;
  if (input.claimSource && input.claimSource !== "supervisor") return false;
  if (!input.submittedBy || !input.verifiedBy) return false;
  if (input.submittedBy !== input.verifiedBy) return false;
  if (otSubmitterAutoCompletesSiteSeat(input.submitterJobTitle)) return false;
  return true;
}
const TRANSITIONS: Record<HrOtStatus, Partial<Record<HrOtActor, HrOtStatus[]>>> = {
  draft: {
    employee: ["submitted", "cancelled"],
    hr: ["submitted", "cancelled"],
  },
  submitted: {
    employee: ["cancelled"],
    manager: ["manager_verified", "changes_requested", "rejected"],
    hr: ["manager_verified", "changes_requested", "rejected", "cancelled"],
  },
  manager_verified: {
    employee: ["cancelled"],
    ops: ["ops_approved", "changes_requested", "rejected"],
    hr: ["ops_approved", "changes_requested", "rejected"],
  },
  ops_approved: {
    hr: ["hr_approved", "changes_requested", "rejected"],
  },
  hr_approved: {
    // GM seat only — HR (and CEO/COO with hr.ot.approve) must not advance this step.
    gm: ["gm_approved", "changes_requested", "rejected"],
  },
  gm_approved: {
    payroll: ["payroll_posted"],
    hr: ["payroll_posted"],
  },
  payroll_posted: {},
  changes_requested: {
    employee: ["submitted", "cancelled"],
    hr: ["submitted", "cancelled"],
  },
  rejected: {},
  cancelled: {},
};

/**
 * True GM seat for OT — not Sr. Site / Venue supervisors who hold `branch_gm`
 * for other scopes (Mary). Mirrors roster-fill: title/role scope ≠ OT GM step.
 */
export function canActAsOtGeneralManager(input: {
  roles: readonly string[];
  jobTitle?: string | null;
  staffRole?: string | null;
}): boolean {
  const title = (input.jobTitle ?? "").trim();
  if (isSrSiteSupervisorTitle(title)) return false;
  // Venue / Site supervisors also keep branch_gm sometimes; they act on `submitted`.
  if (/(?:^|[\s/])site supervisor\b/i.test(title) || /\bvenue supervisor\b/i.test(title)) {
    return false;
  }
  if (input.staffRole === "venue_supervisor") return false;
  if (/head of operations/i.test(title)) return false;
  if (input.roles.includes("branch_gm")) return true;
  return /\bgeneral manager\b/i.test(title);
}

/**
 * Actionable Approval-queue seats for the current login (missed-punch-style).
 * Site seat → `submitted`; HoO → `manager_verified`; HR → `ops_approved`; GM → `hr_approved`.
 */
export function resolveOtApprovalQueueFlags(input: {
  canVerify: boolean;
  canHrApprove: boolean;
  isHeadOfOperations: boolean;
  roles: readonly string[];
  jobTitle?: string | null;
  staffRole?: string | null;
}): {
  canSiteVerify: boolean;
  canOpsApprove: boolean;
  canGmApprove: boolean;
  canHrApprove: boolean;
} {
  const canOpsApprove = input.isHeadOfOperations;
  const canGmApprove = canActAsOtGeneralManager(input);
  // HoO / true GM do not use the site seat queue; Mary (verify + branch_gm) does.
  const canSiteVerify = input.canVerify && !canOpsApprove && !canGmApprove;
  // Head of Operations often holds ceo → hr.ot.approve, but must not act as HR/GM on OT.
  const canHrApprove = input.canHrApprove && !canOpsApprove && !canGmApprove;
  return {
    canSiteVerify,
    canOpsApprove,
    canGmApprove,
    canHrApprove,
  };
}

/**
 * Approval queue statuses by actor capability.
 * Site supervisors act on `submitted`; HOO on `manager_verified`;
 * HR on `ops_approved`; GM on `hr_approved`.
 */
export function otApprovalQueueStatuses(input: {
  canSiteVerify: boolean;
  canOpsApprove: boolean;
  canGmApprove: boolean;
  canHrApprove: boolean;
}): readonly HrOtStatus[] {
  const statuses: HrOtStatus[] = [];
  if (input.canSiteVerify) statuses.push("submitted");
  if (input.canOpsApprove) statuses.push("manager_verified");
  if (input.canHrApprove) statuses.push("ops_approved");
  if (input.canGmApprove) statuses.push("hr_approved");
  return [...new Set(statuses)];
}

/** Deep-link into OT Approval queue, optionally pre-filling search with a request number. */
export function otApprovalQueueHref(requestNumber?: string | null): string {
  const base = "/people/hr/ot";
  const q = (requestNumber ?? "").trim();
  if (!q) return base;
  return `${base}?q=${encodeURIComponent(q)}`;
}

/** Submitter may edit/cancel/resubmit only before Head of Operations approves (or when sent back). */
export function canEditOtBeforeHoo(status: HrOtStatus): boolean {
  return (
    status === "draft" ||
    status === "submitted" ||
    status === "manager_verified" ||
    status === "changes_requested"
  );
}

/**
 * Whether the actor may revise OT form fields (dates / hours / purpose / rate).
 * - Submitter: while {@link canEditOtBeforeHoo}
 * - Head of Operations: while `ops_approved` (after HOO approve, before HR or GM)
 * - HR seat (`canHrApprove` from {@link resolveOtApprovalQueueFlags}): any status
 */
export function canReviseOtRequest(input: {
  status: HrOtStatus;
  isSubmitter: boolean;
  canOpsApprove: boolean;
  canHrApprove: boolean;
}): boolean {
  if (canEditOtBeforeHoo(input.status) && input.isSubmitter) return true;
  if (input.status === "ops_approved" && input.canOpsApprove) return true;
  if (input.canHrApprove) return true;
  return false;
}

/**
 * Audit action written on revise. Must stay in
 * `hr_ot_claim_approvals_action_chk` (`revised` | `resubmitted`).
 */
export function otReviseApprovalAction(resubmitted: boolean): "resubmitted" | "revised" {
  return resubmitted ? "resubmitted" : "revised";
}

/** Diff existing request day-rows vs the next date set (cancel / update / insert). */
export function planOtRequestDaySync(input: {
  existingDates: readonly string[];
  nextDates: readonly string[];
}): {
  datesToCancel: string[];
  datesToUpdate: string[];
  datesToInsert: string[];
} {
  const normalize = (d: string) => String(d).slice(0, 10);
  const existing = new Set(input.existingDates.map(normalize));
  const next = new Set(input.nextDates.map(normalize));
  return {
    datesToCancel: [...existing].filter((d) => !next.has(d)).sort(),
    datesToUpdate: [...next].filter((d) => existing.has(d)).sort(),
    datesToInsert: [...next].filter((d) => !existing.has(d)).sort(),
  };
}

/**
 * Day-rows still part of an open OT request (edit / totals / print).
 * Removed dates are cancelled in place; rejected days are terminal — both stay
 * out of the request card unless the whole batch is inactive.
 */
export function isOtActiveRequestDayStatus(status: string | null | undefined): boolean {
  return status !== "cancelled" && status !== "rejected";
}

/** Prefer active day-rows; keep cancelled/rejected only when nothing active remains. */
export function pickOtRequestDayRows<T extends { status: string }>(
  rows: readonly T[],
): T[] {
  const active = rows.filter((row) => isOtActiveRequestDayStatus(row.status));
  return active.length > 0 ? active : [...rows];
}

/** Approver may request changes at the same steps where reject is allowed. */
export function canRequestOtChanges(status: HrOtStatus): boolean {
  return (
    status === "submitted" ||
    status === "manager_verified" ||
    status === "ops_approved" ||
    status === "hr_approved"
  );
}

/** Digital signature stamp for one OT print-slip column. */
export type OtPrintSignature = {
  name: string | null;
  at: string | null;
  /**
   * Signed URL for the opt-in digital signature image.
   * When missing, the print box stays blank for wet-ink signing.
   */
  imageUrl?: string | null;
};

export type OtPrintSignatureKey = "site" | "hoo" | "hr" | "gm";

/** Whether a print-slip signature column is filled for the current status. */
export function otPrintSignatureDone(
  status: HrOtStatus | null | undefined,
  key: OtPrintSignatureKey,
): boolean {
  if (!status) return false;
  const order: HrOtStatus[] = [
    "manager_verified",
    "ops_approved",
    "hr_approved",
    "gm_approved",
    "payroll_posted",
  ];
  const idx = order.indexOf(status);
  if (idx < 0) return false;
  const needed: Record<OtPrintSignatureKey, number> = {
    site: 0,
    hoo: 1,
    hr: 2,
    gm: 3,
  };
  return idx >= needed[key];
}

/** Soft note when amount is 0 because basic salary was missing at claim time. */
export function otMissingBasicPayNote(input: {
  amountQar: number;
  basicQarSnapshot?: number | null;
}): boolean {
  if (input.amountQar > 0) return false;
  const basic = Number(input.basicQarSnapshot);
  return !Number.isFinite(basic) || basic <= 0;
}

/** Statuses that may still have amount_qar rewritten (not terminal / posted). */
export function isOtAmountRefreshableStatus(status: HrOtStatus): boolean {
  return status !== "rejected" && status !== "cancelled" && status !== "payroll_posted";
}

/**
 * Pending claims frozen at 0 QAR with no basic snapshot should refresh once
 * compensation basic is available (list load or later approval steps).
 * Do not rewrite terminal / posted rows.
 */
export function shouldRefreshOtAmountForMissingBasic(input: {
  amountQar: number;
  basicQarSnapshot?: number | null;
  status: HrOtStatus;
}): boolean {
  if (!isOtAmountRefreshableStatus(input.status)) return false;
  return otMissingBasicPayNote({
    amountQar: input.amountQar,
    basicQarSnapshot: input.basicQarSnapshot,
  });
}

/**
 * Pending claims whose stored amount/divisor no longer matches recomputed pay
 * (e.g. hours_per_day policy moved 8 → 9) should refresh on list load.
 */
export function shouldRefreshOtAmountForStalePay(input: {
  status: HrOtStatus;
  amountQar: number;
  expectedAmountQar: number;
  hoursPerDaySnapshot?: number | null;
  expectedHoursPerDay: number;
  daysPerMonthSnapshot?: number | null;
  expectedDaysPerMonth: number;
}): boolean {
  if (!isOtAmountRefreshableStatus(input.status)) return false;
  if (Math.abs(input.amountQar - input.expectedAmountQar) >= 0.01) return true;
  const snapH = Number(input.hoursPerDaySnapshot);
  if (Number.isFinite(snapH) && snapH > 0 && snapH !== input.expectedHoursPerDay) return true;
  const snapD = Number(input.daysPerMonthSnapshot);
  if (Number.isFinite(snapD) && snapD > 0 && snapD !== input.expectedDaysPerMonth) return true;
  return false;
}

export type StaffOtPayParts = {
  /** Basic only — never package total (monthly_salary_qar). */
  monthlyBasicQar: number | null;
  housingQar: number | null;
  transportQar: number | null;
  dailyRateQar: number | null;
  /**
   * Daily working hours from `staff.expected_hours` (secondment or permanent).
   * Null/missing → OT policy `hours_per_day` fallback (default 9).
   */
  expectedHoursPerDay?: number | null;
};

function otPayNumOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map staff_compensation (or legacy package-only row) into OT pay parts.
 * Prefer explicit basic_qar; use monthly_salary_qar as basic only when the row
 * has no housing/transport split (pre-migration packages).
 */
export function resolveStaffOtPayFromCompensation(
  comp: {
    basic_qar?: unknown;
    housing_qar?: unknown;
    transport_qar?: unknown;
    monthly_salary_qar?: unknown;
    daily_rate_qar?: unknown;
  } | null,
): StaffOtPayParts | null {
  if (!comp) return null;
  const basic = otPayNumOrNull(comp.basic_qar);
  const housing = otPayNumOrNull(comp.housing_qar);
  const transport = otPayNumOrNull(comp.transport_qar);
  const daily = otPayNumOrNull(comp.daily_rate_qar);
  const legacyPackageAsBasic =
    basic == null &&
    (housing == null || housing === 0) &&
    (transport == null || transport === 0)
      ? otPayNumOrNull(comp.monthly_salary_qar)
      : null;
  return {
    monthlyBasicQar: basic ?? legacyPackageAsBasic,
    housingQar: housing,
    transportQar: transport,
    dailyRateQar: daily,
    expectedHoursPerDay: null,
  };
}

/** Latest salary-history row when compensation has no usable snapshot. */
export function resolveStaffOtPayFromSalaryHistory(
  hist: {
    basic_qar?: unknown;
    monthly_total_qar?: unknown;
    daily_rate_qar?: unknown;
    allowances?: unknown;
  } | null,
): StaffOtPayParts {
  if (!hist) {
    return {
      monthlyBasicQar: null,
      housingQar: null,
      transportQar: null,
      dailyRateQar: null,
      expectedHoursPerDay: null,
    };
  }
  const allow =
    hist.allowances && typeof hist.allowances === "object" && !Array.isArray(hist.allowances)
      ? (hist.allowances as Record<string, unknown>)
      : {};
  return {
    monthlyBasicQar:
      hist.basic_qar != null
        ? otPayNumOrNull(hist.basic_qar)
        : otPayNumOrNull(hist.monthly_total_qar),
    housingQar: otPayNumOrNull(allow.housing),
    transportQar:
      otPayNumOrNull(allow.transportation) ?? otPayNumOrNull(allow.transport),
    dailyRateQar: otPayNumOrNull(hist.daily_rate_qar),
    expectedHoursPerDay: null,
  };
}

/** Hierarchy steps for status badges / steppers (excludes terminal reject/cancel). */
export const HR_OT_HIERARCHY_STEPS = [
  "submitted",
  "manager_verified",
  "ops_approved",
  "hr_approved",
  "gm_approved",
  "payroll_posted",
] as const;

export type HrOtHierarchyStep = (typeof HR_OT_HIERARCHY_STEPS)[number];

export function otHierarchyStepIndex(status: HrOtStatus): number {
  if (status === "draft") return -1;
  if (status === "rejected" || status === "cancelled" || status === "changes_requested") return -1;
  return HR_OT_HIERARCHY_STEPS.indexOf(status as HrOtHierarchyStep);
}

export type OtClaimListRow = {
  id: string;
  requestBatchId?: string | null;
  requestNumber?: string | null;
  staffId: string;
  staffName?: string | null;
  employeeCode?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  workDate: string;
  eligibleMinutes: number;
  claimedMinutes: number;
  approvedMinutes: number | null;
  rateType: HrOtRateType;
  rateMultiplier: number;
  amountQar: number;
  basicQarSnapshot?: number | null;
  hoursPerDaySnapshot?: number | null;
  daysPerMonthSnapshot?: number | null;
  status: HrOtStatus;
  purpose?: string | null;
  claimSource?: string | null;
  contractWorkingDays?: number | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  createdAt?: string;
  /** Site supervisor digital signature (name + when). */
  siteSignature?: OtPrintSignature | null;
  /** Head of Operations digital signature. */
  hooSignature?: OtPrintSignature | null;
  /** General Manager digital signature. */
  gmSignature?: OtPrintSignature | null;
  /** HR digital signature. */
  hrSignature?: OtPrintSignature | null;
  /** Approver user ids (used to backfill signer names). */
  verifiedBy?: string | null;
  opsApprovedBy?: string | null;
  gmApprovedBy?: string | null;
  approvedBy?: string | null;
};

export type OtRequestGroup = {
  /** Batch id, or synthetic key when unbatched. */
  key: string;
  requestBatchId: string | null;
  requestNumber: string | null;
  status: HrOtStatus;
  claimSource: string | null;
  purpose: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  claims: OtClaimListRow[];
  staffId: string | null;
  staffNames: string[];
  workDates: string[];
  totalClaimedMinutes: number;
  totalApprovedMinutes: number;
  totalAmountQar: number;
  missingBasicPay: boolean;
  department: string | null;
  locationId: string | null;
  locationName: string | null;
  siteSignature?: OtPrintSignature | null;
  hooSignature?: OtPrintSignature | null;
  gmSignature?: OtPrintSignature | null;
  hrSignature?: OtPrintSignature | null;
};

/**
 * One request card key: shared batch id, else same-person supervisor submit
 * (staff + submitter + second), else the claim id alone.
 */
export function otRequestGroupKey(row: OtClaimListRow): string {
  if (row.requestBatchId) return row.requestBatchId;
  if (row.claimSource === "supervisor" && row.submittedBy && row.submittedAt) {
    const sec = row.submittedAt.slice(0, 19);
    return `sup:${row.staffId}:${row.submittedBy}:${sec}`;
  }
  return row.id;
}

export type OtRequestListFilters = {
  q?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  department?: string | null;
  locationId?: string | null;
};

/** Client-side filters on grouped OT requests (name, code, number, dept, site, dates). */
export function filterOtRequestGroups(
  groups: readonly OtRequestGroup[],
  filters: OtRequestListFilters,
): OtRequestGroup[] {
  const q = (filters.q ?? "").trim().toLowerCase();
  const dateFrom = filters.dateFrom?.slice(0, 10) || null;
  const dateTo = filters.dateTo?.slice(0, 10) || null;
  const department = (filters.department ?? "").trim().toLowerCase() || null;
  const locationId = filters.locationId || null;

  return groups.filter((group) => {
    if (dateFrom && !group.workDates.some((d) => d >= dateFrom)) return false;
    if (dateTo && !group.workDates.some((d) => d <= dateTo)) return false;
    if (department) {
      const dept = (group.department ?? "").toLowerCase();
      if (dept !== department) return false;
    }
    if (locationId && group.locationId !== locationId) return false;
    if (!q) return true;
    const haystack = [
      group.requestNumber,
      ...group.staffNames,
      ...group.claims.map((c) => c.employeeCode),
      group.purpose,
      group.department,
      group.locationName,
      ...group.workDates,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Group day-rows into one OT request card (batch id, else same-person supervisor submit). */
export function groupOtClaimsIntoRequests(
  rows: readonly OtClaimListRow[],
): OtRequestGroup[] {
  const map = new Map<string, OtClaimListRow[]>();
  for (const row of rows) {
    const key = otRequestGroupKey(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  const groups: OtRequestGroup[] = [];
  for (const [key, claims] of map) {
    // Revise cancels removed dates in place; Edit / totals must use active days only.
    const sorted = pickOtRequestDayRows(claims).sort((a, b) =>
      a.workDate.localeCompare(b.workDate),
    );
    if (!sorted.length) continue;
    const first = sorted[0]!;
    const staffIds = [...new Set(sorted.map((c) => c.staffId))];
    const staffNames = [
      ...new Set(sorted.map((c) => c.staffName).filter((n): n is string => Boolean(n))),
    ];
    const workDates = [...new Set(sorted.map((c) => c.workDate))].sort();
    const totalClaimedMinutes = sorted.reduce((sum, c) => sum + Math.max(0, c.claimedMinutes), 0);
    const totalApprovedMinutes = sorted.reduce(
      (sum, c) =>
        sum +
        otSummaryApprovedMinutes({
          approvedMinutes: c.approvedMinutes,
          claimedMinutes: c.claimedMinutes,
        }),
      0,
    );
    const totalAmountQar =
      Math.round(sorted.reduce((sum, c) => sum + Math.max(0, c.amountQar), 0) * 100) / 100;
    const missingBasicPay = sorted.some((c) =>
      otMissingBasicPayNote({ amountQar: c.amountQar, basicQarSnapshot: c.basicQarSnapshot }),
    );
    // Prefer the furthest-along active status in the batch (all should match).
    const status = sorted.reduce<HrOtStatus>((acc, c) => {
      const ai = otHierarchyStepIndex(acc);
      const bi = otHierarchyStepIndex(c.status);
      if (bi > ai) return c.status;
      return acc;
    }, first.status);
    const requestNumber =
      sorted.map((c) => c.requestNumber).find((n): n is string => Boolean(n)) ?? null;
    const withSig = [...sorted].reverse().find((c) => c.siteSignature || c.hooSignature || c.gmSignature || c.hrSignature) ?? first;
    groups.push({
      key,
      requestBatchId: first.requestBatchId ?? null,
      requestNumber,
      status,
      claimSource: first.claimSource ?? null,
      purpose: first.purpose ?? null,
      submittedBy: first.submittedBy ?? null,
      submittedAt: first.submittedAt ?? null,
      claims: sorted,
      staffId: staffIds.length === 1 ? staffIds[0]! : null,
      staffNames,
      workDates,
      totalClaimedMinutes,
      totalApprovedMinutes,
      totalAmountQar,
      missingBasicPay,
      department: first.department ?? null,
      locationId: first.locationId ?? null,
      locationName: first.locationName ?? null,
      siteSignature: withSig.siteSignature ?? null,
      hooSignature: withSig.hooSignature ?? null,
      gmSignature: withSig.gmSignature ?? null,
      hrSignature: withSig.hrSignature ?? null,
    });
  }
  return groups.sort((a, b) => {
    const aDate = a.submittedAt ?? a.workDates[a.workDates.length - 1] ?? "";
    const bDate = b.submittedAt ?? b.workDates[b.workDates.length - 1] ?? "";
    return bDate.localeCompare(aDate);
  });
}

export function canTransitionOt(from: HrOtStatus, to: HrOtStatus, actor: HrOtActor): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from][actor] ?? []).includes(to);
}

export function assertOtTransition(from: HrOtStatus, to: HrOtStatus, actor: HrOtActor): void {
  if (!canTransitionOt(from, to, actor)) {
    throw new Error(`OT claim cannot move from ${from} to ${to}.`);
  }
}

/**
 * OT entered the approval workflow (not a local draft). Used by HR Excel
 * "08 Overtime" so punch-only calculated OT never appears without a claim.
 */
export function isOtClaimSubmittedForExport(status: string | null | undefined): boolean {
  const s = (status ?? "").trim();
  if (!s || s === "draft") return false;
  return (HR_OT_STATUSES as readonly string[]).includes(s);
}

/** Final payroll gate: GM (or already posted). Intermediate seats do not count. */
export function isOtFinalApprovedForPayroll(status: string | null | undefined): boolean {
  return status === "gm_approved" || status === "payroll_posted";
}

/**
 * Next seat still needed before GM final approval. Null when complete, rejected,
 * cancelled, sent back, or draft.
 */
export function otWaitingSeatLabel(status: string | null | undefined): string | null {
  switch (status) {
    case "submitted":
      return "Sr. Site Supervisor";
    case "manager_verified":
      return "HOO";
    case "ops_approved":
      return "HR";
    case "hr_approved":
      return "GM";
    default:
      return null;
  }
}

/** Human label for OT claim status on exports (English, no i18n). */
export function otStatusExportLabel(status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Supervisor submitted";
    case "manager_verified":
      return "Sr. Site Supervisor approved";
    case "ops_approved":
      return "HOO approved";
    case "hr_approved":
      return "HR approved";
    case "gm_approved":
      return "GM approved";
    case "payroll_posted":
      return "Payroll posted";
    case "changes_requested":
      return "Changes requested";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return (status ?? "").trim() || "Unknown";
  }
}

/** AT#4: payroll_posted only once, only from gm_approved (final approver before payroll). */
export function canMarkPayrollPosted(status: HrOtStatus): boolean {
  return status === "gm_approved";
}

export function assertCanMarkPayrollPosted(status: HrOtStatus): void {
  if (!canMarkPayrollPosted(status)) {
    throw new Error(
      status === "payroll_posted"
        ? "OT claim is already payroll_posted."
        : "OT claim must be gm_approved before payroll_posted.",
    );
  }
}

export function roundOtMinutes(minutes: number, mode: HrOtRounding = "down"): number {
  const n = Math.max(0, Number(minutes) || 0);
  if (mode === "up") return Math.ceil(n);
  if (mode === "minutes") return Math.round(n);
  return Math.floor(n);
}

/**
 * AT#3: minimum claimable OT is one complete hour (policy default 60).
 * Apply rounding first, then reject below the floor.
 */
export function assertMinClaimableMinutes(
  minutes: number,
  minClaimable = 60,
  rounding: HrOtRounding = "down",
): number {
  const rounded = roundOtMinutes(minutes, rounding);
  if (rounded < minClaimable) {
    throw new Error(
      `OT below minimum: need at least ${minClaimable} complete minutes (got ${rounded}).`,
    );
  }
  return rounded;
}

export function resolveOtRateMultiplier(
  rateType: HrOtRateType,
  policy: Record<string, unknown>,
): number {
  const key =
    rateType === "weekday"
      ? "rate_weekday"
      : rateType === "weekly_off"
        ? "rate_weekly_off"
        : rateType === "public_holiday"
          ? "rate_public_holiday"
          : "rate_eid";
  const fallback =
    rateType === "weekday" ? 1.25 : rateType === "eid" ? 2.5 : 1.5;
  const raw = policy[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Monthly contracts of 26 or 28 working days are claimed by a supervisor.
 * Attendance overtime minutes are not the eligibility source for these contracts.
 * There is no older column for this; it lives on staff_profile_ext.contract_working_days.
 */
export const SUPERVISOR_OT_CONTRACT_DAYS = [26, 28] as const;
export type SupervisorOtContractDays = (typeof SUPERVISOR_OT_CONTRACT_DAYS)[number];

export function isSupervisorOtContract(days: number | null | undefined): days is SupervisorOtContractDays {
  return days === 26 || days === 28;
}

export function supervisorOtContractMessage(days: number): string {
  return `This staff contract is ${days} working days. A supervisor requests the overtime.`;
}

/** Split Supervisor OT picks into 26/28-day eligible vs everyone else. */
export function partitionSupervisorOtPicks<T extends { supervisorContract: boolean }>(
  picks: readonly T[],
): { eligible: T[]; ineligible: T[] } {
  const eligible: T[] = [];
  const ineligible: T[] = [];
  for (const pick of picks) {
    if (pick.supervisorContract) eligible.push(pick);
    else ineligible.push(pick);
  }
  return { eligible, ineligible };
}

/** One claim slot per staff × that staff's work dates (deduped staff, dates sorted). */
export function supervisorOtClaimSlots(
  entries: readonly { staffId: string; workDates: readonly string[] }[],
): Array<{ staffId: string; workDate: string }> {
  const slots: Array<{ staffId: string; workDate: string }> = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.staffId || seen.has(entry.staffId)) continue;
    seen.add(entry.staffId);
    const dates = [...new Set(entry.workDates.filter(Boolean))].sort();
    for (const workDate of dates) {
      slots.push({ staffId: entry.staffId, workDate });
    }
  }
  return slots;
}

/**
 * Per-date OT hours for a staff entry. Each work date must have its own hours —
 * never a single combined total across dates.
 */
export type SupervisorOtDayEntry = {
  workDate: string;
  hours: number;
};

/** Normalize day rows: unique dates (sorted), drop empty dates, keep per-day hours. */
export function normalizeSupervisorOtDays(
  days: readonly { workDate: string; hours: number }[],
): SupervisorOtDayEntry[] {
  const byDate = new Map<string, number>();
  for (const day of days) {
    const workDate = String(day.workDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) continue;
    const hours = Number(day.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    byDate.set(workDate, hours);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([workDate, hours]) => ({ workDate, hours }));
}

/** Sum of per-day hours (request total); each day stays independent in storage. */
export function sumSupervisorOtDayHours(days: readonly { hours: number }[]): number {
  const total = days.reduce((sum, day) => sum + Math.max(0, Number(day.hours) || 0), 0);
  return Math.round(total * 100) / 100;
}

export type SupervisorOtStaffFieldError = "contract" | "dates" | "hours" | "purpose";

/** Per-staff readiness for supervisor OT submit (26/28 + per-day hours + purpose). */
export function supervisorOtStaffFieldErrors(input: {
  supervisorContract: boolean;
  workDates?: readonly string[];
  /** @deprecated Prefer `days` — single hours applied to every date. */
  hours?: number;
  days?: readonly { workDate: string; hours: number }[];
  purpose: string;
}): SupervisorOtStaffFieldError[] {
  const errors: SupervisorOtStaffFieldError[] = [];
  if (!input.supervisorContract) errors.push("contract");

  const rawDays =
    input.days != null
      ? input.days
      : (input.workDates ?? []).map((workDate) => ({
          workDate,
          hours: Number(input.hours),
        }));
  const uniqueDates = [
    ...new Set(
      rawDays
        .map((day) => String(day.workDate ?? "").slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ];
  const normalizedDays = normalizeSupervisorOtDays(rawDays);

  if (uniqueDates.length === 0) {
    errors.push("dates");
  } else if (normalizedDays.length !== uniqueDates.length) {
    // Some dates missing/invalid hours — do not silently drop them into a combined total.
    errors.push("hours");
  }

  if (input.purpose.trim().length < 3) errors.push("purpose");
  return errors;
}

export function isSupervisorOtStaffEntryReady(input: {
  supervisorContract: boolean;
  workDates?: readonly string[];
  /** @deprecated Prefer `days`. */
  hours?: number;
  days?: readonly { workDate: string; hours: number }[];
  purpose: string;
}): boolean {
  return supervisorOtStaffFieldErrors(input).length === 0;
}

/**
 * Who appears in Supervisor OT employee search.
 *
 * Primary: org-chart reporting subtree (same `reporting_manager_staff_id` edges
 * as People / Team overview). When anyone reports to the viewer — directly or
 * deeper (team lead → supervisor → staff) — return that chart set only.
 *
 * Last resort: Venue / Site supervisors may use managed-venue staff only when
 * the chart subtree is empty. Viewer-only in `reportingTeamIds` counts as empty
 * (rollup loaders always include self). Do not union venue onto a populated chart.
 */
export function mergeSupervisorOtTeamStaffIds(input: {
  reportingTeamIds: readonly string[];
  viewerStaffId?: string | null;
  managedVenueStaffIds?: readonly string[];
  usesVenueLocationRoster: boolean;
}): string[] {
  const chartSubtree = input.reportingTeamIds.filter(
    (id) => Boolean(id) && id !== input.viewerStaffId,
  );
  if (chartSubtree.length > 0) {
    return [...new Set(input.reportingTeamIds.filter(Boolean))].sort();
  }
  if (input.usesVenueLocationRoster) {
    return [...new Set((input.managedVenueStaffIds ?? []).filter(Boolean))].sort();
  }
  return [...new Set(input.reportingTeamIds.filter(Boolean))].sort();
}

/** Fallback OT hours/day when staff.expected_hours and policy hours_per_day are unset. */
export const OT_DEFAULT_HOURS_PER_DAY = 9;

/**
 * Monthly day divisor for OT hourly rate — always policy `days_per_month` (default 30).
 * Supervisor 26/28 `contractWorkingDays` only gates the claim path; it does not change pay.
 */
export function otPayDaysPerMonth(input: {
  /** @deprecated Ignored for OT pay — kept for call-site compatibility. */
  contractWorkingDays?: number | null;
  policyDaysPerMonth?: number | null;
}): number {
  void input.contractWorkingDays;
  const policy = Number(input.policyDaysPerMonth);
  return Number.isFinite(policy) && policy > 0 ? policy : 30;
}

/**
 * Daily hour divisor for OT hourly rate.
 * Prefer `staff.expected_hours` (saved for secondment/permanent); else OT policy; else 9.
 */
export function otPayHoursPerDay(input: {
  staffExpectedHours?: number | null;
  policyHoursPerDay?: number | null;
}): number {
  const staff = Number(input.staffExpectedHours);
  if (Number.isFinite(staff) && staff > 0) return staff;
  const policy = Number(input.policyHoursPerDay);
  if (Number.isFinite(policy) && policy > 0) return policy;
  return OT_DEFAULT_HOURS_PER_DAY;
}

export function isOtEligible(input: {
  employmentCategory?: string | null;
  staffId?: string | null;
  policy: Record<string, unknown>;
}): boolean {
  const staffIds = Array.isArray(input.policy.eligible_staff_ids)
    ? input.policy.eligible_staff_ids.map(String)
    : [];
  if (input.staffId && staffIds.includes(input.staffId)) return true;

  const cats = Array.isArray(input.policy.eligible_categories)
    ? input.policy.eligible_categories.map((c) => String(c).toLowerCase())
    : ["secondment"];
  const cat = (input.employmentCategory ?? "").toLowerCase().trim();
  if (!cat) return cats.length === 0;
  return cats.includes(cat) || cats.includes("*") || cats.includes("all");
}

/**
 * Hourly rate from monthly **basic** (never package total) or daily rate.
 *
 * Qatar OT: `basic / (daysPerMonth * hoursPerDay) * rateMultiplier * otHours`.
 * - hoursPerDay: `staff.expected_hours` when set; else OT policy `hours_per_day` (default 9).
 * - daysPerMonth: OT policy `days_per_month` (default 30). Contract 26/28 days are not used.
 */
export function hourlyRateFromPay(input: {
  monthlyBasicQar?: number | null;
  dailyRateQar?: number | null;
  hoursPerDay?: number;
  daysPerMonth?: number;
}): number {
  const hours =
    input.hoursPerDay && input.hoursPerDay > 0 ? input.hoursPerDay : OT_DEFAULT_HOURS_PER_DAY;
  const days = input.daysPerMonth && input.daysPerMonth > 0 ? input.daysPerMonth : 30;
  const monthly = Number(input.monthlyBasicQar);
  if (Number.isFinite(monthly) && monthly > 0) return monthly / days / hours;
  const daily = Number(input.dailyRateQar);
  if (Number.isFinite(daily) && daily > 0) return daily / hours;
  return 0;
}

/** amount = (approvedMinutes/60) × hourlyBasic × rateMultiplier (weekday 1.25 / off / holiday / Eid). */
export function computeOtAmountQar(input: {
  approvedMinutes: number;
  rateMultiplier: number;
  hourlyRateQar: number;
}): number {
  const hours = Math.max(0, input.approvedMinutes) / 60;
  const amount = hours * Math.max(0, input.hourlyRateQar) * Math.max(0, input.rateMultiplier);
  return Math.round(amount * 100) / 100;
}

/** Compact number text for Excel formula labels (trim trailing zeros). */
function formatOtFormulaNumber(n: number, maxDigits = 4): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(maxDigits);
  return fixed.replace(/\.?0+$/, "") || "0";
}

/**
 * Human-readable Qatar OT amount formula (same math as {@link computeOtAmountQar}):
 * `OT hours × (basic ÷ (daysPerMonth × hoursPerDay)) × rateMultiplier`
 */
export function formatOtAmountFormula(input: {
  otHours: number;
  basicQar?: number | null;
  hoursPerDay?: number | null;
  daysPerMonth?: number | null;
  rateMultiplier: number;
  hourlyRateQar?: number | null;
}): string {
  const hours = Math.max(0, Number(input.otHours) || 0);
  const daysRaw = Number(input.daysPerMonth);
  const hpdRaw = Number(input.hoursPerDay);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const hpd = Number.isFinite(hpdRaw) && hpdRaw > 0 ? hpdRaw : OT_DEFAULT_HOURS_PER_DAY;
  const mult = Math.max(0, Number(input.rateMultiplier) || 0);
  const hoursLabel = `${formatOtFormulaNumber(hours, 2)}h`;
  const multLabel = formatOtFormulaNumber(mult, 2);
  const basic = Number(input.basicQar);
  if (Number.isFinite(basic) && basic > 0) {
    return `${hoursLabel} × (${formatOtFormulaNumber(basic, 2)} ÷ (${formatOtFormulaNumber(days, 2)} × ${formatOtFormulaNumber(hpd, 2)})) × ${multLabel}`;
  }
  const hourly = Number(input.hourlyRateQar);
  if (Number.isFinite(hourly) && hourly > 0) {
    return `${hoursLabel} × ${formatOtFormulaNumber(hourly, 4)} QAR/h × ${multLabel}`;
  }
  return `${hoursLabel} × (basic ÷ (${formatOtFormulaNumber(days, 2)} × ${formatOtFormulaNumber(hpd, 2)})) × ${multLabel} — basic salary missing`;
}

export type OtExportAmountBreakdown = {
  otHours: number;
  basicQar: number | null;
  hoursPerDay: number;
  daysPerMonth: number;
  rateMultiplier: number;
  hourlyRateQar: number;
  formula: string;
  computedAmountQar: number;
  /** Stored claim amount when usable; otherwise recomputed from snapshots. */
  amountQar: number;
  isFinalApproved: boolean;
  /** Claimed/calculated-hours estimate while still in approval. */
  estimatedAmountQar: number | "";
  /** Final amount after GM (or payroll posted). */
  approvedAmountQar: number | "";
};

/**
 * Excel "08 Overtime" amount columns: reuse claim snapshots + {@link computeOtAmountQar}.
 * Final-approved rows use approved minutes; otherwise claimed/calculated minutes.
 */
export function resolveOtExportAmountBreakdown(input: {
  status: string;
  calculatedMinutes: number;
  approvedMinutes?: number | null;
  rateMultiplier?: number | null;
  amountQar?: number | null;
  basicQarSnapshot?: number | null;
  hoursPerDaySnapshot?: number | null;
  daysPerMonthSnapshot?: number | null;
}): OtExportAmountBreakdown {
  const isFinalApproved = isOtFinalApprovedForPayroll(input.status);
  const minutes = isFinalApproved
    ? Math.max(0, Number(input.approvedMinutes ?? input.calculatedMinutes) || 0)
    : Math.max(0, Number(input.calculatedMinutes) || 0);
  const otHours = minutes / 60;
  const hoursRaw = Number(input.hoursPerDaySnapshot);
  const daysRaw = Number(input.daysPerMonthSnapshot);
  const hoursPerDay = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : OT_DEFAULT_HOURS_PER_DAY;
  const daysPerMonth = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const rateMultiplier = Math.max(0, Number(input.rateMultiplier) || 0);
  const basicRaw = Number(input.basicQarSnapshot);
  const basicQar = Number.isFinite(basicRaw) && basicRaw > 0 ? basicRaw : null;
  const hourlyRateQar = hourlyRateFromPay({
    monthlyBasicQar: basicQar,
    hoursPerDay,
    daysPerMonth,
  });
  const computedAmountQar = computeOtAmountQar({
    approvedMinutes: minutes,
    rateMultiplier,
    hourlyRateQar,
  });
  const stored = Number(input.amountQar);
  // Prefer recomputed amount so the Excel formula column matches the QAR figure;
  // fall back to stored claim amount when basic/hourly cannot be derived.
  const amountQar =
    hourlyRateQar > 0
      ? computedAmountQar
      : Number.isFinite(stored) && stored >= 0
        ? Math.round(stored * 100) / 100
        : 0;
  const formula = formatOtAmountFormula({
    otHours,
    basicQar,
    hoursPerDay,
    daysPerMonth,
    rateMultiplier,
    hourlyRateQar,
  });
  return {
    otHours,
    basicQar,
    hoursPerDay,
    daysPerMonth,
    rateMultiplier,
    hourlyRateQar: Math.round(hourlyRateQar * 10_000) / 10_000,
    formula,
    computedAmountQar,
    amountQar,
    isFinalApproved,
    estimatedAmountQar: isFinalApproved ? "" : amountQar,
    approvedAmountQar: isFinalApproved ? amountQar : "",
  };
}

/**
 * Prefer stored attendance overtime_minutes; optionally reuse computeAttendanceOvertimeMinutes
 * via a precomputed fallback — never invent a second attendance engine here.
 */
export function resolveEligibleOtMinutes(input: {
  storedOvertimeMinutes?: number | null;
  computedOvertimeMinutes?: number | null;
}): number {
  const stored = Number(input.storedOvertimeMinutes);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored);
  const computed = Number(input.computedOvertimeMinutes);
  if (Number.isFinite(computed) && computed > 0) return Math.round(computed);
  return 0;
}

export type OtSummaryBucket = {
  key: string;
  staffId?: string;
  staffName?: string | null;
  department?: string | null;
  employmentType?: string | null;
  locationId?: string | null;
  locationName?: string | null;
  claims: number;
  eligibleMinutes: number;
  approvedMinutes: number;
  amountQar: number;
};

/**
 * Minutes counted in monthly OT summary / request totals.
 * Prefer stamped approved minutes; fall back to claimed when HOO revise
 * clears `approved_minutes` while status stays `ops_approved`.
 */
export function otSummaryApprovedMinutes(input: {
  approvedMinutes?: number | null;
  claimedMinutes?: number | null;
}): number {
  if (input.approvedMinutes != null && Number.isFinite(Number(input.approvedMinutes))) {
    return Math.max(0, Math.round(Number(input.approvedMinutes)));
  }
  const claimed = Number(input.claimedMinutes);
  if (Number.isFinite(claimed)) return Math.max(0, Math.round(claimed));
  return 0;
}

/** Day-rows that belong in Monthly OT summary (active, non-draft workflow). */
export function isOtSummaryCountableStatus(status: string | null | undefined): boolean {
  return status !== "rejected" && status !== "cancelled" && status !== "draft";
}

export function aggregateOtSummaries(
  rows: Array<{
    staffId: string;
    staffName?: string | null;
    department?: string | null;
    employmentType?: string | null;
    locationId?: string | null;
    locationName?: string | null;
    eligibleMinutes: number;
    approvedMinutes: number;
    amountQar: number;
    status: string;
  }>,
  groupBy: "employee" | "department" | "employment_type" | "location",
): OtSummaryBucket[] {
  const map = new Map<string, OtSummaryBucket>();
  for (const row of rows) {
    if (!isOtSummaryCountableStatus(row.status)) continue;
    const key =
      groupBy === "employee"
        ? row.staffId
        : groupBy === "department"
          ? row.department || "—"
          : groupBy === "employment_type"
            ? row.employmentType || "—"
            : row.locationId || "—";
    const existing = map.get(key) ?? {
      key,
      staffId: groupBy === "employee" ? row.staffId : undefined,
      staffName: groupBy === "employee" ? row.staffName ?? null : undefined,
      department: groupBy === "department" ? row.department ?? null : undefined,
      employmentType: groupBy === "employment_type" ? row.employmentType ?? null : undefined,
      locationId: groupBy === "location" ? row.locationId ?? null : undefined,
      locationName: groupBy === "location" ? row.locationName ?? null : undefined,
      claims: 0,
      eligibleMinutes: 0,
      approvedMinutes: 0,
      amountQar: 0,
    };
    existing.claims += 1;
    existing.eligibleMinutes += Math.max(0, row.eligibleMinutes);
    existing.approvedMinutes += Math.max(0, row.approvedMinutes);
    existing.amountQar = Math.round((existing.amountQar + Math.max(0, row.amountQar)) * 100) / 100;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.amountQar - a.amountQar);
}
