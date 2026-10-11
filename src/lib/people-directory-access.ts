import {
  isActiveStaffStatus,
  isJokerEmploymentType,
  isOnLeaveStaffStatus,
  isResignedStaffStatus,
  isServingNoticeStaffStatus,
  isTerminatedStaffStatus,
} from "@/lib/staff-status";
import { canUserDo, isRosterAmendJobTitle, type AppRole } from "@/lib/rbac";

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
 * A manager or supervisor job title without that capability sees direct reports only.
 */
export function peopleDirectoryScope(
  roles: readonly string[],
  jobTitle?: string | null,
): PeopleDirectoryScope | null {
  if (hasCompanyPeopleDirectory(roles)) return "company";
  if (isRosterAmendJobTitle(jobTitle)) return "team";
  return null;
}

export function canOpenPeopleDirectory(roles: readonly string[], jobTitle?: string | null): boolean {
  return peopleDirectoryScope(roles, jobTitle) != null;
}

/**
 * Salary stays with people.view_salary for HR and leadership.
 * Duty managers, tech supervisors, branch GMs, and job-title managers do not receive figures.
 */
export function peopleDirectoryShowsSalary(roles: readonly string[], jobTitle?: string | null): boolean {
  const list = roles as AppRole[];
  if (!canUserDo(list, "people.view_salary")) return false;
  if (list.some((role) => SALARY_LEADERSHIP.includes(role))) return true;
  if (list.some((role) => SALARY_HIDDEN_LOGINS.includes(role))) return false;
  if (isRosterAmendJobTitle(jobTitle)) return false;
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
 * Resigned, terminated, deleted, and jokers stay out.
 */
export function isPeopleDirectoryTeamRow(input: {
  status: string | null | undefined;
  employmentType: string | null | undefined;
  deletedAt?: string | null;
}): boolean {
  if (input.deletedAt) return false;
  if (isJokerEmploymentType(input.employmentType)) return false;
  const status = (input.status ?? "").trim().toLowerCase();
  if (status === "joker") return false;
  if (isResignedStaffStatus(input.status) || isTerminatedStaffStatus(input.status)) return false;
  return (
    isActiveStaffStatus(input.status) ||
    isOnLeaveStaffStatus(input.status) ||
    isServingNoticeStaffStatus(input.status)
  );
}
