/**
 * Event workforce identity for People modules.
 *
 * Monthly roster / attendance are Ops, Maintenance, F&B, and Head Office only.
 * Event hires belong in Event Attendance / event workforce — never mixed into
 * FEC monthly grids, even when OrgDepartmentsFilter is unrestricted ("All").
 *
 * Detection prefers durable markers already used by hire codes + demo seed:
 * - employee_code `EVT-*` (event-hire / demo pool)
 * - department "Event demo"
 * - home location on an event-only monthly-roster host (Place Vendôme)
 *
 * Loaned FEC venue staff keep their venue codes and stay on monthly modules.
 */

import { isEventOnlyMonthlyRosterLocationCode } from "@/lib/attendance-hr/roster-location-coverage";
import { isEventHireEmployeeCode } from "@/lib/events/event-hire-employee-code";
import { EVENT_WORKFORCE_DEMO_DEPARTMENT } from "@/lib/events/event-workforce-demo";
import { normalizeOrgDepartmentKey } from "@/lib/exclude-org-departments";

const EVENT_DEMO_DEPARTMENT_KEY = normalizeOrgDepartmentKey(EVENT_WORKFORCE_DEMO_DEPARTMENT);

export function isEventWorkforceDemoDepartment(department: string | null | undefined): boolean {
  const key = normalizeOrgDepartmentKey(department);
  return Boolean(key) && key === EVENT_DEMO_DEPARTMENT_KEY;
}

export type EventWorkforceStaffLike = {
  employee_code?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  /** Staff home location code when known (not a single attendance day site). */
  location_code?: string | null;
  locationCode?: string | null;
};

/**
 * True when this person is event workforce and must stay out of monthly
 * roster / attendance / related KPIs. Event Attendance must not use this gate.
 */
export function isEventWorkforceStaff(staff: EventWorkforceStaffLike): boolean {
  const code = staff.employee_code ?? staff.employeeCode;
  if (isEventHireEmployeeCode(code)) return true;
  if (isEventWorkforceDemoDepartment(staff.department)) return true;
  const homeLocation = staff.location_code ?? staff.locationCode;
  if (isEventOnlyMonthlyRosterLocationCode(homeLocation)) return true;
  return false;
}

/** Drop event workforce rows from monthly roster / attendance collections. */
export function excludeEventWorkforceFromMonthlyModules<T>(
  rows: readonly T[],
  pick: (row: T) => EventWorkforceStaffLike,
): T[] {
  return rows.filter((row) => !isEventWorkforceStaff(pick(row)));
}
