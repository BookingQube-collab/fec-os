/**
 * People Directory employment status helpers (expanded E3 set).
 */

function normalizeStaffStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export const STAFF_DIRECTORY_STATUSES = [
  "active",
  "probation",
  "secondment",
  "remote",
  "vacation",
  "sick_leave",
  "unpaid_leave",
  "on_leave",
  "resigned",
  "terminated",
  "released",
  "serving_notice",
] as const;

export type StaffDirectoryStatusValue = (typeof STAFF_DIRECTORY_STATUSES)[number];

/** Blank / null roster status defaults to active — same as the Employee Roster import. */
export function isActiveStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "" || s === "active" || s === "probation" || s === "secondment" || s === "remote";
}

/** Serving contractual / agreed notice after approved resignation. */
export function isServingNoticeStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "serving_notice" || s === "serving-notice";
}

export function isOnLeaveStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return (
    s === "on_leave" ||
    s === "leave" ||
    s === "vacation" ||
    s === "sick_leave" ||
    s === "unpaid_leave"
  );
}

export function isResignedStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === "resigned";
}

export function isTerminatedStaffStatus(status: string | null | undefined): boolean {
  const s = normalizeStaffStatus(status);
  return s === "terminated" || s === "inactive" || s === "released";
}

export function isRemoteStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === "remote";
}

export function isSecondmentStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === "secondment";
}

/** Active roster for payroll: active cohort, on leave, serving notice, or blank. Excludes exited. */
export function isActiveRosterStaff(status: string | null | undefined): boolean {
  return (
    isActiveStaffStatus(status) ||
    isOnLeaveStaffStatus(status) ||
    isServingNoticeStaffStatus(status)
  );
}

export function normalizeDirectoryStatus(status: string | null | undefined): string {
  return normalizeStaffStatus(status);
}
