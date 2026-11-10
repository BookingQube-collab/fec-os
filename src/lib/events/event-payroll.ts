/** Phase 4 — event payroll helpers (pure). */

import {
  resolveEventCrewScheduleCategory,
  type EventCrewScheduleCategory,
  type EventCrewScheduleCategoryInput,
} from "@/lib/events/crew-schedule-categories";
import { LABOUR_DAY_BASELINE_HOURS } from "@/lib/events/event-schedule";
import { isPayrollPaidNonWorkDay, isPayrollPresentDay, type PayrollDayInput } from "@/lib/attendance-hr/payroll";

/**
 * event_pay_policy — product defaults.
 *
 * - Paid window = event open dates (event_start → event_end)
 * - Labour track = day rate × paid event days (attendance paid-day units + late policy)
 * - Staff track = crew / maintenance / cleaners (salary day units + late policy)
 * - Management / HO management = excluded from the event pay run
 * - Loaned with pay_on_event_run → those days excluded from monthly generate
 * - Event punches = host-site devices (or dedicated event device set when linked)
 */
export const EVENT_PAY_POLICY = {
  paidWindow: "event_open_dates",
  /** Labour roles: day_rate × paid calendar days in the event open window. */
  labourTrack: "day_rate_times_paid_days",
  staffTrack: "crew_maintenance_cleaners_salary_days",
  managementExcluded: true,
  venue: "existing_location_or_add_site",
  punches: "host_site_devices_or_event_device_set",
  loanedPayOnEventExcludedFromMonthly: true,
  eventOnlyAndJokerOnEventRun: true,
  /** Schedule/UI helper baseline; event generate uses paid calendar day units. */
  labourDayBaselineHours: LABOUR_DAY_BASELINE_HOURS,
  labourDayPayUsesHoursOverBaseline: false,
} as const;

export type EventPayTrack = "labour" | "staff";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Paid day-units for labour / day-rate (legacy hours÷baseline helper).
 * Event generate uses paid calendar day units instead; kept for schedule/UI math.
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

/** day pay = (hours_worked / baseline) × daily_rate — schedule/UI helper only. */
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
 * Sum labour day-units across attendance rows (hours÷baseline).
 * Prefer paid day-unit counting on event generate; retained for tests/schedule tooling.
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

/** Management / HO management are scheduled for ops but never on the event pay run. */
export function isEventPayrollEligibleCategory(category: EventCrewScheduleCategory): boolean {
  return category !== "management";
}

