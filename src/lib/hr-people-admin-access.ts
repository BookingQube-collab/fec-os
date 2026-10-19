/**
 * Mia (Reycie Mia Cenizal Memije) — company-wide People & HR admin for that
 * department only. Other HR logins keep the normal hr role matrix.
 *
 * Stable keys: staff id, employee code 88, email mia@fec.qa.
 * Fallback: exact full name, or a "Mia" name when the HR role / HR title is set
 * (avoids matching cleaners like "Uzzal Mia …").
 */

import type { AppRole, Capability } from "@/lib/rbac";
import { canUserDo, resolveRoleCapability } from "@/lib/rbac";
import type { CapabilityGrantMap } from "@/lib/rbac-grants";

/** Reycie Mia Cenizal Memije, employee code 88, HR Generalist. */
export const MIA_HR_STAFF_ID = "d2effffa-7fa3-4871-83b9-f6de007b5ff7";
export const MIA_HR_EMPLOYEE_CODE = "88";
export const MIA_HR_EMAIL = "mia@fec.qa";
export const MIA_HR_FULL_NAME = "Reycie Mia Cenizal Memije";

export type HrPeopleAdminIdentity = {
  staffId?: string | null;
  employeeCode?: string | null;
  email?: string | null;
  fullName?: string | null;
  displayName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
};

/** Capabilities CEO has on People that plain HR does not. Not admin.* / arcade / revenue. */
export const MIA_PEOPLE_ADMIN_EXTRA_CAPABILITIES = [
  "people.org_chart",
  "events.view",
  "inventory.view",
  "leaderboard.view",
] as const satisfies readonly Capability[];

const MIA_EXTRA = new Set<string>(MIA_PEOPLE_ADMIN_EXTRA_CAPABILITIES);

function normCode(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isHrJobContext(identity: HrPeopleAdminIdentity): boolean {
  const title = normName(identity.jobTitle);
  const dept = normName(identity.department);
  if (/\bhr\b/.test(title) || title.includes("human resource")) return true;
  if (/\bhr\b/.test(dept) || dept.includes("human resource") || dept.includes("people")) return true;
  return false;
}

/**
 * True when this person is Mia by stable id / code / email / full name,
 * or a short "Mia" name match only when the job is clearly HR.
 */
export function isMiaHrIdentity(identity: HrPeopleAdminIdentity | null | undefined): boolean {
  if (!identity) return false;
  if ((identity.staffId ?? "").trim() === MIA_HR_STAFF_ID) return true;
  if (normCode(identity.employeeCode) === MIA_HR_EMPLOYEE_CODE) return true;
  if (normEmail(identity.email) === MIA_HR_EMAIL) return true;

  const name = normName(identity.fullName ?? identity.displayName);
  if (!name) return false;
  if (name === normName(MIA_HR_FULL_NAME)) return true;
  if (name.includes("reycie") && name.includes("mia")) return true;
  // Single-token / short "Mia …" only with an HR title or department.
  if (/\bmia\b/.test(name) && isHrJobContext(identity)) return true;
  return false;
}

/**
 * Mia with the hr role: People & HR modules at Adil/CEO depth for that area.
 * Does not elevate other HR users or grant Administration / arcade / revenue.
 */
export function hasMiaHrPeopleAdminAccess(
  roles: readonly string[],
  identity?: HrPeopleAdminIdentity | null,
): boolean {
  if (!roles.includes("hr")) return false;
  return isMiaHrIdentity(identity);
}

/** Org-chart edit: CEO/COO role level, or Mia with hr. */
export function canEditCompanyOrgChart(input: {
  maxRoleLevel: number;
  roles?: readonly string[];
  identity?: HrPeopleAdminIdentity | null;
}): boolean {
  if (input.maxRoleLevel >= 95) return true;
  return hasMiaHrPeopleAdminAccess(input.roles ?? [], input.identity);
}

export function miaPeopleAdminGrantsCapability(
  roles: readonly AppRole[],
  capability: Capability,
  identity?: HrPeopleAdminIdentity | null,
  grants?: CapabilityGrantMap | null,
): boolean {
  if (!hasMiaHrPeopleAdminAccess(roles, identity)) return false;
  if (!MIA_EXTRA.has(capability)) return false;
  // Prefer CEO matrix for the extra People caps so Mia matches Adil on those links.
  if (resolveRoleCapability("ceo", capability, grants)) return true;
  return canUserDo(["ceo"], capability, grants);
}
