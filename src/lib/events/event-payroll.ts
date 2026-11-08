/** Phase 4 — event payroll helpers (pure). */

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
 */
export const EVENT_PAY_POLICY = {
  hoCutoff: "fec_28_27",
  hoAttendance: "shift_punch_plus_site_hours",
  venue: "existing_location_or_add_site",
  punches: "host_site_devices_or_event_device_set",
  loanedPayOnEventExcludedFromMonthly: true,
  eventOnlyAndJokerOnEventRun: true,
} as const;

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
