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
