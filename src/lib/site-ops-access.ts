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
 */
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

export function canManageMonthlyRoster(identity: SiteOpsIdentity | null | undefined): boolean {
  if (!identity) return false;
  if ((identity.staffRole ?? "").trim() === VENUE_SUPERVISOR_ROLE) return true;
  if (matchesAny(identity, isVenueSupervisorTitle)) return true;
  if (matchesAny(identity, isSrSiteSupervisorTitle)) return true;
  if (matchesAny(identity, isFbSupervisorTitle)) return true;
  return false;
}

/** Shift roster upload and the monthly roster controls. CEO and GM logins, plus Adil and the General Manager by title. */
export function canOpenShiftRoster(
  identity: (SiteOpsIdentity & { roles?: readonly string[] | null }) | null | undefined,
): boolean {
  if (!identity) return false;
  if (canManageMonthlyRoster(identity)) return true;
  if (matchesAny(identity, isExecutiveRosterLabel)) return true;
  return (identity.roles ?? []).some((role) => role === "ceo" || role === "branch_gm");
}

/** Save, unmap, and remove on Attendance mapping. Same people as the monthly roster. */
export function canEditAttendanceMapping(identity: SiteOpsIdentity | null | undefined): boolean {
  return canManageMonthlyRoster(identity);
}

/** File or change a correction for someone other than yourself. Own punches stay separate. */
export function canCorrectTeamAttendance(identity: SiteOpsIdentity | null | undefined): boolean {
  return canManageMonthlyRoster(identity);
}
