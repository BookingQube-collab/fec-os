import { countLeaveDays, type HrLeaveType } from "@/lib/hr-leave";

export type LeaveBalanceRow = {
  leaveType: HrLeaveType;
  allottedDays: number;
  usedDays: number;
};

export type LeaveBalanceSummary = {
  leaveType: HrLeaveType;
  allottedDays: number;
  usedDays: number;
  remainingDays: number;
};

export function summarizeLeaveBalances(
  allotments: Array<{ leaveType: string; allottedDays: number }>,
  usedByType: Record<string, number>,
): LeaveBalanceSummary[] {
  const types = new Set<string>([
    ...allotments.map((a) => a.leaveType),
    ...Object.keys(usedByType),
  ]);
  return [...types]
    .sort()
    .map((leaveType) => {
      const allotted = allotments.find((a) => a.leaveType === leaveType)?.allottedDays ?? 0;
      const used = usedByType[leaveType] ?? 0;
      return {
        leaveType: leaveType as HrLeaveType,
        allottedDays: allotted,
        usedDays: used,
        remainingDays: Math.max(0, allotted - used),
      };
    });
}

export function sumUsedLeaveDays(
  rows: Array<{ leaveType: string; days: number; status: string; dateFrom: string }>,
  year: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.status !== "approved") continue;
    if (Number(row.dateFrom.slice(0, 4)) !== year) continue;
    out[row.leaveType] = (out[row.leaveType] ?? 0) + Number(row.days ?? 0);
  }
  return out;
}

export type LeaveConflictKind = "roster" | "attendance" | "leave_overlap";

export type LeaveConflict = {
  kind: LeaveConflictKind;
  workDate: string;
  detail: string;
};

/** Inclusive YMD overlap between [fromA,toA] and [fromB,toB]. */
export function dateRangesOverlap(
  fromA: string,
  toA: string,
  fromB: string,
  toB: string,
): boolean {
  const a0 = fromA.slice(0, 10);
  const a1 = toA.slice(0, 10);
  const b0 = fromB.slice(0, 10);
  const b1 = toB.slice(0, 10);
  return a0 <= b1 && b0 <= a1;
}

export function detectLeaveConflicts(input: {
  dateFrom: string;
  dateTo: string;
  rosterDates?: string[];
  attendancePresentDates?: string[];
  overlappingLeave?: Array<{ dateFrom: string; dateTo: string; status: string }>;
}): LeaveConflict[] {
  const conflicts: LeaveConflict[] = [];
  const from = input.dateFrom.slice(0, 10);
  const to = input.dateTo.slice(0, 10);
  if (countLeaveDays(from, to) < 1) return conflicts;

  for (const workDate of input.rosterDates ?? []) {
    const d = workDate.slice(0, 10);
    if (d >= from && d <= to) {
      conflicts.push({ kind: "roster", workDate: d, detail: "Assigned on roster" });
    }
  }
  for (const workDate of input.attendancePresentDates ?? []) {
    const d = workDate.slice(0, 10);
    if (d >= from && d <= to) {
      conflicts.push({ kind: "attendance", workDate: d, detail: "Present / punched" });
    }
  }
  for (const row of input.overlappingLeave ?? []) {
    if (row.status === "cancelled" || row.status === "rejected") continue;
    if (dateRangesOverlap(from, to, row.dateFrom, row.dateTo)) {
      conflicts.push({
        kind: "leave_overlap",
        workDate: row.dateFrom.slice(0, 10),
        detail: `Overlaps ${row.dateFrom.slice(0, 10)} → ${row.dateTo.slice(0, 10)}`,
      });
    }
  }
  return conflicts;
}

export function formatOtPolicySummary(policy: {
  overtimeAfterMinutes: number;
  maxDailyOtMinutes: number | null;
  maxWeeklyOtMinutes: number | null;
  requiresPreapproval: boolean;
}): string {
  const afterH = Math.round((policy.overtimeAfterMinutes / 60) * 10) / 10;
  const parts = [`OT after ${afterH}h worked`];
  if (policy.maxDailyOtMinutes != null) {
    parts.push(`max ${Math.round((policy.maxDailyOtMinutes / 60) * 10) / 10}h/day`);
  }
  if (policy.maxWeeklyOtMinutes != null) {
    parts.push(`max ${Math.round((policy.maxWeeklyOtMinutes / 60) * 10) / 10}h/week`);
  }
  if (policy.requiresPreapproval) parts.push("pre-approval required");
  return parts.join(" · ");
}

export type HeadcountBySite = {
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  headcount: number;
};

export function aggregateHeadcountBySite(
  rows: Array<{ locationId: string | null; locationCode: string | null; locationName: string | null }>,
): HeadcountBySite[] {
  const map = new Map<string, HeadcountBySite>();
  for (const row of rows) {
    const key = row.locationId ?? "none";
    const cur = map.get(key) ?? {
      locationId: row.locationId,
      locationCode: row.locationCode,
      locationName: row.locationName,
      headcount: 0,
    };
    cur.headcount += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.headcount - a.headcount || (a.locationCode ?? "").localeCompare(b.locationCode ?? ""));
}

export function sumLeaveDaysInPeriod(
  rows: Array<{ days: number; status: string; dateFrom: string; dateTo: string }>,
  periodFrom: string,
  periodTo: string,
): number {
  let total = 0;
  const from = periodFrom.slice(0, 10);
  const to = periodTo.slice(0, 10);
  for (const row of rows) {
    if (row.status !== "approved") continue;
    if (!dateRangesOverlap(row.dateFrom, row.dateTo, from, to)) continue;
    total += Number(row.days ?? 0);
  }
  return total;
}

export const HR_DOC_TYPES = ["contract", "qid", "passport", "visa", "other"] as const;
export type HrDocType = (typeof HR_DOC_TYPES)[number];

export const HR_CHECKLIST_KINDS = ["onboarding", "offboarding"] as const;
export type HrChecklistKind = (typeof HR_CHECKLIST_KINDS)[number];

export const DEFAULT_ANNUAL_ALLOTMENT = 21;
export const DEFAULT_SICK_ALLOTMENT = 14;
