/**
 * Air-ticket entitlement rules (Phase 7). Pure — no Supabase.
 * Eligibility from staff.hire_date + hr_policy_settings air_ticket section.
 */

export const HR_AIR_TICKET_ENTITLEMENT_STATUSES = [
  "open",
  "eligible",
  "issued",
  "expired",
  "cancelled",
  "carried_forward",
] as const;
export type HrAirTicketEntitlementStatus = (typeof HR_AIR_TICKET_ENTITLEMENT_STATUSES)[number];

export const HR_AIR_TICKET_ISSUE_STATUSES = [
  "draft",
  "approved",
  "issued",
  "paid",
  "cancelled",
  "rejected",
] as const;
export type HrAirTicketIssueStatus = (typeof HR_AIR_TICKET_ISSUE_STATUSES)[number];

export const HR_AIR_TICKET_PAYROLL_STATUSES = ["unpaid", "pending", "paid"] as const;
export type HrAirTicketPayrollStatus = (typeof HR_AIR_TICKET_PAYROLL_STATUSES)[number];

export type AirTicketPolicy = {
  cycleMonths: number;
  fromHireDate: boolean;
  familyEligibleDefault: boolean;
  carryForwardEnabled: boolean;
  carryForwardMonths: number;
  upcomingHorizonDays: number;
};

export function airTicketPolicyFromSection(section: Record<string, unknown>): AirTicketPolicy {
  const num = (v: unknown, fb: number) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
    return fb;
  };
  const bool = (v: unknown, fb: boolean) => {
    if (typeof v === "boolean") return v;
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    return fb;
  };
  return {
    cycleMonths: Math.max(1, Math.floor(num(section.cycle_months, 12))),
    fromHireDate: bool(section.from_hire_date, true),
    familyEligibleDefault: bool(section.family_eligible_default, false),
    carryForwardEnabled: bool(section.carry_forward_enabled, true),
    carryForwardMonths: Math.max(0, Math.floor(num(section.carry_forward_months, 3))),
    upcomingHorizonDays: Math.max(0, Math.floor(num(section.upcoming_horizon_days, 60))),
  };
}

/** Calendar-month add with day clamp (Qatar date strings YYYY-MM-DD). */
export function addCalendarMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Cycle n (1-based): eligibility on hire + n*cycleMonths when fromHireDate.
 * Without fromHireDate: calendar-year cycles starting Jan 1 of hire year.
 */
export function eligibilityOnForCycle(
  hireDate: string,
  cycleMonths: number,
  cycleIndex: number,
  fromHireDate = true,
): string {
  const hire = hireDate.slice(0, 10);
  const n = Math.max(1, Math.floor(cycleIndex));
  if (fromHireDate) return addCalendarMonths(hire, n * cycleMonths);
  const hireYear = Number(hire.slice(0, 4));
  return `${hireYear + n - 1}-01-01`;
}

export function cycleBoundsForIndex(
  hireDate: string,
  cycleMonths: number,
  cycleIndex: number,
  fromHireDate = true,
): { cycleStart: string; cycleEnd: string; eligibilityOn: string } {
  const hire = hireDate.slice(0, 10);
  const n = Math.max(1, Math.floor(cycleIndex));
  const eligibilityOn = eligibilityOnForCycle(hire, cycleMonths, n, fromHireDate);
  const cycleStart =
    n === 1
      ? hire
      : fromHireDate
        ? addCalendarMonths(hire, (n - 1) * cycleMonths)
        : `${Number(hire.slice(0, 4)) + n - 2}-01-01`;
  const cycleEnd = addCalendarDays(eligibilityOn, -1);
  return { cycleStart, cycleEnd, eligibilityOn };
}

/**
 * Resolve the open cycle for asOf: the largest n whose eligibility window still applies,
 * or the next upcoming cycle if none is overdue/open.
 */
export function resolveCycleIndexForDate(
  hireDate: string,
  cycleMonths: number,
  asOfDate: string,
  fromHireDate = true,
): number {
  const hire = hireDate.slice(0, 10);
  const asOf = asOfDate.slice(0, 10);
  if (asOf < hire) return 1;
  let n = 1;
  // Advance while the next cycle's eligibility has already arrived
  while (true) {
    const nextElig = eligibilityOnForCycle(hire, cycleMonths, n + 1, fromHireDate);
    if (asOf >= nextElig) {
      n += 1;
      continue;
    }
    break;
  }
  return n;
}

