import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { enumerateYmd } from "@/lib/attendance-hr/roster-period";
import { normalizeShiftHm, scheduledIsoFromHm } from "@/lib/attendance-hr/late-punch";

/** Written on attendance_logs.source so a roster fill is distinct from a device punch. */
export const ROSTER_PUNCH_FILL_SOURCE = "roster_fill";

/** Stored on attendance_logs.raw_payload.note. The source column is the marker. */
export const ROSTER_PUNCH_FILL_NOTE = "Filled from roster";

/** Inclusive range an approver can fill in one action. */
export const ROSTER_FILL_MAX_DAYS = 366;

/**
 * Punches that came from the biometric device or a device import.
 * A correction, a self check-in, and a previous roster fill are not in this set.
 */
const DEVICE_PUNCH_SOURCES = new Set(["device", "adms_push", "file_import", "api_ingest"]);

/**
 * CEO is the existing ceo role (Adil).
 * General Manager is the branch_gm role, or a General Manager job title.
 * Head of Operations is regional_ops, or the Head of Operations title used on My Day.
 * A cashier, a site supervisor, and a duty manager are not included.
 */
export function mayFillRosterDevicePunches(input: {
  roles: readonly string[];
  jobTitle?: string | null;
}): boolean {
  if (input.roles.includes("ceo")) return true;
  if (input.roles.includes("branch_gm")) return true;
  if (isGeneralManagerTitle(input.jobTitle)) return true;
  if (input.roles.includes("regional_ops")) return true;
  if (isHeadOfOperationsTitle(input.jobTitle)) return true;
  return false;
}

/** Company staff for the CEO. Everyone else who may fill uses their reporting team. */
export function rosterFillAudience(input: {
  roles: readonly string[];
  jobTitle?: string | null;
}): "company" | "team" | null {
  if (!mayFillRosterDevicePunches(input)) return null;
  if (input.roles.includes("ceo")) return "company";
  return "team";
}

export function isGeneralManagerTitle(jobTitle: string | null | undefined): boolean {
  return /\bgeneral manager\b/i.test(jobTitle ?? "");
}

export function isRealDevicePunchSource(source: string | null | undefined): boolean {
  const value = (source ?? "device").trim().toLowerCase();
  return DEVICE_PUNCH_SOURCES.has(value);
}

export type RosterFillAssignment = {
  workDate: string;
  locationId: string;
  isWeekOff: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type RosterFillExistingPunch = {
  workDate: string;
  source: string | null;
  excludedFromCalc?: boolean;
  probableDuplicate?: boolean;
};

export type RosterFillPunch = {
  workDate: string;
  locationId: string;
  punchType: "in" | "out";
  punchAt: string;
  attendanceDate: string;
  source: typeof ROSTER_PUNCH_FILL_SOURCE;
  note: typeof ROSTER_PUNCH_FILL_NOTE;
};

export type RosterFillPlan = {
  punches: RosterFillPunch[];
  filledDays: number;
  skippedDays: number;
};

export function rosterFillDates(dateFrom: string, dateTo: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error("Choose a from date and a to date.");
  }
  if (dateFrom > dateTo) throw new Error("The from date must be on or before the to date.");
  const days = enumerateYmd(dateFrom, dateTo);
  if (days.length === 0 || days.length > ROSTER_FILL_MAX_DAYS) {
    throw new Error(`Choose a range of ${ROSTER_FILL_MAX_DAYS} days or fewer.`);
  }
  return days;
}

function openPunch(punch: RosterFillExistingPunch): boolean {
  return !punch.excludedFromCalc && !punch.probableDuplicate;
}

/** A counted device punch, or a roster fill already written for that day. */
export function punchBlocksRosterFill(punch: RosterFillExistingPunch): boolean {
  if (!openPunch(punch)) return false;
  const source = (punch.source ?? "device").trim().toLowerCase();
  if (source === ROSTER_PUNCH_FILL_SOURCE) return true;
  return isRealDevicePunchSource(source);
}

/**
 * One punch-in and one punch-out per roster shift in the range.
 * An OFF day, a day with no shift, a day that already has a device punch,
 * and a day already filled from the roster are skipped.
 */
export function planRosterPunchFill(input: {
  dateFrom: string;
  dateTo: string;
  assignments: readonly RosterFillAssignment[];
  punches: readonly RosterFillExistingPunch[];
}): RosterFillPlan {
  const days = rosterFillDates(input.dateFrom, input.dateTo);
  const assignmentByDate = new Map<string, RosterFillAssignment>();
  for (const row of input.assignments) {
    const workDate = row.workDate.slice(0, 10);
    const current = assignmentByDate.get(workDate);
    if (!current || row.isWeekOff) assignmentByDate.set(workDate, { ...row, workDate });
  }
  const blocked = new Set<string>();
  for (const punch of input.punches) {
    if (!punchBlocksRosterFill(punch)) continue;
    blocked.add(punch.workDate.slice(0, 10));
  }

  const punches: RosterFillPunch[] = [];
  let skippedDays = 0;
  for (const workDate of days) {
    const assignment = assignmentByDate.get(workDate);
    const start = normalizeShiftHm(assignment?.shiftStart);
    const end = normalizeShiftHm(assignment?.shiftEnd);
    if (!assignment || assignment.isWeekOff || !assignment.locationId || !start || !end || blocked.has(workDate)) {
      skippedDays += 1;
      continue;
    }
    const overnight = end <= start;
    punches.push(
      {
        workDate,
        locationId: assignment.locationId,
        punchType: "in",
        punchAt: scheduledIsoFromHm(workDate, start),
        attendanceDate: workDate,
        source: ROSTER_PUNCH_FILL_SOURCE,
        note: ROSTER_PUNCH_FILL_NOTE,
      },
      {
        workDate,
        locationId: assignment.locationId,
        punchType: "out",
        punchAt: scheduledIsoFromHm(workDate, end, overnight ? 1 : 0),
        attendanceDate: workDate,
        source: ROSTER_PUNCH_FILL_SOURCE,
        note: ROSTER_PUNCH_FILL_NOTE,
      },
    );
  }

  return {
    punches,
    filledDays: punches.length / 2,
    skippedDays,
  };
}
