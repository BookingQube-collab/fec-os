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
  "contract_finished",
  "released",
  "serving_notice",
  "joker",
] as const;

/** Stored staff.status for employment-type jokers who are not active staff. */
export const JOKER_STAFF_STATUS = "joker";

/**
 * Stored staff.status when a temporary or secondment contract has ended
 * (for example the site closed). Distinct from resigned and terminated.
 * The person row is kept.
 */
export const CONTRACT_FINISHED_STAFF_STATUS = "contract_finished";

/**
 * PostgREST `.or()` fragment: drop employment_type joker, keep null types.
 * Pair with `.eq("status", "active")` on active-staff pickers.
 */
export const STAFF_NOT_JOKER_EMPLOYMENT_OR =
  "employment_type.is.null,employment_type.not.ilike.joker";

export type StaffDirectoryStatusValue = (typeof STAFF_DIRECTORY_STATUSES)[number];

/**
 * Statuses an admin can set for one person from People or the staff profile.
 * Serving notice is included so it can be set, changed, or cleared.
 */
export const STAFF_NOTICE_EDIT_STATUSES = [
  "active",
  "on_leave",
  "serving_notice",
  "resigned",
  "terminated",
  "contract_finished",
  "joker",
] as const;

export type StaffNoticeEditStatus = (typeof STAFF_NOTICE_EDIT_STATUSES)[number];

/** Map a stored status onto a value `updateStaff` accepts. Unknown text returns null. */
export function asEditableStaffStatus(status: string | null | undefined): StaffDirectoryStatusValue | null {
  const key = normalizeStaffStatus(status);
  return STAFF_DIRECTORY_STATUSES.find((value) => value === key) ?? null;
}

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

/** Temporary or secondment contract ended. Not resigned and not terminated. */
export function isContractFinishedStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === CONTRACT_FINISHED_STAFF_STATUS;
}

export function isRemoteStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === "remote";
}

export function isSecondmentStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === "secondment";
}

/** Employment type stored on staff.employment_type (case-insensitive). */
export function isJokerEmploymentType(employmentType: string | null | undefined): boolean {
  return (employmentType ?? "").trim().toLowerCase() === "joker";
}

export function isJokerStaffStatus(status: string | null | undefined): boolean {
  return normalizeStaffStatus(status) === JOKER_STAFF_STATUS;
}

export function isJokerStaff(staff: {
  status?: string | null;
  employment_type?: string | null;
  employmentType?: string | null;
}): boolean {
  return (
    isJokerEmploymentType(staff.employment_type ?? staff.employmentType) ||
    isJokerStaffStatus(staff.status)
  );
}

/**
 * Active headcount. Jokers are not active staff, including a stale status=active row.
 */
export function countsAsActiveStaff(
  status: string | null | undefined,
  employmentType?: string | null,
): boolean {
  if (isJokerEmploymentType(employmentType) || isJokerStaffStatus(status)) return false;
  return isActiveStaffStatus(status);
}

/**
 * Joker employment cannot stay on an active status. Leaving joker employment
 * clears a joker status back to active. Leave / exit statuses are kept.
 */
export function reconcileJokerStaffStatus(
  employmentType: string | null | undefined,
  status: string | null | undefined,
): string {
  if (isJokerEmploymentType(employmentType)) {
    if (status == null || status.trim() === "" || isActiveStaffStatus(status)) return JOKER_STAFF_STATUS;
    return status.trim();
  }
  if (isJokerStaffStatus(status)) return "active";
  const trimmed = (status ?? "").trim();
  return trimmed || "active";
}

/** Active roster for payroll: active cohort, on leave, serving notice, or blank. Excludes exited. */
export function isActiveRosterStaff(status: string | null | undefined): boolean {
  return (
    isActiveStaffStatus(status) ||
    isOnLeaveStaffStatus(status) ||
    isServingNoticeStaffStatus(status)
  );
}

/**
 * PostgREST `.or()` aligned with `isActiveRosterStaff`.
 * `status = active` alone dropped secondment and remote people the directory still lists.
 * Terminated, resigned, contract finished, released, inactive, and joker are not in this list.
 * Pair with `STAFF_NOT_JOKER_EMPLOYMENT_OR` so an active joker employment type stays hidden.
 */
export const ACTIVE_ROSTER_STAFF_STATUS_OR = [
  "status.is.null",
  "status.eq.",
  "status.in.(active,probation,secondment,remote,on_leave,leave,vacation,sick_leave,unpaid_leave,serving_notice)",
  'status.eq."serving-notice"',
].join(",");

/** Mapping dropdown: current roster, not exited staff and not jokers. */
export function isAttendanceMappingStaff(staff: {
  status?: string | null;
  employment_type?: string | null;
  employmentType?: string | null;
}): boolean {
  if (isJokerStaff(staff)) return false;
  return isActiveRosterStaff(staff.status);
}

export function normalizeDirectoryStatus(status: string | null | undefined): string {
  return normalizeStaffStatus(status);
}