/** Explicit labourer / day-labour role labels (not cleaner / maintenance / crew). */
export function isEventLabourerRole(roleLabel: string | null | undefined): boolean {
  const role = String(roleLabel ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ");
  if (!role) return false;
  if (/\blabou?r(?:er|ers|ing)?\b/.test(role)) return true;
  if (role.includes("عامل")) return true;
  return false;
}

/**
 * Resolve labour vs staff pay track for an event assignment.
 * Returns null when the person must be excluded (management).
 * Prefer explicit event role kind=labour; then labourer role_label; else staff.
 */
export function resolveEventPayTrack(
  input: EventCrewScheduleCategoryInput & {
    assignment_type?: string | null;
    role_kind?: string | null;
  },
): EventPayTrack | null {
  const category = resolveEventCrewScheduleCategory(input);
  if (!isEventPayrollEligibleCategory(category)) return null;
  if (String(input.role_kind ?? "").toLowerCase() === "labour") return "labour";
  if (isEventLabourerRole(input.role_label)) return "labour";
  return "staff";
}

export type EventPayAssignmentLike = {
  staff_id: string;
  assignment_type: string;
  date_from: string;
  date_to: string;
  pay_on_event_run: boolean;
};

export type EventPayAssignmentWithRole = EventPayAssignmentLike &
  EventCrewScheduleCategoryInput & {
    role_kind?: string | null;
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
 * Does not apply management exclusion — prefer staffIdsForEventPayRunByTrack when role meta is available.
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
 * Split event pay-run staff into labour vs staff tracks; management is omitted from both.
 */
export function staffIdsForEventPayRunByTrack(
  assignments: EventPayAssignmentWithRole[],
  dateFrom: string,
  dateTo: string,
): { labour: string[]; staff: string[]; all: string[] } {
  const labour = new Set<string>();
  const staff = new Set<string>();
  for (const a of assignments) {
    if (!a.pay_on_event_run) continue;
    if (a.date_to < dateFrom || a.date_from > dateTo) continue;
    const track = resolveEventPayTrack(a);
    if (track === "labour") labour.add(a.staff_id);
    else if (track === "staff") staff.add(a.staff_id);
  }
  // Prefer labour track when the same person appears under both labels.
  for (const id of labour) staff.delete(id);
  const all = [...new Set([...labour, ...staff])];
  return { labour: [...labour], staff: [...staff], all };
}

/** Counts explaining why event Generate produced 0 lines (for toasts / HOO debug). */
export type EventPayGenerateBlockers = {
  assignmentsTotal: number;
  payOnEvent: number;
  overlappingOpenWindow: number;
  eligibleStaff: number;
  labourEligible: number;
  staffEligible: number;
  managementExcluded: number;
  attendanceDays: number;
  staffWithDayRate: number;
};

/**
 * Summarize eligibility blockers for an event pay generate attempt.
 * `overlappingOpenWindow` is pay-on-event assignments intersecting dateFrom–dateTo;
 * management is counted separately from labour/staff eligible sets.
 */
export function summarizeEventPayGenerateBlockers(
  assignments: EventPayAssignmentWithRole[],
  dateFrom: string,
  dateTo: string,
  extras?: { attendanceDays?: number; staffWithDayRate?: number },
): EventPayGenerateBlockers {
  let payOnEvent = 0;
  let overlappingOpenWindow = 0;
  let managementExcluded = 0;
  const labour = new Set<string>();
  const staff = new Set<string>();
  for (const a of assignments) {
    if (!a.pay_on_event_run) continue;
    payOnEvent += 1;
    if (a.date_to < dateFrom || a.date_from > dateTo) continue;
    overlappingOpenWindow += 1;
    const track = resolveEventPayTrack(a);
    if (track == null) {
      managementExcluded += 1;
      continue;
    }
    if (track === "labour") labour.add(a.staff_id);
    else staff.add(a.staff_id);
  }
  for (const id of labour) staff.delete(id);
  return {
    assignmentsTotal: assignments.length,
    payOnEvent,
    overlappingOpenWindow,
    eligibleStaff: labour.size + staff.size,
    labourEligible: labour.size,
    staffEligible: staff.size,
    managementExcluded,
    attendanceDays: extras?.attendanceDays ?? 0,
    staffWithDayRate: extras?.staffWithDayRate ?? 0,
  };
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

export type EventPayDateSpan = { dateFrom: string; dateTo: string };

export type EventPayPeriodWindowSource =
  | "open"
  | "assignments"
  | "attendance"
  | "today";

function ymdOrEmpty(value: string | null | undefined): string {
  const d = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

export function normalizeEventPayDateSpan(
  from: string | null | undefined,
  to: string | null | undefined,
): EventPayDateSpan | null {
  const dateFrom = ymdOrEmpty(from);
  if (!dateFrom) return null;
  let dateTo = ymdOrEmpty(to) || dateFrom;
  if (dateTo < dateFrom) dateTo = dateFrom;
  return { dateFrom, dateTo };
}

export function eventPayDateSpansOverlap(a: EventPayDateSpan, b: EventPayDateSpan): boolean {
  return !(a.dateTo < b.dateFrom || a.dateFrom > b.dateTo);
}

/** True when the event row declares any open/venue/setup/dismantle date. */
export function hasDeclaredEventPayDates(event: {
  event_start?: string | null;
  event_end?: string | null;
  venue_access?: string | null;
  setup_start?: string | null;
  dismantle_end?: string | null;
}): boolean {
  return Boolean(
    ymdOrEmpty(event.event_start) ||
      ymdOrEmpty(event.event_end) ||
      ymdOrEmpty(event.venue_access) ||
      ymdOrEmpty(event.setup_start) ||
      ymdOrEmpty(event.dismantle_end),
  );
}

/**
 * Event pay calendar window = open dates only (event_start → event_end).
 * Falls back to venue/setup/dismantle only when open dates are missing.
 */
export function eventPayOpenWindow(event: {
  event_start?: string | null;
  event_end?: string | null;
  venue_access?: string | null;
  setup_start?: string | null;
  dismantle_end?: string | null;
}): EventPayDateSpan {
  const dateFrom =
    ymdOrEmpty(event.event_start) ||
    ymdOrEmpty(event.venue_access) ||
    ymdOrEmpty(event.setup_start) ||
    new Date().toISOString().slice(0, 10);
  const dateTo =
    ymdOrEmpty(event.event_end) || ymdOrEmpty(event.dismantle_end) || dateFrom;
  return { dateFrom, dateTo: dateTo < dateFrom ? dateFrom : dateTo };
}

/**
 * Resolve the event payroll period window end-to-end:
 * - Prefer declared open dates (event_start → event_end, else venue/setup/dismantle)
 *   when they overlap existing pay-on-event assignments / event attendance, or when
 *   no workforce span exists yet.
 * - If open dates are missing, or they miss all workforce data (common when demo
 *   seed used setup dates while open is later), fall back to assignment then
 *   attendance min–max so Create & generate can find eligible staff.
 */
export function resolveEventPayPeriodWindow(input: {
  event: {
    event_start?: string | null;
    event_end?: string | null;
    venue_access?: string | null;
    setup_start?: string | null;
    dismantle_end?: string | null;
  };
  assignmentSpan?: EventPayDateSpan | null;
  attendanceSpan?: EventPayDateSpan | null;
}): EventPayDateSpan & { source: EventPayPeriodWindowSource; open: EventPayDateSpan } {
  const open = eventPayOpenWindow(input.event);
  const assignmentSpan = input.assignmentSpan
    ? normalizeEventPayDateSpan(input.assignmentSpan.dateFrom, input.assignmentSpan.dateTo)
    : null;
  const attendanceSpan = input.attendanceSpan
    ? normalizeEventPayDateSpan(input.attendanceSpan.dateFrom, input.attendanceSpan.dateTo)
    : null;
  const declared = hasDeclaredEventPayDates(input.event);

  if (declared) {
    const workforceOverlapsOpen =
      (assignmentSpan != null && eventPayDateSpansOverlap(open, assignmentSpan)) ||
      (attendanceSpan != null && eventPayDateSpansOverlap(open, attendanceSpan));
    const noWorkforceSpan = assignmentSpan == null && attendanceSpan == null;
    if (workforceOverlapsOpen || noWorkforceSpan) {
      return { ...open, source: "open", open };
    }
  }

  if (assignmentSpan) {
    return { ...assignmentSpan, source: "assignments", open };
  }
  if (attendanceSpan) {
    return { ...attendanceSpan, source: "attendance", open };
  }
  if (declared) {
    return { ...open, source: "open", open };
  }
  return { ...open, source: "today", open };
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
