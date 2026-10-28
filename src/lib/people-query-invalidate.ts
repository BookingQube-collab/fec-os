import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/** Attendance-HR React Query segment after `["people", "attendance-hr", filters]`. */
function attendanceHrFilters(queryKey: QueryKey): { view?: string } | undefined {
  if (queryKey[0] !== "people" || queryKey[1] !== "attendance-hr") return undefined;
  return queryKey[2] as { view?: string } | undefined;
}

export function isMissedPunchListQuery(queryKey: QueryKey): boolean {
  const view = attendanceHrFilters(queryKey)?.view;
  return typeof view === "string" && view.startsWith("missed-punch");
}

export function isAttendanceFieldQuery(queryKey: QueryKey): boolean {
  const view = attendanceHrFilters(queryKey)?.view;
  return (
    view === "field-context" ||
    view === "tracking" ||
    view === "field-events" ||
    view === "field-settings" ||
    view === "geofences"
  );
}

export function isLeaveListQuery(queryKey: QueryKey): boolean {
  const view = attendanceHrFilters(queryKey)?.view;
  return view === "leave" || view === "my-day-leave-approvals";
}

export function isOtListOrSummaryQuery(queryKey: QueryKey): boolean {
  const view = attendanceHrFilters(queryKey)?.view;
  return view === "ot" || view === "ot-summary";
}

export function isOtSummaryQuery(queryKey: QueryKey): boolean {
  return attendanceHrFilters(queryKey)?.view === "ot-summary";
}

/** Roster grid / import / register keys under `people`. */
export function isRosterQuery(queryKey: QueryKey): boolean {
  if (queryKey[0] !== "people") return false;
  const segment = queryKey[1];
  return (
    segment === "roster-register" ||
    segment === "roster-imports" ||
    segment === "roster-assign-staff"
  );
}

export function invalidateMissedPunchLists(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isMissedPunchListQuery(query.queryKey) });
}

export function invalidateAttendanceBootstrap(qc: QueryClient) {
  void qc.invalidateQueries({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap" }),
  });
  void qc.invalidateQueries({
    queryKey: queryKeys.people.attendanceHr({ view: "bootstrap-staff" }),
  });
}

/** All attendance-hr views (import/roster commit) — not the whole people tree. */
export function invalidateAttendanceHrQueries(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "attendance-hr"] });
}

export function invalidateAttendanceFieldQueries(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isAttendanceFieldQuery(query.queryKey) });
}

export function invalidateLeaveLists(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isLeaveListQuery(query.queryKey) });
  void qc.invalidateQueries({ queryKey: queryKeys.people.hrLeaveBalances() });
  void qc.invalidateQueries({ queryKey: queryKeys.people.hrOverview() });
}

/** OT claim list + monthly summary — skip policy/staff-team refetch on every approve. */
export function invalidateOtLists(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isOtListOrSummaryQuery(query.queryKey) });
}

export function invalidateOtSummaryOnly(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isOtSummaryQuery(query.queryKey) });
}

/** Directory / staff lists that change when a profile row is edited — not the whole people tree. */
export function invalidateStaffDirectoryCaches(
  qc: QueryClient,
  locationId?: string | null,
) {
  void qc.invalidateQueries({ queryKey: queryKeys.people.staffDirectory() });
  void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId ?? null, true) });
  void qc.invalidateQueries({ queryKey: queryKeys.people.staff(locationId ?? null, false) });
  void qc.invalidateQueries({
    queryKey: queryKeys.people.dashboard({ locationId: locationId ?? null }),
  });
}

/** Roster import/register mutations — grid + related attendance views, not people.all. */
export function invalidateRosterCaches(qc: QueryClient) {
  void qc.invalidateQueries({ predicate: (query) => isRosterQuery(query.queryKey) });
  void qc.invalidateQueries({
    predicate: (query) => {
      const view = attendanceHrFilters(query.queryKey)?.view;
      return (
        view === "roster-from-punches-preview" ||
        view === "roster-punch-fill-staff" ||
        view === "daily" ||
        view === "matrix"
      );
    },
  });
  invalidateAttendanceBootstrap(qc);
  invalidateStaffDirectoryCaches(qc);
}

/** Manual workforce refresh — sites + shifts + staff, not every HR module. */
export function invalidateWorkforceCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.sites.all });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "shifts"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "team-today"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "team-reporting"] });
  invalidateStaffDirectoryCaches(qc);
}

/** Admin payroll purge — payroll + OT + air-ticket release surfaces. */
export function invalidatePayrollCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-payroll-periods"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-payroll-period"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-my-payslips"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-staff-payroll-lines"] });
  void qc.invalidateQueries({ queryKey: [...queryKeys.people.all, "hr-air-tickets"] });
  invalidateOtLists(qc);
}

/** Site shift policy save — policy row + bootstrap catalogs that embed hours. */
export function invalidateSiteShiftPolicyCaches(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: queryKeys.people.hrSiteShiftPolicy() });
  invalidateAttendanceBootstrap(qc);
}
