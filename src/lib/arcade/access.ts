/**
 * Who may open Arcade Technical (`/arcade`, capability arcade.view).
 * Head of Operations maps onto the existing super-admin threshold:
 * role level >= 80 (CEO, COO, CFO, regional ops). Those logins are unchanged.
 * Keep the SQL helpers in supabase/migrations/20261011190000_arcade_technical_access.sql aligned.
 */

import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import {
  canUserDo,
  resolveRoleCapability,
  ROLE_LEVELS,
  type AppRole,
  type Capability,
} from "@/lib/rbac";
import type { CapabilityGrantMap } from "@/lib/rbac-grants";

/** Exec / regional seats. Empty location lists still see every branch. */
export const SUPER_ADMIN_MIN_LEVEL = 80;

export type ArcadeActor = {
  roles?: readonly AppRole[];
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
  /** Home branch and extra work sites. Not a company-wide grant. */
  locationIds?: readonly (string | null | undefined)[];
};

const WORD = (word: string) => new RegExp(`(?:^|[^a-z])${word}(?=$|[^a-z])`, "i");
const MANAGER_WORD = WORD("manager");
const SUPERVISOR_WORD = WORD("supervisor");
const FEC_TECHNICIAN_TITLE = /(?:^|[^a-z])(?:fec(?:\s+arcade)?|arcade)\s+technician(?=$|[^a-z])/i;
const FOOD_BEVERAGE = /f\s*&\s*b|f\s+and\s+b|\bfnb\b|food\s*(?:&|and)\s*beverage/i;

export function isFoodBeverageText(value: string | null | undefined): boolean {
  return FOOD_BEVERAGE.test(value ?? "");
}

export function isFnbManager(jobTitle?: string | null, department?: string | null): boolean {
  const title = jobTitle ?? "";
  const dept = department ?? "";
  if (!MANAGER_WORD.test(title) && !MANAGER_WORD.test(dept)) return false;
  return isFoodBeverageText(title) || isFoodBeverageText(dept);
}

/** FEC Technician job title, or the technician staff role. */
export function isFecTechnician(jobTitle?: string | null, staffRole?: string | null): boolean {
  if (staffRole === "technician") return true;
  return FEC_TECHNICIAN_TITLE.test(jobTitle ?? "");
}

/** Any supervisor title, including venue / site / F&B supervisor, plus the venue_supervisor staff role. */
export function isArcadeSupervisor(jobTitle?: string | null, staffRole?: string | null): boolean {
  if (staffRole === "venue_supervisor") return true;
  return SUPERVISOR_WORD.test(jobTitle ?? "");
}

/** Manager title that is not F&B. F&B managers stay out of Arcade Technical. */
export function isNonFnbManager(jobTitle?: string | null, department?: string | null): boolean {
  const title = jobTitle ?? "";
  const dept = department ?? "";
  if (!MANAGER_WORD.test(title) && !MANAGER_WORD.test(dept)) return false;
  return !isFnbManager(jobTitle, department);
}

const OPERATIONS_LEAD = /operations|duty|branch|general|venue/i;

/**
 * Operations, duty, branch, general, or venue manager.
 * Other manager titles, including HR, stay out of arcade purchasing and reports.
 */
export function isOperationsLead(jobTitle?: string | null, department?: string | null): boolean {
  if (!isNonFnbManager(jobTitle, department)) return false;
  return OPERATIONS_LEAD.test(`${jobTitle ?? ""} ${department ?? ""}`);
}

export function isOperationsSuperAdmin(jobTitle?: string | null): boolean {
  return isHeadOfOperationsTitle(jobTitle);
}

export function superAdminRoles(): AppRole[] {
  return (Object.keys(ROLE_LEVELS) as AppRole[]).filter((role) => ROLE_LEVELS[role] >= SUPER_ADMIN_MIN_LEVEL);
}

/**
 * Existing super-admin logins (role level >= 80), or a Head of Operations job title.
 * Does not remove a CEO, COO, CFO, or regional ops assignment.
 */
export function hasSuperAdminAccess(roles: readonly string[], jobTitle?: string | null): boolean {
  if (isOperationsSuperAdmin(jobTitle)) return true;
  return (roles as AppRole[]).some((role) => (ROLE_LEVELS[role] ?? 0) >= SUPER_ADMIN_MIN_LEVEL);
}

function jobMayUseArcade(actor: ArcadeActor): boolean {
  return (
    isFecTechnician(actor.jobTitle, actor.staffRole) ||
    isArcadeSupervisor(actor.jobTitle, actor.staffRole) ||
    isNonFnbManager(actor.jobTitle, actor.department)
  );
}

/**
 * Capability check plus Arcade Technical job rules and Head of Operations super admin.
 * F&B managers lose arcade.* even when their login role includes it.
 * A Head of Operations title receives every capability any role level >= 80 already has.
 */
export function canActorPerform(
  roles: readonly AppRole[],
  capability: Capability,
  actor?: Pick<ArcadeActor, "jobTitle" | "staffRole" | "department"> | null,
  grants?: CapabilityGrantMap | null,
): boolean {
  const jobTitle = actor?.jobTitle;
  const staffRole = actor?.staffRole;
  const department = actor?.department;

  if (isOperationsSuperAdmin(jobTitle)) {
    const allowed = superAdminRoles().some((role) => resolveRoleCapability(role, capability, grants));
    if (allowed) return true;
  }

  if (capability.startsWith("arcade.") && isFnbManager(jobTitle, department) && !hasSuperAdminAccess(roles, null)) {
    return false;
  }

  if (
    (capability === "arcade.view" || capability === "arcade.operate") &&
    jobMayUseArcade({ jobTitle, staffRole, department })
  ) {
    return true;
  }

  if (
    capability === "arcade.close" &&
    (isArcadeSupervisor(jobTitle, staffRole) || isOperationsLead(jobTitle, department))
  ) {
    return true;
  }

  if (
    (capability === "arcade.assign" || capability === "arcade.reports" || capability === "arcade.purchase") &&
    isOperationsLead(jobTitle, department)
  ) {
    return true;
  }

  return canUserDo([...roles], capability, grants);
}

function assignedLocations(ids: readonly (string | null | undefined)[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const id of ids ?? []) {
    if (id) set.add(id);
  }
  return set;
}

/**
 * Arcade Technical for this person.
 * Omit locationId to ask whether the module opens.
 * Pass a location to require that branch. Supervisors and non-F&B managers
 * only pass on a location they are assigned to. Head of Operations and other
 * super admins pass at every location. F&B managers fail.
 */
export function canUseArcadeTechnical(actor: ArcadeActor, locationId?: string | null): boolean {
  const roles = actor.roles ?? [];
  if (isFnbManager(actor.jobTitle, actor.department) && !hasSuperAdminAccess(roles, null)) return false;
  if (hasSuperAdminAccess(roles, actor.jobTitle)) return true;

  const open = jobMayUseArcade(actor) || canUserDo([...roles], "arcade.view");
  if (!open) return false;
  if (locationId == null || locationId === "") return true;

  const assigned = assignedLocations(actor.locationIds);
  if (!assigned.has(locationId)) return false;
  return true;
}