export type ComputedEntitlementDates = {
  cycleIndex: number;
  cycleStart: string;
  cycleEnd: string;
  eligibilityOn: string;
  expiryOn: string | null;
  status: Extract<HrAirTicketEntitlementStatus, "open" | "eligible">;
};

/** AT#8 air-ticket: eligibility from hire_date + policy (change policy without code). */
export function computeEntitlementDatesFromPolicy(input: {
  hireDate: string | null | undefined;
  asOfDate: string;
  policy: AirTicketPolicy;
  cycleIndex?: number;
}): ComputedEntitlementDates | null {
  const hire = input.hireDate?.slice(0, 10) ?? null;
  if (!hire) return null;
  const asOf = input.asOfDate.slice(0, 10);
  if (asOf < hire) return null;

  const cycleIndex =
    input.cycleIndex ??
    resolveCycleIndexForDate(hire, input.policy.cycleMonths, asOf, input.policy.fromHireDate);
  const bounds = cycleBoundsForIndex(
    hire,
    input.policy.cycleMonths,
    cycleIndex,
    input.policy.fromHireDate,
  );
  const expiryOn =
    input.policy.carryForwardEnabled && input.policy.carryForwardMonths > 0
      ? addCalendarMonths(bounds.eligibilityOn, input.policy.carryForwardMonths)
      : bounds.eligibilityOn;
  const status = bounds.eligibilityOn <= asOf ? "eligible" : "open";
  return { cycleIndex, ...bounds, expiryOn, status };
}

/** Open/eligible entitlement past eligibility_on (Qatar today). */
export function isAirTicketOverdue(input: {
  eligibilityOn: string;
  asOfDate: string;
  status: string;
  expiryOn?: string | null;
}): boolean {
  if (input.status !== "open" && input.status !== "eligible" && input.status !== "carried_forward") {
    return false;
  }
  const asOf = input.asOfDate.slice(0, 10);
  const elig = input.eligibilityOn.slice(0, 10);
  if (elig >= asOf) return false;
  if (input.expiryOn && input.expiryOn.slice(0, 10) < asOf) return false;
  return true;
}

export function isAirTicketUpcoming(input: {
  eligibilityOn: string;
  asOfDate: string;
  horizonDays: number;
  status: string;
}): boolean {
  if (input.status !== "open" && input.status !== "eligible") return false;
  const asOf = input.asOfDate.slice(0, 10);
  const elig = input.eligibilityOn.slice(0, 10);
  if (elig < asOf) return false;
  const horizon = addCalendarDays(asOf, Math.max(0, input.horizonDays));
  return elig <= horizon;
}

export function canMarkAirTicketPaid(status: HrAirTicketIssueStatus): boolean {
  return status === "issued" || status === "approved";
}

export function assertCanMarkAirTicketPaid(status: HrAirTicketIssueStatus): void {
  if (!canMarkAirTicketPaid(status)) {
    throw new Error(
      status === "paid"
        ? "Air ticket is already paid."
        : "Air ticket must be issued (or approved) before payroll paid.",
    );
  }
}

/** Whole days from `from` to `to` (YYYY-MM-DD), Qatar calendar dates. */
export function airTicketDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export const AIR_TICKET_SUGGESTION_KINDS = ["due", "approaching"] as const;
export type AirTicketSuggestionKind = (typeof AIR_TICKET_SUGGESTION_KINDS)[number];

export type AirTicketSuggestionStaff = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  hireDate: string;
  employmentType: string | null;
};

export type AirTicketExistingCycle = {
  staffId: string;
  eligibilityOn: string;
  cycleStart: string;
  status: string;
};

export type AirTicketSuggestion = {
  staffId: string;
  staffName: string;
  employeeCode: string | null;
  hireDate: string;
  cycleIndex: number;
  cycleStart: string;
  cycleEnd: string;
  eligibilityOn: string;
  status: Extract<HrAirTicketEntitlementStatus, "open" | "eligible">;
  kind: AirTicketSuggestionKind;
  daysUntilEligibility: number;
  yearsOfService: number;
  reason: string;
};

