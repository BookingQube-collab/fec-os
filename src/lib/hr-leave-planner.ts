/**
 * Head Office Leave Planner — pure rules engine mirroring E3 Leave Planner Excel.
 * Result order: invalid dates → event blackout → department quota → overall cap → APPROVE.
 */

export type LeavePlannerEventType = "major" | "activation";
export type LeavePlannerActivationRuleSet = "as_stated" | "lighter";
export type LeavePlannerResult = "APPROVE" | "DECLINE";
export type LeavePlannerDeclineCode =
  | "invalid_dates"
  | "event_blackout"
  | "department_quota"
  | "overall_cap";

export type LeavePlannerRules = {
  activationRuleSet: LeavePlannerActivationRuleSet;
  majorBeforeDays: number;
  majorAfterDays: number;
  activationBeforeAsStated: number;
  activationAfterAsStated: number;
  activationBeforeLighter: number;
  activationAfterLighter: number;
  overallMaxAway: number;
  maxAwayPerDepartment: number;
};

export type LeavePlannerEvent = {
  id: string;
  name: string;
  eventType: LeavePlannerEventType;
  startDate: string;
  endDate: string;
  active?: boolean;
};

export type LeavePlannerAwayRow = {
  staffId: string;
  dateFrom: string;
  dateTo: string;
  /** Exclude this request id when re-evaluating an existing row. */
  id?: string | null;
};

export type LeavePlannerStaffMember = {
  staffId: string;
  /** Department ids this person belongs to (multi-membership). */
  departmentIds: string[];
};

export type LeavePlannerDepartment = {
  id: string;
  name: string;
  /** Headcount of HO staff in this department (for max-away = min(global, headcount-1)). */
  headcount: number;
};

export type LeavePlannerEvaluation = {
  result: LeavePlannerResult;
  reasons: string[];
  codes: LeavePlannerDeclineCode[];
  /** Would DECLINE if this were a non-emergency request (used to stamp emergency overrides). */
  wouldDecline: boolean;
  blackoutEvents: Array<{ id: string; name: string; blackoutStart: string; blackoutEnd: string }>;
  departmentsOverQuota: Array<{ id: string; name: string; away: number; maxAway: number }>;
  staffAwayCount: number;
  overallMaxAway: number;
  days: number;
};

export const DEFAULT_LEAVE_PLANNER_RULES: LeavePlannerRules = {
  activationRuleSet: "as_stated",
  majorBeforeDays: 40,
  majorAfterDays: 10,
  activationBeforeAsStated: 20,
  activationAfterAsStated: 5,
  activationBeforeLighter: 15,
  activationAfterLighter: 3,
  overallMaxAway: 27,
  maxAwayPerDepartment: 2,
};

function parseYmd(ymd: string): number {
  return Date.parse(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

function formatYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const base = parseYmd(ymd);
  if (Number.isNaN(base)) return ymd.slice(0, 10);
  return formatYmd(base + days * 86_400_000);
}

export function rangesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return parseYmd(aFrom) <= parseYmd(bTo) && parseYmd(bFrom) <= parseYmd(aTo);
}

