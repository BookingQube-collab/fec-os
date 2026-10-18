import { isFnbManager, isFoodBeverageText } from "@/lib/arcade/access";
import { isManagerTeamSupervisor } from "@/lib/manager-supervisor-team";
import { isSrSiteSupervisorTitle } from "@/lib/org-hierarchy";

/**
 * Who may create or change the monthly roster (and team-correction writes that
 * reuse the same assert).
 *
 * Monthly roster allows:
 * - Venue / Sr. Site / F&B Supervisor (title, department, or venue_supervisor role)
 * - Any other *Supervisor* title (Site Supervisor, Operations Supervisor, …)
 * - Non-F&B / non-crew direct reports of Head of Operations (Louie / Russell)
 *
 * Attendance mapping identity check stays Venue / Sr. Site / F&B only
 * (`canEditAttendanceMapping`); company-wide roles (CEO/HR/GM) bypass via
 * `canMergeAttendanceMappings`. Cashiers, crew, and team leaders stay out.
 *
 * Shift roster upload also uses `canOpenShiftRoster`, which includes executives
 * and people.edit_roster logins in addition to everyone on the monthly roster.
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

/** Login / staff_role values that are front-of-house crew, not ops peers. */
function isFrontlineCrewStaffRole(value: string | null | undefined): boolean {
  const key = (value ?? "").trim().toLowerCase();
  return key === "crew" || key === "cashier" || key === "cashier_host" || key === "host";
}

/**
 * Operations Manager / Lead / Coordinator (and Ops … variants).
 * Kept for callers/tests; HoO-peer roster access no longer requires this title.
 */
export function isOperationsManagerOrLeadTitle(value: string | null | undefined): boolean {
  const key = labelKey(value);
  if (!key) return false;
  if (/\b(?:operations|ops) (?:manager|lead|coordinator)\b/.test(key)) return true;
  if (/\b(?:manager|lead|coordinator) of operations\b/.test(key)) return true;
  return false;
}

/**
 * Seat that may receive Site Supervisor–like roster tools when the person
 * reports directly to Head of Operations. Any non-F&B, non-crew, non-team-leader
 * ops peer — including Technician (Russell) and untitled Operations peers (Louie).
 * Ordinary crew under a site supervisor never reach this path because
 * reportsToHeadOfOperations is false for them.
 */
export function isHoOOperationsPeerTitle(
  jobTitle?: string | null,
  department?: string | null,
  staffRole?: string | null,
): boolean {
  if (isFoodBeverageText(jobTitle) || isFoodBeverageText(department)) return false;
  if (isFrontlineCrewTitle(jobTitle)) return false;
  if (isFrontlineCrewStaffRole(staffRole)) return false;
  if (isTeamLeaderTitle(jobTitle) || isTeamLeaderTitle(department)) return false;
  // Any remaining HoO direct report (Technician, blank title, Manager/Lead, etc.).
  return true;
}

/** Direct report of HoO in an ops (non-F&B / non-crew) seat — same roster openers as Site Supervisor. */
export function canOpenShiftRosterAsHoOPeer(input: {
  jobTitle?: string | null;
  department?: string | null;
  staffRole?: string | null;
  reportsToHeadOfOperations?: boolean;
}): boolean {
  if (!input.reportsToHeadOfOperations) return false;
  return isHoOOperationsPeerTitle(input.jobTitle, input.department, input.staffRole);
}

/** Venue / Sr. Site / F&B only — attendance mapping editors. */
function isClassicSiteOpsRosterSupervisor(identity: SiteOpsIdentity): boolean {
  if ((identity.staffRole ?? "").trim() === VENUE_SUPERVISOR_ROLE) return true;
  if (matchesAny(identity, isVenueSupervisorTitle)) return true;
  if (matchesAny(identity, isSrSiteSupervisorTitle)) return true;
  if (matchesAny(identity, isFbSupervisorTitle)) return true;
  return false;
}

export type MonthlyRosterIdentity = SiteOpsIdentity & {
  /** Direct report of a Head of Operations title on the ops reporting chart. */
  reportsToHeadOfOperations?: boolean;
};

/**
 * Monthly roster create / edit / delete / upload for the team chart.
 * Venue / Sr. Site / F&B, every *Supervisor* title (Site, Operations, …), and
 * HoO ops peers. Mapping stays on canEditAttendanceMapping.
 */
export function canManageMonthlyRoster(identity: MonthlyRosterIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (isClassicSiteOpsRosterSupervisor(identity)) return true;
  if (isManagerTeamSupervisor(identity.jobTitle, identity.staffRole)) return true;
  if (canOpenShiftRosterAsHoOPeer(identity)) return true;
  return false;
}

export type ShiftRosterIdentity = MonthlyRosterIdentity & {
  roles?: readonly string[] | null;
};

/**
 * Shift roster upload and monthly roster create / edit / delete.
 * Everyone on canManageMonthlyRoster; CEO / GM / Adil; every login that already
 * has people.edit_roster (duty manager, tech supervisor, HR, and the rest).
 * Team Leader stays out unless that login also has people.edit_roster.
 * Mapping stays on canEditAttendanceMapping (narrower).
 */
export function canOpenShiftRoster(identity: ShiftRosterIdentity | null | undefined): boolean {
  if (!identity) return false;
  if (canManageMonthlyRoster(identity)) return true;
  if (matchesAny(identity, isExecutiveRosterLabel)) return true;
  return (identity.roles ?? []).some((role) => ROSTER_SAVE_ROLES.has(role));
}

/** Save, unmap, and remove on Attendance mapping. Venue / Sr. Site / F&B only. */
export function canEditAttendanceMapping(identity: SiteOpsIdentity | null | undefined): boolean {
  if (!identity) return false;
  return isClassicSiteOpsRosterSupervisor(identity);
}

/**
 * File or change a correction for someone other than yourself. Own punches stay separate.
 * Operations supervisors (venue / Sr. Site / Site), F&B Supervisor, and F&B Manager.
 * Non-F&B / non-crew HoO direct reports match Site Supervisor.
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
