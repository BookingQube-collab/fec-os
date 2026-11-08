/** Phase 4 — event payroll helpers (pure). */

import { LABOUR_DAY_BASELINE_HOURS } from "@/lib/events/event-schedule";
import { isPayrollPaidNonWorkDay, isPayrollPresentDay, type PayrollDayInput } from "@/lib/attendance-hr/payroll";

/**
 * event_pay_policy — product defaults (Phase 0). Encoded for admins in UI copy;
 * do not invent a second company cut-off here (see payroll_cycle on site settings).
 *
 * - HO cut-off = company FEC 28–27 (same monthly cycle as sites unless HO overrides)
 * - HO attendance = shift_punch + site expected hours
 * - Event venue = existing location (+ Add site when needed)
 * - Event punches = host-site devices (or dedicated event device set when linked)
 * - Loaned with pay_on_event_run → those days excluded from monthly generate
 * - Event-only / joker on the event pay run when pay_on_event_run
 * - Labour / day-rate on event runs: day pay = (hours_worked / 10) × daily_rate
 *   (10h baseline; 20h in a day = double). Crew/Management stay on shift slots.
 */
export const EVENT_PAY_POLICY = {
  hoCutoff: "fec_28_27",
  hoAttendance: "shift_punch_plus_site_hours",
  venue: "existing_location_or_add_site",
  punches: "host_site_devices_or_event_device_set",
  loanedPayOnEventExcludedFromMonthly: true,
  eventOnlyAndJokerOnEventRun: true,
  labourDayBaselineHours: LABOUR_DAY_BASELINE_HOURS,
  labourDayPayUsesHoursOverBaseline: true,
} as const;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Paid day-units for labour / day-rate event pay.
 * Example: 20 hours worked → 2.0 units → double the daily rate for that day.
 */
export function labourDayPayUnits(
  hoursWorked: number,
  baselineHours: number = LABOUR_DAY_BASELINE_HOURS,
): number {
  const hours = Math.max(0, Number(hoursWorked) || 0);
  const baseline = Math.max(1, Number(baselineHours) || LABOUR_DAY_BASELINE_HOURS);
  return round2(hours / baseline);
}

export function labourDayPayUnitsFromMinutes(
  workedMinutes: number,
  baselineHours: number = LABOUR_DAY_BASELINE_HOURS,
): number {
  return labourDayPayUnits(Math.max(0, Number(workedMinutes) || 0) / 60, baselineHours);
}

/** day pay = (hours_worked / 10) × daily_rate */
export function computeLabourDayPayQar(
  hoursWorked: number,
  dayRateQar: number,
  baselineHours: number = LABOUR_DAY_BASELINE_HOURS,
): number {
  return round2(labourDayPayUnits(hoursWorked, baselineHours) * Math.max(0, Number(dayRateQar) || 0));
}

