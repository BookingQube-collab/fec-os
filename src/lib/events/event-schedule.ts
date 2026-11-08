/** Phase 3–5 — event schedule / attendance helpers (pure). */

import { computeLatePunchMinutes, scheduledIsoFromHm } from "@/lib/attendance-hr/late-punch";
import { computeAttendanceOvertimeMinutes } from "@/lib/attendance-hr/overtime";
import { EXTENDED_SHIFT_HOURS } from "@/lib/attendance-hr/shift-policy";

/**
 * Labour roles (Cleaner / Maintenance) are not on a traditional shift module.
 * Day anchors still need scheduled_in/out for attendance pairing — use a fixed
 * 10h window matching site joker / extended expected hours.
 */
export const LABOUR_DAY_BASELINE_HOURS = EXTENDED_SHIFT_HOURS;
export const LABOUR_DAY_DEFAULT_SCHEDULED_IN = "08:00";
export const LABOUR_DAY_DEFAULT_SCHEDULED_OUT = "18:00";

export type EventScheduleSlotLike = {
  id?: string;
  event_id: string;
  staff_id: string;
  work_date: string;
  scheduled_in: string; // HH:MM or HH:MM:SS
  scheduled_out: string;
};

/** Asia/Qatar wall-clock minutes from an ISO punch (UTC+3). */
export function qatarClockMinutesFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const qatarHour = (d.getUTCHours() + 3 + 24) % 24;
  return qatarHour * 60 + d.getUTCMinutes();
}

export function normalizeTimeHHMM(value: string): string {
  const raw = (value ?? "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return raw;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function validateScheduleSlotTimes(scheduledIn: string, scheduledOut: string): string | null {
  const a = normalizeTimeHHMM(scheduledIn);
  const b = normalizeTimeHHMM(scheduledOut);
  if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b)) {
    return "Start and end times must be HH:MM";
  }
  if (a === b) return "End time must differ from start";
  return null;
}

/** Enumerate YYYY-MM-DD dates inclusive. */
export function enumerateDatesInclusive(dateFrom: string, dateTo: string): string[] {
  if (!dateFrom || !dateTo || dateTo < dateFrom) return [];
  const out: string[] = [];
  const cur = new Date(`${dateFrom}T12:00:00Z`);
  const end = new Date(`${dateTo}T12:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Build one slot per staff-day from an assignment window (default 09:00–18:00).
 * Used by "Seed from crew" for a pilot schedule.
 */
export function seedSlotsFromAssignments(
  eventId: string,
  assignments: Array<{
    id: string;
    staff_id: string;
    date_from: string;
    date_to: string;
    role_label?: string | null;
  }>,
  defaults?: { scheduledIn?: string; scheduledOut?: string },
): Array<{
  event_id: string;
  staff_id: string;
  assignment_id: string;
  work_date: string;
  scheduled_in: string;
  scheduled_out: string;
  role_label: string | null;
}> {
  const scheduledIn = normalizeTimeHHMM(defaults?.scheduledIn ?? "09:00");
  const scheduledOut = normalizeTimeHHMM(defaults?.scheduledOut ?? "18:00");
  const rows: Array<{
    event_id: string;
    staff_id: string;
    assignment_id: string;
    work_date: string;
    scheduled_in: string;
    scheduled_out: string;
    role_label: string | null;
  }> = [];
  for (const a of assignments) {
    for (const work_date of enumerateDatesInclusive(a.date_from, a.date_to)) {
      rows.push({
        event_id: eventId,
        staff_id: a.staff_id,
        assignment_id: a.id,
        work_date,
        scheduled_in: scheduledIn,
        scheduled_out: scheduledOut,
        role_label: a.role_label ?? null,
      });
    }
  }
  return rows;
}

/** Match a punch timestamp to the earliest/latest of the day for In/Out pairing. */
export function pairPunchTimes(punchIsoTimes: string[]): { actualIn: string | null; actualOut: string | null } {
  if (!punchIsoTimes.length) return { actualIn: null, actualOut: null };
  const sorted = [...punchIsoTimes].sort();
  if (sorted.length === 1) return { actualIn: sorted[0], actualOut: null };
  return { actualIn: sorted[0], actualOut: sorted[sorted.length - 1] };
}

export function minutesBetweenIso(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60_000);
}

/**
 * Derive daily status from punches vs event schedule (shift_punch style).
 * Late/OT use Asia/Qatar wall clock via scheduledIsoFromHm + site grace/buffer.
 */
export function deriveEventDayStatus(input: {
  actualIn: string | null;
  actualOut: string | null;
  workDate: string;
  scheduledIn: string;
  scheduledOut: string;
  /** Minutes from schedule start to on-time cutoff (site buffer / grace). Default 10. */
  graceMinutes?: number;
}): {
  status: string;
  lateMinutes: number;
  workedMinutes: number;
  overtimeMinutes: number;
  missedPunch: boolean;
  scheduledInIso: string;
  scheduledOutIso: string;
} {
  const grace = input.graceMinutes ?? 10;
  const scheduledInHm = normalizeTimeHHMM(input.scheduledIn);
  const scheduledOutHm = normalizeTimeHHMM(input.scheduledOut);
  const overnight = scheduledOutHm <= scheduledInHm;
  const scheduledInIso = scheduledIsoFromHm(input.workDate, scheduledInHm);
  const scheduledOutIso = scheduledIsoFromHm(input.workDate, scheduledOutHm, overnight ? 1 : 0);

  const { actualIn, actualOut } = input;
  if (!actualIn && !actualOut) {
    return {
      status: "absent",
      lateMinutes: 0,
      workedMinutes: 0,
      overtimeMinutes: 0,
      missedPunch: false,
      scheduledInIso,
      scheduledOutIso,
    };
  }
  if (!actualIn || !actualOut) {
    return {
      status: "missed_punch",
      lateMinutes: 0,
      workedMinutes: minutesBetweenIso(actualIn, actualOut),
      overtimeMinutes: 0,
      missedPunch: true,
      scheduledInIso,
      scheduledOutIso,
    };
  }

  const workedMinutes = minutesBetweenIso(actualIn, actualOut);
  const lateRaw = computeLatePunchMinutes({
    actualIn,
    scheduledIn: scheduledInIso,
    graceMinutes: grace,
  });
  // Event payroll / daily summary store whole minutes (same as site late column rounding).
  const lateMinutes = Math.max(0, Math.round(lateRaw));
  const overtimeMinutes = computeAttendanceOvertimeMinutes({
    workedMinutes,
    actualOut,
    scheduledIn: scheduledInIso,
    scheduledOut: scheduledOutIso,
  });

  let status = "present";
  if (lateMinutes > 0) status = "late";
  else if (overtimeMinutes > 0) status = "overtime";

  return {
    status,
    lateMinutes,
    workedMinutes,
    overtimeMinutes,
    missedPunch: false,
    scheduledInIso,
    scheduledOutIso,
  };
}
