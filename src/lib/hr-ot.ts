/**
 * OT claim rules (Phase 4). Pure — no Supabase.
 * Eligible minutes come from attendance-hr overtime_minutes / computeAttendanceOvertimeMinutes;
 * this module only rounds, gates the 1-hour minimum, rates, amounts, and workflow.
 */

export const HR_OT_RATE_TYPES = ["weekday", "weekly_off", "public_holiday", "eid"] as const;
export type HrOtRateType = (typeof HR_OT_RATE_TYPES)[number];

export const HR_OT_STATUSES = [
  "draft",
  "submitted",
  "manager_verified",
  "ops_approved",
  "gm_approved",
  "hr_approved",
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
 *   submitted → manager_verified (site supervisor) → ops_approved (Head of Operations)
 *   → gm_approved (General Manager) → hr_approved → payroll_posted
 * Approvers may send back (`changes_requested`); the submitter cancels or resubmits to
 * restart at site supervisor (`submitted`), matching missed-punch / job-request flows.
 */
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
    gm: ["gm_approved", "changes_requested", "rejected"],
    hr: ["gm_approved", "changes_requested", "rejected"],
  },
  gm_approved: {
    hr: ["hr_approved", "changes_requested", "rejected"],
  },
  hr_approved: {
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
 * Approval queue statuses by actor capability.
 * Site supervisors act on `submitted`; HOO on `manager_verified`;
 * GM on `ops_approved`; HR on `gm_approved`.
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
  if (input.canGmApprove) statuses.push("ops_approved");
  if (input.canHrApprove) statuses.push("gm_approved");
  return [...new Set(statuses)];
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

/** Approver may request changes at the same steps where reject is allowed. */
export function canRequestOtChanges(status: HrOtStatus): boolean {
  return (
    status === "submitted" ||
    status === "manager_verified" ||
    status === "ops_approved" ||
    status === "gm_approved"
  );
}

/** Digital signature stamp for one OT print-slip column. */
export type OtPrintSignature = {
  name: string | null;
  at: string | null;
};

export type OtPrintSignatureKey = "site" | "hoo" | "gm" | "hr";

/** Whether a print-slip signature column is filled for the current status. */
export function otPrintSignatureDone(
  status: HrOtStatus | null | undefined,
  key: OtPrintSignatureKey,
): boolean {
  if (!status) return false;
  const order: HrOtStatus[] = [
    "manager_verified",
    "ops_approved",
    "gm_approved",
    "hr_approved",
    "payroll_posted",
  ];
  const idx = order.indexOf(status);
  if (idx < 0) return false;
  const needed: Record<OtPrintSignatureKey, number> = {
    site: 0,
    hoo: 1,
    gm: 2,
    hr: 3,
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
  };
}

/** Hierarchy steps for status badges / steppers (excludes terminal reject/cancel). */
export const HR_OT_HIERARCHY_STEPS = [
  "submitted",
  "manager_verified",
  "ops_approved",
  "gm_approved",
  "hr_approved",
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
    const sorted = [...claims].sort((a, b) => a.workDate.localeCompare(b.workDate));
    const first = sorted[0]!;
    const staffIds = [...new Set(sorted.map((c) => c.staffId))];
    const staffNames = [
      ...new Set(sorted.map((c) => c.staffName).filter((n): n is string => Boolean(n))),
    ];
    const workDates = [...new Set(sorted.map((c) => c.workDate))].sort();
    const totalClaimedMinutes = sorted.reduce((sum, c) => sum + Math.max(0, c.claimedMinutes), 0);
    const totalApprovedMinutes = sorted.reduce(
      (sum, c) => sum + Math.max(0, c.approvedMinutes ?? c.claimedMinutes),
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

/** AT#4: payroll_posted only once, only from hr_approved. */
export function canMarkPayrollPosted(status: HrOtStatus): boolean {
  return status === "hr_approved";
}

export function assertCanMarkPayrollPosted(status: HrOtStatus): void {
  if (!canMarkPayrollPosted(status)) {
    throw new Error(
      status === "payroll_posted"
        ? "OT claim is already payroll_posted."
        : "OT claim must be hr_approved before payroll_posted.",
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

/** Hourly divisor: 26/28-day contracts use the contract; everyone else uses OT policy (default 30). */
export function otPayDaysPerMonth(input: {
  contractWorkingDays?: number | null;
  policyDaysPerMonth?: number | null;
}): number {
  if (isSupervisorOtContract(input.contractWorkingDays)) return input.contractWorkingDays;
  const policy = Number(input.policyDaysPerMonth);
  return Number.isFinite(policy) && policy > 0 ? policy : 30;
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

/** Default OT hours/day divisor — aligns with site permanent 9h, not unpaid-break net 8. */
export const OT_DEFAULT_HOURS_PER_DAY = 9;

/**
 * Hourly rate from monthly **basic** (never package total) or daily rate.
 *
 * Qatar OT: `basic / daysPerMonth / hoursPerDay * rateMultiplier * otHours`.
 * - hoursPerDay: OT policy `hours_per_day` (default 9). Not roster expected_hours —
 *   the policy standard working day is the divisor HR uses for OT.
 * - daysPerMonth: 30 from policy by default; 26/28-day supervisor contracts use the contract.
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
    if (row.status === "rejected" || row.status === "cancelled" || row.status === "draft") continue;
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