export function countInclusiveDays(dateFrom: string, dateTo: string): number {
  const from = parseYmd(dateFrom);
  const to = parseYmd(dateTo);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

export function activationLeadTrail(rules: LeavePlannerRules): { before: number; after: number } {
  if (rules.activationRuleSet === "lighter") {
    return { before: rules.activationBeforeLighter, after: rules.activationAfterLighter };
  }
  return { before: rules.activationBeforeAsStated, after: rules.activationAfterAsStated };
}

export function blackoutWindow(
  event: Pick<LeavePlannerEvent, "eventType" | "startDate" | "endDate">,
  rules: LeavePlannerRules,
): { blackoutStart: string; blackoutEnd: string } {
  const lead =
    event.eventType === "major"
      ? { before: rules.majorBeforeDays, after: rules.majorAfterDays }
      : activationLeadTrail(rules);
  return {
    blackoutStart: addDaysYmd(event.startDate, -lead.before),
    blackoutEnd: addDaysYmd(event.endDate, lead.after),
  };
}

/** Excel Staff! max away: MIN(globalMax, headcount - 1), floored at 0. */
export function maxAwayForDepartment(headcount: number, globalMax: number): number {
  if (headcount <= 0) return 0;
  return Math.min(globalMax, Math.max(0, headcount - 1));
}

export function yearViewDayMark(
  dayYmd: string,
  events: LeavePlannerEvent[],
  rules: LeavePlannerRules,
): "E" | "X" | "." {
  for (const event of events) {
    if (event.active === false) continue;
    if (rangesOverlap(dayYmd, dayYmd, event.startDate, event.endDate)) return "E";
  }
  for (const event of events) {
    if (event.active === false) continue;
    const { blackoutStart, blackoutEnd } = blackoutWindow(event, rules);
    if (rangesOverlap(dayYmd, dayYmd, blackoutStart, blackoutEnd)) return "X";
  }
  return ".";
}

export type PairMatrixCell = "X" | "~" | "OK" | "-";

/**
 * Pair Matrix cell:
 * - X = share a department where only 1 may be away
 * - ~ = share a department (quota > 1) so a third member would be blocked
 * - OK = no shared department
 * - - = same person
 */
export function pairMatrixCell(
  aDeptIds: readonly string[],
  bDeptIds: readonly string[],
  departments: readonly LeavePlannerDepartment[],
  globalMaxAway: number,
): PairMatrixCell {
  const a = new Set(aDeptIds);
  const shared = bDeptIds.filter((id) => a.has(id));
  if (shared.length === 0) return "OK";
  let hasStrict = false;
  for (const id of shared) {
    const dept = departments.find((d) => d.id === id);
    const max = maxAwayForDepartment(dept?.headcount ?? 0, globalMaxAway);
    if (max <= 1) hasStrict = true;
  }
  return hasStrict ? "X" : "~";
}

export function evaluateLeavePlannerRequest(input: {
  staffId: string;
  dateFrom: string;
  dateTo: string;
  /** When true, never hard-DECLINE — caller still reads wouldDecline for override stamp. */
  isEmergency?: boolean;
  rules: LeavePlannerRules;
  events: LeavePlannerEvent[];
  /** Existing pending+approved leaves that count as away (exclude cancelled/rejected). */
  awayLeaves: LeavePlannerAwayRow[];
  staffMembers: LeavePlannerStaffMember[];
  departments: LeavePlannerDepartment[];
  /** Exclude this leave id from awayLeaves when rechecking. */
  excludeLeaveId?: string | null;
}): LeavePlannerEvaluation {
  const dateFrom = input.dateFrom.slice(0, 10);
  const dateTo = input.dateTo.slice(0, 10);
  const days = countInclusiveDays(dateFrom, dateTo);
  const emptyBase = {
    blackoutEvents: [] as LeavePlannerEvaluation["blackoutEvents"],
    departmentsOverQuota: [] as LeavePlannerEvaluation["departmentsOverQuota"],
    staffAwayCount: 0,
    overallMaxAway: input.rules.overallMaxAway,
    days,
  };

  if (days < 1) {
    return {
      result: "DECLINE",
      reasons: ["Check dates (last day before first day)"],
      codes: ["invalid_dates"],
      wouldDecline: true,
      ...emptyBase,
    };
  }

  const activeEvents = input.events.filter((e) => e.active !== false);
  const blackoutHits: LeavePlannerEvaluation["blackoutEvents"] = [];
  for (const event of activeEvents) {
    const window = blackoutWindow(event, input.rules);
    if (rangesOverlap(dateFrom, dateTo, window.blackoutStart, window.blackoutEnd)) {
      blackoutHits.push({
        id: event.id,
        name: event.name,
        blackoutStart: window.blackoutStart,
        blackoutEnd: window.blackoutEnd,
      });
    }
  }
  if (blackoutHits.length > 0) {
    const names = blackoutHits.map((e) => e.name).join(", ");
    const evaluation: LeavePlannerEvaluation = {
      result: "DECLINE",
      reasons: [`DECLINE - event blackout (${names})`],
      codes: ["event_blackout"],
      wouldDecline: true,
      ...emptyBase,
      blackoutEvents: blackoutHits,
    };
    if (input.isEmergency) {
      return { ...evaluation, result: "APPROVE" };
    }
    return evaluation;
  }

  const member = input.staffMembers.find((s) => s.staffId === input.staffId);
  const myDeptIds = new Set(member?.departmentIds ?? []);

  const overlapping = input.awayLeaves.filter((row) => {
    if (input.excludeLeaveId && row.id && row.id === input.excludeLeaveId) return false;
    return rangesOverlap(dateFrom, dateTo, row.dateFrom, row.dateTo);
  });

  // Proposed request counts as away (Excel Leave Log includes the row being entered).
  const proposedAlreadyListed = overlapping.some((row) => row.staffId === input.staffId);
  const effectiveAway: LeavePlannerAwayRow[] = proposedAlreadyListed
    ? overlapping
    : [...overlapping, { staffId: input.staffId, dateFrom, dateTo }];

  const staffAwayCount = new Set(effectiveAway.map((r) => r.staffId)).size;

  const departmentsOverQuota: LeavePlannerEvaluation["departmentsOverQuota"] = [];
  for (const dept of input.departments) {
    if (!myDeptIds.has(dept.id)) continue;
    const maxAway = maxAwayForDepartment(dept.headcount, input.rules.maxAwayPerDepartment);
    const awayStaff = new Set<string>();
    for (const row of effectiveAway) {
      const other = input.staffMembers.find((s) => s.staffId === row.staffId);
      if (other?.departmentIds.includes(dept.id)) awayStaff.add(row.staffId);
    }
    if (awayStaff.size > maxAway) {
      departmentsOverQuota.push({
        id: dept.id,
        name: dept.name,
        away: awayStaff.size,
        maxAway,
      });
    }
  }

  if (departmentsOverQuota.length > 0) {
    const detail = departmentsOverQuota
      .map((d) => `${d.name} (${d.away}/${d.maxAway})`)
      .join(", ");
    const evaluation: LeavePlannerEvaluation = {
      result: "DECLINE",
      reasons: [`DECLINE - department quota (${detail})`],
      codes: ["department_quota"],
      wouldDecline: true,
      ...emptyBase,
      departmentsOverQuota,
      staffAwayCount,
    };
    if (input.isEmergency) {
      return { ...evaluation, result: "APPROVE" };
    }
    return evaluation;
  }

  if (staffAwayCount > input.rules.overallMaxAway) {
    const evaluation: LeavePlannerEvaluation = {
      result: "DECLINE",
      reasons: [
        `DECLINE - overall cap (${staffAwayCount} away, max ${input.rules.overallMaxAway})`,
      ],
      codes: ["overall_cap"],
      wouldDecline: true,
      ...emptyBase,
      staffAwayCount,
    };
    if (input.isEmergency) {
      return { ...evaluation, result: "APPROVE" };
    }
    return evaluation;
  }

  return {
    result: "APPROVE",
    reasons: ["APPROVE"],
    codes: [],
    wouldDecline: false,
    ...emptyBase,
    staffAwayCount,
  };
}
