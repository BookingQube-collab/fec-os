import { reportingDescendants } from "@/lib/reporting-chain";
import { canUserDo, type AppRole } from "@/lib/rbac";

/** Person-by-person attendance listing. Same route the Attendance listing tab already uses. */
export const ATTENDANCE_LISTING_HREF = "/people/attendance/reports";

/** Existing biometric user → staff mapper. */
export const ATTENDANCE_MAPPING_HREF = "/people/attendance/mapping";

const ATTENDANCE_NAV_HREFS = [
  "/people/attendance",
  "/people/attendance/import",
  "/people/attendance/reports",
  "/people/attendance/mapping",
  "/people/attendance/device-logs",
  "/people/attendance/corrections",
  "/people/attendance/settings",
] as const;

/**
 * Manager and supervisor roles in the RBAC matrix.
 * There is no separate team_leader role. A team leader is someone with direct reports.
 */
const MANAGER_SUPERVISOR_ROLES = ["duty_manager", "tech_supervisor"] as const satisfies readonly AppRole[];

/** Admin, GM, CEO, COO, and the other roles that already open every attendance page. */
export function attendanceListingIsCompanyWide(roles: readonly AppRole[]): boolean {
  const list = roles as AppRole[];
  return (
    canUserDo(list, "attendance.view") ||
    canUserDo(list, "attendance.view_all") ||
    canUserDo(list, "attendance.export")
  );
}

/**
 * Listing tab for company attendance, for manager/supervisor roles, and for any
 * login that already has direct reports (including cashier_host team leaders).
 */
export function canSeeAttendanceListing(roles: readonly AppRole[], hasDirectReports: boolean): boolean {
  if (attendanceListingIsCompanyWide(roles)) return true;
  if (hasDirectReports) return true;
  return roles.some((role) => (MANAGER_SUPERVISOR_ROLES as readonly AppRole[]).includes(role));
}

/** HR, CEO, and COO already map every employee. GM keeps that same company-wide mapper. */
export function attendanceMappingIsCompanyWide(roles: readonly AppRole[]): boolean {
  const list = roles as AppRole[];
  return canUserDo(list, "attendance.map_users") || list.includes("branch_gm");
}

/** Same people who see Attendance listing, including anyone who already had company-wide mapping. */
export function canSeeAttendanceMapping(roles: readonly AppRole[], hasDirectReports: boolean): boolean {
  if (attendanceMappingIsCompanyWide(roles)) return true;
  return canSeeAttendanceListing(roles, hasDirectReports);
}

/**
 * Save/unmap on the existing mapper.
 * Auditors and other company viewers stay read-only unless they lead a team.
 */
export function canMergeAttendanceMappings(roles: readonly AppRole[], hasDirectReports: boolean): boolean {
  if (attendanceMappingIsCompanyWide(roles)) return true;
  if (!canSeeAttendanceMapping(roles, hasDirectReports)) return false;
  if (hasDirectReports) return true;
  return roles.some((role) => (MANAGER_SUPERVISOR_ROLES as readonly AppRole[]).includes(role));
}

/** Dashboard and Corrections stay. Listing and Mapping open for team leaders. Import and devices stay on company access. */
export function visibleAttendanceNavHrefs(roles: readonly AppRole[], hasDirectReports: boolean): string[] {
  if (canUserDo(roles as AppRole[], "attendance.view")) return [...ATTENDANCE_NAV_HREFS];
  const team = new Set<string>(["/people/attendance", "/people/attendance/corrections"]);
  if (canSeeAttendanceListing(roles, hasDirectReports)) team.add(ATTENDANCE_LISTING_HREF);
  if (canSeeAttendanceMapping(roles, hasDirectReports)) team.add(ATTENDANCE_MAPPING_HREF);
  return ATTENDANCE_NAV_HREFS.filter((href) => team.has(href));
}

export type AttendanceListingStaffConstraint =
  | { mode: "company" }
  | { mode: "empty" }
  | { mode: "team"; staffIds: string[] };

/**
 * Company-wide roles keep the unfiltered listing.
 * Everyone else is limited to the reporting tree. Unmapped device users are not on that tree.
 */
export function resolveAttendanceListingStaffConstraint(input: {
  companyWide: boolean;
  teamStaffIds: readonly string[];
  /** Search, department, or one staff id. Null means the whole team. */
  narrowToStaffIds: readonly string[] | null;
  unmappedOnly: boolean;
}): AttendanceListingStaffConstraint {
  if (input.companyWide) return { mode: "company" };
  if (input.unmappedOnly || input.teamStaffIds.length === 0) return { mode: "empty" };
  const allow = new Set(input.teamStaffIds);
  if (input.narrowToStaffIds == null) return { mode: "team", staffIds: [...allow] };
  const staffIds = input.narrowToStaffIds.filter((id) => allow.has(id));
  if (staffIds.length === 0) return { mode: "empty" };
  return { mode: "team", staffIds };
}

export type AttendanceMappingRowScope = {
  staffId?: string | null;
  locationId?: string | null;
};

/**
 * Team mapping rows: the team's sites, IDs already merged onto the team,
 * and unmapped device users that are not tied to a site.
 * Unmapped IDs at someone else's site stay out.
 */
export function attendanceMappingRowAllowed(
  companyWide: boolean,
  teamStaffIds: readonly string[],
  teamLocationIds: readonly string[],
  row: AttendanceMappingRowScope,
): boolean {
  if (companyWide) return true;
  const staffId = row.staffId || null;
  const locationId = row.locationId || null;
  if (staffId && teamStaffIds.includes(staffId)) return true;
  if (locationId && teamLocationIds.includes(locationId)) return true;
  return !staffId && !locationId;
}

/** Company mappers may merge onto anyone. Everyone else may merge only onto the reporting tree. */
export function attendanceMappingStaffAllowed(
  companyWide: boolean,
  teamStaffIds: readonly string[],
  staffId: string,
): boolean {
  if (companyWide) return true;
  return teamStaffIds.includes(staffId);
}

/**
 * Direct reports plus everyone further down the same reporting line.
 * The viewer is not included. People outside the line are not included.
 */
export function reportingTreeStaffIds(
  viewerStaffId: string | null,
  directReportStaffIds: readonly string[],
  edges: readonly { staffId: string; reportingManagerStaffId: string | null }[],
): string[] {
  if (!viewerStaffId || directReportStaffIds.length === 0) return [];
  const managers = new Map(edges.map((edge) => [edge.staffId, edge.reportingManagerStaffId]));
  const ids = reportingDescendants(viewerStaffId, managers);
  for (const id of directReportStaffIds) {
    if (id && id !== viewerStaffId) ids.add(id);
  }
  ids.delete(viewerStaffId);
  return [...ids].sort();
}
