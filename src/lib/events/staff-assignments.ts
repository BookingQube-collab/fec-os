/** Event workforce Phase 2 — assignment validation & readiness (pure). */

export const EVENT_STAFF_ASSIGNMENT_TYPES = ["labour", "loaned", "event_hire"] as const;
export type EventStaffAssignmentType = (typeof EVENT_STAFF_ASSIGNMENT_TYPES)[number];

export const EVENT_CREW_READINESS_CODE = "event_crew";

export type EventStaffAssignmentLike = {
  id?: string;
  staff_id: string;
  assignment_type: EventStaffAssignmentType | string;
  date_from: string;
  date_to: string;
};

export function isEventStaffAssignmentType(value: unknown): value is EventStaffAssignmentType {
  return (
    typeof value === "string" &&
    (EVENT_STAFF_ASSIGNMENT_TYPES as readonly string[]).includes(value)
  );
}

/** Default: all types include on event pay run until Phase 4 refinements. */
export function defaultPayOnEventRun(assignmentType: EventStaffAssignmentType): boolean {
  switch (assignmentType) {
    case "labour":
    case "event_hire":
    case "loaned":
      return true;
    default:
      return true;
  }
}

export function assignmentTypeLabel(type: EventStaffAssignmentType | string): string {
  switch (type) {
    case "labour":
      return "Labour";
    case "loaned":
      return "Loaned";
    case "event_hire":
      return "Event hire";
    default:
      return String(type);
  }
}

/** Inclusive date ranges overlap when they share at least one day. */
export function assignmentRangesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  if (!aFrom || !aTo || !bFrom || !bTo) return false;
  if (aTo < aFrom || bTo < bFrom) return false;
  return aFrom <= bTo && bFrom <= aTo;
}

export function validateAssignmentDates(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom || !dateTo) return "Start and end dates are required";
  if (dateTo < dateFrom) return "End date must be on or after start";
  return null;
}

/**
 * Same staff cannot have overlapping date ranges on the same event.
 * `ignoreId` skips the row being updated.
 */
export function findOverlappingAssignment(
  existing: EventStaffAssignmentLike[],
  candidate: EventStaffAssignmentLike,
  ignoreId?: string | null,
): EventStaffAssignmentLike | null {
  for (const row of existing) {
    if (ignoreId && row.id === ignoreId) continue;
    if (row.staff_id !== candidate.staff_id) continue;
    if (
      assignmentRangesOverlap(row.date_from, row.date_to, candidate.date_from, candidate.date_to)
    ) {
      return row;
    }
  }
  return null;
}

/** Readiness "Event crew" is met when at least one assignment exists. */
export function eventCrewReadinessMet(assignments: Array<{ id?: string }>): boolean {
  return assignments.length > 0;
}

/**
 * Suggested employment for a new event-only hire.
 * Temporary + active so People directory still lists them (clearly as temporary).
 */
export function eventHireEmploymentDefaults(dateFrom: string, dateTo: string) {
  return {
    employmentType: "temporary" as const,
    status: "active" as const,
    hireDate: dateFrom,
    contractStart: dateFrom,
    contractEnd: dateTo,
    jobTitle: "Event hire",
  };
}

/** Labour pool hint: joker employment or joker status. */
export function looksLikeLabourPoolStaff(staff: {
  employment_type?: string | null;
  status?: string | null;
}): boolean {
  const emp = (staff.employment_type ?? "").trim().toLowerCase();
  const status = (staff.status ?? "").trim().toLowerCase();
  return emp === "joker" || status === "joker";
}

export const EVENT_ASSIGNMENT_STATUSES = ["active", "closed"] as const;
export type EventAssignmentStatus = (typeof EVENT_ASSIGNMENT_STATUSES)[number];

export function isEventAssignmentClosed(row: { status?: string | null }): boolean {
  return String(row.status ?? "active").toLowerCase() === "closed";
}

/** Event-only hires are parked as contract_finished after close (not terminated). */
export function eventHireParkStatus(): "contract_finished" {
  return "contract_finished";
}

export function closeAssignmentStampNote(closedOn: string, periodId?: string | null): string {
  const periodBit = periodId ? ` period ${periodId.slice(0, 8)}` : "";
  return `Closed via event workflow${periodBit} on ${closedOn}`;
}