function isLabourHourPayWorkDay(day: PayrollDayInput): boolean {
  if (isPayrollPresentDay(day)) return true;
  const status = String(day.status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (status === "overtime" || status === "short_hours" || status === "late") return true;
  return Number(day.worked_minutes ?? 0) > 0 && Boolean(day.actual_in) && Boolean(day.actual_out);
}

/**
 * Sum labour day-units across attendance rows for one staff on an event pay run.
 * Present/worked days use hours/10; paid non-work (week off / annual leave) stay 1.0.
 */
export function sumLabourDayPayUnitsForStaff(
  days: PayrollDayInput[],
  staffId: string,
  bounds?: { from?: string | null; to?: string | null },
  baselineHours: number = LABOUR_DAY_BASELINE_HOURS,
): number {
  let units = 0;
  for (const day of days) {
    if (day.staff_id !== staffId) continue;
    const workDate = day.work_date ? String(day.work_date).slice(0, 10) : null;
    if (!workDate) continue;
    if (bounds?.from && workDate < bounds.from) continue;
    if (bounds?.to && workDate > bounds.to) continue;
    if (isPayrollPaidNonWorkDay(day)) {
      units += 1;
      continue;
    }
    if (!isLabourHourPayWorkDay(day)) continue;
    units += labourDayPayUnitsFromMinutes(Number(day.worked_minutes ?? 0), baselineHours);
  }
  return round2(units);
}

export type EventPayAssignmentLike = {
  staff_id: string;
  assignment_type: string;
  date_from: string;
  date_to: string;
  pay_on_event_run: boolean;
};

export type EventPaidDayKey = `${string}|${string}`; // staffId|YYYY-MM-DD

export function eventPaidDayKey(staffId: string, workDate: string): EventPaidDayKey {
  return `${staffId}|${workDate.slice(0, 10)}`;
}

/**
 * Days that should be paid on an event run (and excluded from monthly for loaned staff).
 * Only assignments with pay_on_event_run.
 */
export function collectEventPaidDays(
  assignments: EventPayAssignmentLike[],
  enumerateDates: (from: string, to: string) => string[],
): Set<EventPaidDayKey> {
  const keys = new Set<EventPaidDayKey>();
  for (const a of assignments) {
    if (!a.pay_on_event_run) continue;
    for (const d of enumerateDates(a.date_from, a.date_to)) {
      keys.add(eventPaidDayKey(a.staff_id, d));
    }
  }
  return keys;
}

/**
 * Staff included on an event pay run: pay_on_event_run assignments overlapping the period window.
 */
export function staffIdsForEventPayRun(
  assignments: EventPayAssignmentLike[],
  dateFrom: string,
  dateTo: string,
): string[] {
  const ids = new Set<string>();
  for (const a of assignments) {
    if (!a.pay_on_event_run) continue;
    if (a.date_to < dateFrom || a.date_from > dateTo) continue;
    ids.add(a.staff_id);
  }
  return [...ids];
}

/**
 * Filter monthly payroll day inputs: drop days that are covered by event pay for loaned staff.
 * Joker / event_hire are typically not on monthly at all; still exclude their event days if present.
 */
export function excludeEventPaidDaysFromMonthly(
  dayInputs: Array<{ staff_id: string | null; work_date?: string | null }>,
  eventPaidDays: Set<EventPaidDayKey>,
): typeof dayInputs {
  if (!eventPaidDays.size) return dayInputs;
  return dayInputs.filter((d) => {
    const staffId = d.staff_id;
    const workDate = d.work_date ? String(d.work_date).slice(0, 10) : null;
    if (!staffId || !workDate) return true;
    return !eventPaidDays.has(eventPaidDayKey(staffId, workDate));
  });
}

/** Synthetic YYYY-MM for event period row (sorting); uniqueness is on event_id. */
export function eventPeriodMonthAnchor(eventStart: string | null | undefined, fallback = "1970-01"): string {
  const d = (eventStart ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(0, 7);
  return fallback;
}

export function isEventPayrollPeriod(period: { periodKind?: string | null; period_kind?: string | null }): boolean {
  const kind = period.periodKind ?? period.period_kind ?? "monthly";
  return kind === "event";
}

/**
 * Distinct WPS / export batch label for event pay runs.
 * Keeps monthly exports on YYYY-MM; event runs become "Event: …".
 */
export function eventPayrollBatchLabel(
  displayName: string | null | undefined,
  fallback = "Event payroll",
): string {
  const raw = (displayName ?? "").trim() || fallback;
  if (/^event\s*:/i.test(raw)) return raw;
  return `Event: ${raw}`;
}

/**
 * Salary Month / batch column for payroll CSV export.
 * Monthly periods keep YYYY-MM; event periods use Event: label.
 */
export function payrollExportMonthLabel(period: {
  periodKind?: string | null;
  period_kind?: string | null;
  month?: string | null;
  displayName?: string | null;
  display_name?: string | null;
}): string {
  if (isEventPayrollPeriod(period)) {
    return eventPayrollBatchLabel(period.displayName ?? period.display_name ?? period.month);
  }
  return String(period.month ?? "");
}
