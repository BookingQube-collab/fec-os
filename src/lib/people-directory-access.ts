import {
  countsAsActiveStaff,
  isActiveStaffStatus,
  isContractFinishedStaffStatus,
  isJokerStaffStatus,
  isOnLeaveStaffStatus,
  isResignedStaffStatus,
  isServingNoticeStaffStatus,
  isTerminatedStaffStatus,
} from "@/lib/staff-status";
import { canUploadOwnRosterWithoutReports } from "@/lib/reporting-manager-locations";
import { canUserDo, type AppRole } from "@/lib/rbac";

/** Roles that already open People and keep salary when they have people.view_salary. */
const SALARY_LEADERSHIP: readonly AppRole[] = ["ceo", "coo", "cfo", "hr", "regional_ops"];

const SALARY_HIDDEN_LOGINS: readonly AppRole[] = ["duty_manager", "tech_supervisor", "branch_gm"];

export type PeopleDirectoryScope = "company" | "team";

/**
 * Company directory from the code role list or a Roles-page grant.
 * A saved deny does not take people.view_roster away from roles that already have it.
 */
export function hasCompanyPeopleDirectory(roles: readonly string[]): boolean {
  const list = roles as AppRole[];
  return canUserDo(list, "people.view_roster", null) || canUserDo(list, "people.view_roster");
}

/**
 * Company roster viewers keep the whole directory.
 * A manager or supervisor job title, or a venue-supervisor staff role, without that capability sees direct reports only.
 */
export function peopleDirectoryScope(
  roles: readonly string[],
  jobTitle?: string | null,
  staffRole?: string | null,
): PeopleDirectoryScope | null {
  if (hasCompanyPeopleDirectory(roles)) return "company";
  if (canUploadOwnRosterWithoutReports(jobTitle, staffRole)) return "team";
  return null;
}

export function canOpenPeopleDirectory(
  roles: readonly string[],
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  return peopleDirectoryScope(roles, jobTitle, staffRole) != null;
}

/**
 * Salary stays with people.view_salary for HR and leadership.
 * Duty managers, tech supervisors, branch GMs, and job-title managers do not receive figures.
 */
export function peopleDirectoryShowsSalary(
  roles: readonly string[],
  jobTitle?: string | null,
  staffRole?: string | null,
): boolean {
  const list = roles as AppRole[];
  if (!canUserDo(list, "people.view_salary")) return false;
  if (list.some((role) => SALARY_LEADERSHIP.includes(role))) return true;
  if (list.some((role) => SALARY_HIDDEN_LOGINS.includes(role))) return false;
  if (canUploadOwnRosterWithoutReports(jobTitle, staffRole)) return false;
  return true;
}

/** Drop pay fields so a manager payload cannot carry a figure. */
export function omitPeopleDirectorySalary<
  T extends { monthly_salary_qar?: number | null; daily_rate_qar?: number | null },
>(row: T): Omit<T, "monthly_salary_qar" | "daily_rate_qar"> {
  const { monthly_salary_qar: _monthly, daily_rate_qar: _daily, ...rest } = row;
  return rest;
}

/**
 * Direct-report rows a job-title manager may see.
 * Active (including probation, secondment, remote), on leave, and serving notice.
 * Resigned, terminated, contract finished, deleted, and status=joker stay out.
 * Employment type joker does not hide an otherwise listable person.
 */
export function isPeopleDirectoryTeamRow(input: {
  status: string | null | undefined;
  employmentType: string | null | undefined;
  deletedAt?: string | null;
}): boolean {
  if (input.deletedAt) return false;
  if (isJokerStaffStatus(input.status)) return false;
  if (
    isResignedStaffStatus(input.status) ||
    isTerminatedStaffStatus(input.status) ||
    isContractFinishedStaffStatus(input.status)
  ) {
    return false;
  }
  return (
    isActiveStaffStatus(input.status) ||
    isOnLeaveStaffStatus(input.status) ||
    isServingNoticeStaffStatus(input.status)
  );
}

/**
 * Default company / admin people list (the Active status filter).
 * Active staff stay, and people serving notice stay so an admin can open
 * one person and change that status. Resigned, terminated, contract finished,
 * and status=joker stay out. Employment type joker stays listable when status
 * is active or serving notice. Team views use `isPeopleDirectoryTeamRow`.
 */
export function isAdminPeopleDirectoryRow(input: {
  status: string | null | undefined;
  employmentType?: string | null;
}): boolean {
  if (isJokerStaffStatus(input.status)) return false;
  return countsAsActiveStaff(input.status, input.employmentType) || isServingNoticeStaffStatus(input.status);
}