const BLOCKING_ENTITLEMENT_STATUSES = new Set([
  "open",
  "eligible",
  "issued",
  "carried_forward",
]);

function hasOpenCycleEntitlement(
  existing: AirTicketExistingCycle[],
  staffId: string,
  eligibilityOn: string,
  cycleStart: string,
): boolean {
  return existing.some(
    (row) =>
      row.staffId === staffId &&
      BLOCKING_ENTITLEMENT_STATUSES.has(row.status) &&
      (row.eligibilityOn.slice(0, 10) === eligibilityOn ||
        row.cycleStart.slice(0, 10) === cycleStart),
  );
}

/**
 * Permanent staff whose hire-date cycle is due or within the upcoming horizon,
 * and who do not already have an open/issued entitlement for that cycle.
 */
export function buildAirTicketSuggestions(input: {
  staff: AirTicketSuggestionStaff[];
  existing: AirTicketExistingCycle[];
  policy: AirTicketPolicy;
  asOfDate: string;
}): AirTicketSuggestion[] {
  const asOf = input.asOfDate.slice(0, 10);
  const out: AirTicketSuggestion[] = [];

  for (const person of input.staff) {
    if ((person.employmentType ?? "").toLowerCase() !== "permanent") continue;
    const hire = person.hireDate?.slice(0, 10);
    if (!hire || asOf < hire) continue;

    const computed = computeEntitlementDatesFromPolicy({
      hireDate: hire,
      asOfDate: asOf,
      policy: input.policy,
    });
    if (!computed) continue;

    if (
      hasOpenCycleEntitlement(
        input.existing,
        person.id,
        computed.eligibilityOn,
        computed.cycleStart,
      )
    ) {
      continue;
    }

    const daysUntil = airTicketDaysBetween(asOf, computed.eligibilityOn);
    let kind: AirTicketSuggestionKind | null = null;
    if (daysUntil <= 0) {
      kind = "due";
    } else if (daysUntil <= input.policy.upcomingHorizonDays) {
      kind = "approaching";
    }
    if (!kind) continue;

    const yearsOfService = Math.max(
      0,
      Math.floor(airTicketDaysBetween(hire, asOf) / 365),
    );
    const reason =
      kind === "due"
        ? daysUntil === 0
          ? `Hire-date anniversary today — cycle ${computed.cycleIndex} ticket is due.`
          : `Finished service year ${computed.cycleIndex} on ${computed.eligibilityOn} (${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} ago).`
        : `Hire anniversary in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${computed.eligibilityOn}).`;

    out.push({
      staffId: person.id,
      staffName: person.fullName,
      employeeCode: person.employeeCode,
      hireDate: hire,
      cycleIndex: computed.cycleIndex,
      cycleStart: computed.cycleStart,
      cycleEnd: computed.cycleEnd,
      eligibilityOn: computed.eligibilityOn,
      status: computed.status,
      kind,
      daysUntilEligibility: daysUntil,
      yearsOfService,
      reason,
    });
  }

  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "due" ? -1 : 1;
    if (a.eligibilityOn !== b.eligibilityOn) {
      return a.eligibilityOn < b.eligibilityOn ? -1 : 1;
    }
    return a.staffName.localeCompare(b.staffName);
  });
}

/** Deterministic panel blurb when AI is offline. */
export function buildFallbackAirTicketAssistSummary(suggestions: AirTicketSuggestion[]): string {
  const due = suggestions.filter((s) => s.kind === "due").length;
  const approaching = suggestions.filter((s) => s.kind === "approaching").length;
  if (!due && !approaching) {
    return "No permanent staff are due or approaching an air-ticket anniversary under current policy.";
  }
  const parts: string[] = [];
  if (due) {
    parts.push(
      `${due} permanent staff member${due === 1 ? " has" : "s have"} finished a service year and should apply for an air ticket`,
    );
  }
  if (approaching) {
    parts.push(
      `${approaching} more anniversary${approaching === 1 ? " is" : "ies are"} within the upcoming eligibility window`,
    );
  }
  return `${parts.join("; ")}. Create entitlements from the suggestions below, then issue tickets when booked.`;
}
