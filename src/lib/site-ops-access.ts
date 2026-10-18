import { isFnbManager, isFoodBeverageText, isOperationsLead } from "@/lib/arcade/access";
import { isManagerTeamSupervisor } from "@/lib/manager-supervisor-team";
import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";

/**
 * Who may create or change the monthly roster, attendance mapping, and
 * corrections filed for someone else.
 *
 * Stored keys already used on staff:
 * - staff_role `venue_supervisor`, or job title / department "Venue Supervisor"
 * - job title or department "Sr. Site Supervisor" / "Senior Site Supervisor"
 * - job title or department "F&B Supervisor" (also "F& Supervisor")
 *
 * There is no team_leader login role. The site catalog title "Team Leader"
 * (department code TEAM_LEAD), "Admin Team Leader", and a login that only
 * has direct reports are not on this list.
 *
 * Site Supervisor and other *Supervisor* titles open the monthly roster through
 * canOpenShiftRoster. Mapping and team corrections stay on this narrower list.
 *
 * Direct reports of Head of Operations with an Operations manager / lead /
 * coordinator title open shift roster and team corrections the same way as a
 * Site Supervisor (not mapping). F&B and cashiers stay out of that peer path.
 */

/** Same default roles as people.edit_roster — kept here so this file does not import rbac. */
const ROSTER_SAVE_ROLES = new Set([
  "ceo",
  "coo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "tech_supervisor",
  "hr",
]);
export type SiteOpsIdentity = {
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
};

const VENUE_SUPERVISOR_ROLE = "venue_supervisor";

function labelKey(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bfnb\b/g, "f and b")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(identity: SiteOpsIdentity, predicate: (value: string | null | undefined) => boolean): boolean {
  return predicate(identity.jobTitle) || predicate(identity.department);
}

function isVenueSupervisorTitle(value: string | null | undefined): boolean {
  return labelKey(value) === "venue supervisor";
}

function isFbSupervisorTitle(value: string | null | undefined): boolean {
  const key = labelKey(value);
  return key === "f and b supervisor" || key === "f and supervisor" || key === "fb supervisor" || key === "fb_supervisor";
}

/**
 * Adil (Managing Director / Chief Executive) and the General Manager.
 * Same people the org chart treats as above the site team, except Head of Operations.
 */
export function isExecutiveRosterLabel(value: string | null | undefined): boolean {
  const key = labelKey(value);
  if (!key) return false;
  if (/(^| )general manager($| )/.test(key)) return true;
  if (key.includes("managing director")) return true;
  if (key.includes("chief executive")) return true;
  return false;
}

/** Catalog title Team Leader, including an "admin team leader" label. Not an allow. */
export function isTeamLeaderTitle(value: string | null | undefined): boolean {
  const key = labelKey(value);
  if (!key) return false;
  return key === "team leader" || key === "admin team leader" || key === "administration team leader" || key === "team_lead";
}

/** Cashier, host, attendant, crew, barista, chef — not HoO-peer roster leads. */
function isFrontlineCrewTitle(value: string | null | undefined): boolean {
  const key = labelKey(value);
  if (!key) return false;
  if (/(?:^| )(?:cashier|host|attendant|crew|barista|chef)(?: |$|\/)/.test(key)) return true;
  if (key === "cashier" || key === "host" || key === "attendant" || key === "crew") return true;
  return false;
}

/**
 * Operations Manager / Lead / Coordinator (and Ops … variants).
 * Used with reportsToHeadOfOperations for Louie/Russell-style HoO peers.
 */
export function isOperationsManagerOrLeadTitle(value: string | null | undefined): boolean {
  const key = labelKey(value);
  if (!key) return false;
  if (/\b(?:operations|ops) (?:manager|lead|coordinator)\b/.test(key)) return true;
  if (/\b(?:manager|lead|coordinator) of operations\b/.test(key)) return true;
  return false;
}

/**
 * Title/department that may receive Site Supervisor–like roster tools when the
 * person reports directly to Head of Operations. F&B, cashiers, crew, and team
 * leaders stay out. Ordinary crew under a site supervisor never reach this path
 * because reportsToHeadOfOperations is false for them.
 */
export function isHoOOperationsPeerTitle(
  jobTitle?: string | null,
  department?: string | null,
): boolean {
  if (isFoodBeverageText(jobTitle) || isFoodBeverageText(department)) return false;
  if (isFrontlineCrewTitle(jobTitle)) return false;
  if (isTeamLeaderTitle(jobTitle) || isTeamLeaderTitle(department)) return false;
  if (isOperationsManagerOrLeadTitle(jobTitle)) return true;
  // Duty / branch / venue / Operations manager titles (non-F&B).
  if (isOperationsLead(jobTitle, department)) return true;
  return false;
}

/** Direct report of HoO with an Operations manager/lead title — same roster openers as Site Supervisor. */
export function canOpenShiftRosterAsHoOPeer(input: {
  jobTitle?: string | null;
  department?: string | null;
  reportsToHeadOfOperations?: boolean;
}): boolean {
  if (!input.reportsToHeadOfOperations) return false;
  return isHoOOperationsPeerTitle(input.jobTitle, input.department);
}

export function canManageMonthlyRoster(identity: SiteOpsIdentity | null | undefined): boolean {
  if (!identity) return false;
  if ((identity.staffRole ?? "").trim() === VENUE_SUPERVISOR_ROLE) return true;
  if (matchesAny(identity, isVenueSupervisorTitle)) return true;
  if (matchesAny(identity, isSrSiteSupervisorTitle)) return true;
  if (matchesAny(identity, isFbSupervisorTitle)) return true;
  return false;
}

export type ShiftRosterIdentity = SiteOpsIdentity & {
  roles?: readonly string[] | null;
  /** Direct report of a Head of Operations title on the ops reporting chart. */
  reportsToHeadOfOperations?: boolean;
};

/**
 * Shift roster upload and monthly roster create / edit / delete.
 * Venue, Sr. Site, F&B, and Site Supervisor titles; any other *Supervisor* title;
 * CEO / GM / Adil; every login that already has people.edit_roster
 * (duty manager, tech supervisor, HR, and the rest); and Operations
 * managers/leads who report to Head of Operations.
 * Team Leader stays out unless that login also has people.edit_roster.
 * Mapping stays on canManageMonthlyRoster (narrower).
 */
export function canOpenShiftRoster(identity: ShiftRosterIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (canManageMonthlyRoster(identity)) return true;
  if (matchesAny(identity, isExecutiveRosterLabel)) return true;
  if (isManagerTeamSupervisor(identity.jobTitle, identity.staffRole)) return true;
  if (canOpenShiftRosterAsHoOPeer(identity)) return true;
  return (identity.roles ?? []).some((role) => ROSTER_SAVE_ROLES.has(role));
}

/** Save, unmap, and remove on Attendance mapping. Same people as the monthly roster. */
export function canEditAttendanceMapping(identity: SiteOpsIdentity | null | undefined): boolean {
  return canManageMonthlyRoster(identity);
}

/**
 * File or change a correction for someone other than yourself. Own punches stay separate.
 * Operations supervisors (venue / Sr. Site / Site), F&B Supervisor, and F&B Manager.
 * Operations managers/leads who report to Head of Operations match Site Supervisor.
 * F&B team corrections route to the F&B Manager; Operations route to Head of Operations.
 */
export function canCorrectTeamAttendance(
  identity: (SiteOpsIdentity & { reportsToHeadOfOperations?: boolean }) | null | undefined,
): boolean {
  if (!identity) return false;
  if ((identity.staffRole ?? "").trim() === VENUE_SUPERVISOR_ROLE) return true;
  if (matchesAny(identity, isVenueSupervisorTitle)) return true;
  if (matchesAny(identity, isSrSiteSupervisorTitle)) return true;
  if (matchesAny(identity, isFbSupervisorTitle)) return true;
  if (isFnbManager(identity.jobTitle, identity.department)) return true;
  if (isManagerTeamSupervisor(identity.jobTitle, identity.staffRole)) return true;
  if (canOpenShiftRosterAsHoOPeer(identity)) return true;
  return false;
}
