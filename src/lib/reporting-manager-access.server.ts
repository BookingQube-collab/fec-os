import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  attendanceListingTeamStaffIds,
  reportingTreeStaffIds,
} from "@/lib/attendance-listing-access";
import { isRosterAssignableStaffStatus } from "@/lib/attendance-hr/roster-register-scope";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import {
  managerSupervisorTeamIds,
  viewerRollsUpSupervisorTeam,
  type ManagerTeamPerson,
} from "@/lib/manager-supervisor-team";
import { isPeopleDirectoryTeamRow } from "@/lib/people-directory-access";
import {
  locationsForRosterCards,
  rosterScopeAssignedLocationIds,
} from "@/lib/attendance-hr/roster-location-coverage";
import {
  attendanceLocationScopeMode,
  filterLocationsForJobTitleScope,
  isVenueOrSiteSupervisorManager,
  locationDiscoveryStaffIds,
  rosterChartTeamIds,
  rosterTeamOrSelfStaffIds,
  unionTeamLocationIds,
  usesTeamLocationScope,
} from "@/lib/reporting-manager-locations";
import type { AppRole } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { isJokerStaffStatus } from "@/lib/staff-status";

/** Same roster the operations chart keeps on Team overview. Resigned, terminated, and status=joker are out. */
const DIRECT_REPORT_STATUSES = ["active", "probation", "secondment", "remote", "serving_notice"] as const;

export type DirectReportAccess = {
  staffId: string | null;
  directReportStaffIds: string[];
};

/**
 * Active people whose operations reporting line (`staff_profile_ext.reporting_manager_staff_id`)
 * points at the signed-in user's staff record. Direct reports only.
 */
export async function loadDirectReportStaffIds(userId: string): Promise<DirectReportAccess> {
  const staff = await loadLinkedStaffRecord(userId);
  if (!staff?.id) return { staffId: null, directReportStaffIds: [] };

  const { data: reports, error: reportErr } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("staff_id")
    .eq("reporting_manager_staff_id", staff.id);
  if (reportErr) throw new Error(reportErr.message);

  const candidateIds = [
    ...new Set((reports ?? []).map((row) => row.staff_id).filter((id) => id && id !== staff.id)),
  ];
  if (candidateIds.length === 0) return { staffId: staff.id, directReportStaffIds: [] };

  const active = new Set<string>();
  for (let index = 0; index < candidateIds.length; index += 100) {
    const chunk = candidateIds.slice(index, index + 100);
    const { data: rows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id")
      .in("id", chunk)
      .in("status", [...DIRECT_REPORT_STATUSES])
      .is("deleted_at", null);
    if (staffErr) throw new Error(staffErr.message);
    for (const row of rows ?? []) active.add(row.id);
  }

  return {
    staffId: staff.id,
    directReportStaffIds: [...active].sort(),
  };
}

/**
 * People directory for a rollup manager or supervisor.
 * Self plus the full reporting subtree (Shift Lead → crew included).
 * Includes active, on leave, and serving notice. Omits resigned, terminated,
 * deleted, and status=joker. Employment type joker stays listable when status allows.
 */
export async function loadPeopleDirectoryTeamStaffIds(userId: string): Promise<string[]> {
  const { members } = await loadManagerTeamMembers(userId);
  const visible = new Set<string>();
  for (const member of members) {
    if (
      isPeopleDirectoryTeamRow({
        status: member.status,
        employmentType: member.employmentType,
        deletedAt: member.deletedAt,
      })
    ) {
      visible.add(member.staffId);
    }
  }
  return [...visible].sort();
}

/**
 * Direct reports and everyone who reports through them.
 * Empty when this login has no direct reports. The viewer is not included.
 */
async function reportingChildren(
  managerIds: readonly string[],
): Promise<Array<{ staffId: string; reportingManagerStaffId: string }>> {
  const edges: Array<{ staffId: string; reportingManagerStaffId: string }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < managerIds.length; index += 80) {
    const chunk = managerIds.slice(index, index + 80);
    for (let page = 0; page < 40; page += 1) {
      const from = page * 1000;
      const { data, error } = await supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id, reporting_manager_staff_id")
        .in("reporting_manager_staff_id", [...chunk])
        .order("staff_id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      let added = 0;
      for (const row of rows) {
        const staffId = row.staff_id ? String(row.staff_id) : "";
        const managerId = row.reporting_manager_staff_id ? String(row.reporting_manager_staff_id) : "";
        if (!staffId || !managerId || seen.has(staffId)) continue;
        seen.add(staffId);
        edges.push({ staffId, reportingManagerStaffId: managerId });
        added += 1;
      }
      if (rows.length < 1000 || added === 0) break;
    }
  }
  return edges;
}

type ManagerTeamMember = ManagerTeamPerson & {
  status: string | null;
  employmentType: string | null;
  deletedAt: string | null;
};

async function loadStaffTeamRows(
  staffIds: string[],
  managerByChild: ReadonlyMap<string, string>,
): Promise<ManagerTeamMember[]> {
  const out: ManagerTeamMember[] = [];
  for (let index = 0; index < staffIds.length; index += 100) {
    const chunk = staffIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, job_title, staff_role, status, employment_type, deleted_at")
      .in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const staffId = String(row.id);
      out.push({
        staffId,
        jobTitle: row.job_title ?? null,
        staffRole: row.staff_role ?? null,
        reportingManagerStaffId: managerByChild.get(staffId) ?? null,
        status: row.status ?? null,
        employmentType: row.employment_type ?? null,
        deletedAt: row.deleted_at ?? null,
      });
    }
  }
  return out;
}

/**
 * Direct reports and — for a rollup manager or supervisor — the full reporting
 * subtree (Shift Lead → crew, cashier lead → helper). Cashiers stay on direct
 * reports. Another manager's branch is not loaded.
 */
export async function loadManagerTeamMembers(userId: string): Promise<{
  staffId: string | null;
  viewerJobTitle: string | null;
  viewerStaffRole: string | null;
  members: ManagerTeamMember[];
}> {
  // staff.user_id is not unique — same helper as monthly roster / directory scope.
  const staff = await loadLinkedStaffRecord(userId);
  if (!staff?.id) return { staffId: null, viewerJobTitle: null, viewerStaffRole: null, members: [] };

  const viewerStaffId = staff.id;
  const viewerJobTitle = staff.jobTitle;
  const viewerStaffRole = staff.staffRole;
  const rollup = viewerRollsUpSupervisorTeam(viewerJobTitle, viewerStaffRole);
  const loaded: ManagerTeamMember[] = [];
  const seen = new Set<string>([viewerStaffId]);
  let frontier = [viewerStaffId];

  for (let depth = 0; depth < 25 && frontier.length > 0; depth += 1) {
    const edges = await reportingChildren(frontier);
    const managerByChild = new Map<string, string>();
    const childIds: string[] = [];
    for (const edge of edges) {
      if (!edge.staffId || edge.staffId === viewerStaffId || seen.has(edge.staffId)) continue;
      seen.add(edge.staffId);
      childIds.push(edge.staffId);
      managerByChild.set(edge.staffId, edge.reportingManagerStaffId);
    }
    if (childIds.length === 0) break;
    const rows = await loadStaffTeamRows(childIds, managerByChild);
    const next: string[] = [];
    for (const member of rows) {
      loaded.push(member);
      // Match managerSupervisorTeamIds: rollup viewers walk every descendant edge.
      if (rollup) next.push(member.staffId);
    }
    if (!rollup) break;
    frontier = next;
  }

  const allowed = new Set(
    managerSupervisorTeamIds({
      viewerStaffId,
      viewerJobTitle,
      viewerStaffRole,
      people: loaded,
    }),
  );
  const members = loaded.filter((member) => allowed.has(member.staffId));
  // Rollup viewers include themselves on People / team lists.
  if (allowed.has(viewerStaffId) && !members.some((member) => member.staffId === viewerStaffId)) {
    members.push({
      staffId: viewerStaffId,
      jobTitle: viewerJobTitle,
      staffRole: viewerStaffRole,
      reportingManagerStaffId: null,
      status: staff.status,
      employmentType: staff.employmentType,
      deletedAt: null,
    });
  }
  return {
    staffId: viewerStaffId,
    viewerJobTitle,
    viewerStaffRole,
    members,
  };
}

function isOperationsTeamMember(member: ManagerTeamMember): boolean {
  if (member.deletedAt) return false;
  if (isJokerStaffStatus(member.status)) return false;
  const status = (member.status ?? "").trim().toLowerCase();
  return (DIRECT_REPORT_STATUSES as readonly string[]).includes(status);
}

/**
 * Same people a manager reviews on attendance, leave, and corrections.
 * Status rules match direct reports. The extra people are the supervisor's team.
 */
export async function loadManagerTeamStaffIds(userId: string): Promise<{
  staffId: string | null;
  teamStaffIds: string[];
}> {
  const { staffId, members } = await loadManagerTeamMembers(userId);
  if (!staffId) return { staffId: null, teamStaffIds: [] };
  return {
    staffId,
    teamStaffIds: members
      .filter(isOperationsTeamMember)
      .map((member) => member.staffId)
      .sort(),
  };
}

export async function loadReportingTreeStaffIds(userId: string): Promise<string[]> {
  const access = await loadDirectReportStaffIds(userId);
  if (!access.staffId || access.directReportStaffIds.length === 0) return [];

  const edges: { staffId: string; reportingManagerStaffId: string | null }[] = [];
  const seen = new Set<string>([access.staffId]);
  let frontier = [access.staffId];
  for (let depth = 0; depth < 25 && frontier.length > 0; depth += 1) {
    const children = await reportingChildren(frontier);
    const next: string[] = [];
    for (const edge of children) {
      edges.push(edge);
      if (seen.has(edge.staffId)) continue;
      seen.add(edge.staffId);
      next.push(edge.staffId);
    }
    frontier = next;
  }

  const treeIds = reportingTreeStaffIds(access.staffId, access.directReportStaffIds, edges);
  if (treeIds.length === 0) return [];

  const active = new Set<string>();
  for (let index = 0; index < treeIds.length; index += 100) {
    const chunk = treeIds.slice(index, index + 100);
    const { data: rows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id")
      .in("id", chunk)
      .in("status", [...DIRECT_REPORT_STATUSES])
      .is("deleted_at", null);
    if (staffErr) throw new Error(staffErr.message);
    for (const row of rows ?? []) active.add(row.id);
  }
  return [...active].sort();
}

/**
 * Attendance listing staff scope for team-scoped supervisors and managers.
 * Reporting tree plus the viewer's own staff_id when they roll up a team
 * (Venue / Site / Sr. Site / Operations / F&B supervisor or manager).
 * Cashiers with reports keep the tree only (no self). Mapping still uses
 * {@link loadReportingTreeStaffIds} without the viewer.
 */
export async function loadAttendanceListingStaffIds(userId: string): Promise<{
  staffId: string | null;
  teamStaffIds: string[];
}> {
  const staff = await loadLinkedStaffRecord(userId);
  const treeIds = await loadReportingTreeStaffIds(userId);
  if (!staff?.id) return { staffId: null, teamStaffIds: treeIds };

  const viewerActive =
    (DIRECT_REPORT_STATUSES as readonly string[]).includes((staff.status ?? "").trim().toLowerCase()) &&
    !isJokerStaffStatus(staff.status);

  const teamStaffIds = attendanceListingTeamStaffIds({
    viewerStaffId: viewerActive ? staff.id : null,
    viewerJobTitle: staff.jobTitle,
    viewerStaffRole: staff.staffRole,
    reportingTreeStaffIds: treeIds,
  });
  return { staffId: staff.id, teamStaffIds };
}

export type TeamCoverageLocation = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  status: string;
  timezone: string;
};

async function distinctColumnIds(
  table: "attendance_logs" | "attendance_daily_summary" | "attendance_roster_assignments" | "staff_work_locations",
  staffIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (let index = 0; index < staffIds.length; index += 50) {
    const chunk = staffIds.slice(index, index + 50);
    let from = 0;
    for (let page = 0; page < 30; page += 1) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select("location_id")
        .in("staff_id", chunk)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      for (const row of rows) {
        if (row.location_id) ids.add(String(row.location_id));
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  return [...ids];
}

/**
 * Active sites where these people are assigned today.
 * Home branch and extra dedicated sites. Punch history and roster rows do not add a site.
 */
export async function loadAssignedTeamLocations(staffIds: string[]): Promise<TeamCoverageLocation[]> {
  if (staffIds.length === 0) return [];

  const homeIds: string[] = [];
  for (let index = 0; index < staffIds.length; index += 100) {
    const chunk = staffIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("location_id")
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.location_id) homeIds.push(String(row.location_id));
    }
  }

  const extraIds = await distinctColumnIds("staff_work_locations", staffIds);
  const locationIds = rosterScopeAssignedLocationIds({
    homeLocationIds: homeIds,
    extraLocationIds: extraIds,
  });
  if (locationIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, code, name, city, region, status, timezone")
    .in("id", locationIds)
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(error.message);
  return locationsForRosterCards(
    (data ?? []).map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      city: row.city ?? null,
      region: row.region ?? null,
      status: String(row.status),
      timezone: String(row.timezone),
    })),
    locationIds,
  );
}

/** Active sites where these people are assigned, rostered, or have punched. */
export async function loadTeamCoverageLocations(staffIds: string[]): Promise<TeamCoverageLocation[]> {
  if (staffIds.length === 0) return [];

  const homeIds: string[] = [];
  for (let index = 0; index < staffIds.length; index += 100) {
    const chunk = staffIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("location_id")
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.location_id) homeIds.push(String(row.location_id));
    }
  }

  const [workIds, punchIds, summaryIds, rosterIds] = await Promise.all([
    distinctColumnIds("staff_work_locations", staffIds),
    distinctColumnIds("attendance_logs", staffIds),
    distinctColumnIds("attendance_daily_summary", staffIds),
    distinctColumnIds("attendance_roster_assignments", staffIds),
  ]);

  const locationIds = unionTeamLocationIds({
    homeLocationIds: homeIds,
    workLocationIds: workIds,
    punchLocationIds: [...punchIds, ...summaryIds],
    rosterLocationIds: rosterIds,
  });
  if (locationIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, code, name, city, region, status, timezone")
    .in("id", locationIds)
    .eq("status", "active")
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    city: row.city ?? null,
    region: row.region ?? null,
    status: String(row.status),
    timezone: String(row.timezone),
  }));
}

/**
 * Active Venue / Site supervisors (not Sr. Site) — each manages one or more venues.
 * Sr. Site chips union these managers' home + dedicated work sites so the span
 * matches the org chart even when crew under them is still home’d at INF-CC.
 */
async function loadVenueOrSiteSupervisorManagerIds(): Promise<string[]> {
  const ids = new Set<string>();
  let from = 0;
  for (let page = 0; page < 40; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, job_title, staff_role")
      .in("status", [...DIRECT_REPORT_STATUSES])
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const row of rows) {
      const jobTitle = (row.job_title as string | null) ?? null;
      const staffRole = (row.staff_role as string | null) ?? null;
      if (!isVenueOrSiteSupervisorManager(jobTitle, staffRole)) continue;
      if (row.id) ids.add(String(row.id));
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  return [...ids].sort();
}

/**
 * Location chips for attendance / roster pickers (org-chart rule).
 * Uses home + dedicated work sites only — never punch or roster history.
 * Venue / Site Supervisor: viewer's managed sites only.
 * Sr. Site: reporting subtree assigned sites ∪ every Venue/Site supervisor's
 * managed venues, minus Head Office (All locations aggregates that set).
 */
export async function loadViewerScopedTeamLocations(
  userId: string,
  teamStaffIds: string[],
): Promise<TeamCoverageLocation[]> {
  const linked = await loadLinkedStaffRecord(userId);
  const scopeMode = attendanceLocationScopeMode(
    linked?.jobTitle,
    linked?.department,
    linked?.staffRole,
  );
  const discoveryIds = locationDiscoveryStaffIds(scopeMode, linked?.id, teamStaffIds);
  if (scopeMode === "viewer_assigned") {
    return loadAssignedTeamLocations(discoveryIds);
  }

  // Sr. Site: subtree homes/work plus every Venue/Site supervisor's managed sites.
  const supervisorIds = await loadVenueOrSiteSupervisorManagerIds();
  const spanIds = [...new Set([...discoveryIds, ...supervisorIds])].sort();
  const sites = await loadAssignedTeamLocations(spanIds);
  return filterLocationsForJobTitleScope(
    sites,
    linked?.jobTitle,
    linked?.department,
    linked?.staffRole,
  );
}

export async function mergeReportingManagerSites<T extends { id: string; code: string; name?: string | null }>(
  context: { userId: string; roles?: AppRole[] },
  sites: T[],
): Promise<T[]> {
  if (!usesTeamLocationScope(context.roles ?? [])) return sites;
  const linked = await loadLinkedStaffRecord(context.userId);
  const { teamStaffIds } = await loadManagerTeamStaffIds(context.userId);
  if (teamStaffIds.length === 0) {
    return filterLocationsForJobTitleScope(
      sites,
      linked?.jobTitle,
      linked?.department,
      linked?.staffRole,
    );
  }
  const extra = await loadViewerScopedTeamLocations(context.userId, teamStaffIds);
  if (extra.length === 0) {
    return filterLocationsForJobTitleScope(
      sites,
      linked?.jobTitle,
      linked?.department,
      linked?.staffRole,
    );
  }
  const byId = new Map<string, T>();
  for (const site of extra) byId.set(site.id, site as unknown as T);
  for (const site of sites) {
    if (!byId.has(site.id)) byId.set(site.id, site);
  }
  return filterLocationsForJobTitleScope(
    [...byId.values()].sort((a, b) => a.code.localeCompare(b.code)),
    linked?.jobTitle,
    linked?.department,
    linked?.staffRole,
  );
}

export type ShiftRosterUploadScope =
  | { kind: "company" }
  | { kind: "team"; staffIds: string[]; locationIds: string[] };

/**
 * A supervisor with no direct reports may upload a roster that covers only themselves.
 * Resigned, terminated, deleted, and status=joker stay out. Non-supervisors stay empty.
 */
export async function loadSupervisorSelfRosterStaffIds(staffId: string | null): Promise<string[]> {
  if (!staffId) return [];
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, job_title, staff_role, status, employment_type, deleted_at")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id || data.deleted_at) return [];
  if (!isRosterAssignableStaffStatus(data.status) || isJokerStaffStatus(data.status)) return [];
  return rosterTeamOrSelfStaffIds({
    staffId: String(data.id),
    directReportStaffIds: [],
    jobTitle: data.job_title,
    staffRole: data.staff_role,
  });
}

function rosterChartAssignable(member: {
  deletedAt?: string | null;
  status?: string | null;
  employmentType?: string | null;
}): boolean {
  return (
    !member.deletedAt &&
    isRosterAssignableStaffStatus(member.status) &&
    !isJokerStaffStatus(member.status)
  );
}

/**
 * Team-scoped monthly roster: the signed-in person plus everyone who reports
 * to them on `staff_profile_ext.reporting_manager_staff_id`, including crew
 * under a lead who is not a supervisor. Resigned, terminated, deleted, and
 * status=joker stay off the list. Employment type joker stays when status allows.
 */
export async function loadRosterChartStaffIds(userId: string): Promise<string[]> {
  // One login can link to more than one staff row. Use the newest only.
  const staff = await loadLinkedStaffRecord(userId);
  if (!staff?.id) return [];

  const viewerStaffId = staff.id;
  const people: {
    staffId: string;
    reportingManagerStaffId: string | null;
    assignable: boolean;
  }[] = [
    {
      staffId: viewerStaffId,
      reportingManagerStaffId: null,
      assignable: rosterChartAssignable({
        status: staff.status,
        employmentType: staff.employmentType,
      }),
    },
  ];

  const seen = new Set<string>([viewerStaffId]);
  let frontier = [viewerStaffId];
  for (let depth = 0; depth < 25 && frontier.length > 0; depth += 1) {
    const edges = await reportingChildren(frontier);
    const nextIds: string[] = [];
    const managerByChild = new Map<string, string>();
    for (const edge of edges) {
      if (!edge.staffId || seen.has(edge.staffId)) continue;
      seen.add(edge.staffId);
      nextIds.push(edge.staffId);
      if (edge.reportingManagerStaffId) managerByChild.set(edge.staffId, edge.reportingManagerStaffId);
    }
    if (nextIds.length === 0) break;
    const rows = await loadStaffTeamRows(nextIds, managerByChild);
    const nextFrontier: string[] = [];
    for (const member of rows) {
      people.push({
        staffId: member.staffId,
        reportingManagerStaffId: member.reportingManagerStaffId,
        assignable: rosterChartAssignable(member),
      });
      nextFrontier.push(member.staffId);
    }
    frontier = nextFrontier;
  }

  return rosterChartTeamIds(viewerStaffId, people);
}

/** Company upload stays on the existing capability. A team-scoped login uploads the same chart subtree they can see, including themselves. */
export async function resolveShiftRosterUploadScope(context: {
  userId: string;
  roles?: AppRole[];
}): Promise<ShiftRosterUploadScope> {
  if (!usesTeamLocationScope(context.roles ?? [])) return { kind: "company" };
  const staffIds = await loadRosterChartStaffIds(context.userId);
  if (staffIds.length === 0) {
    throw new ForbiddenError("Forbidden: missing capability to upload a shift roster.");
  }
  const locations = await loadViewerScopedTeamLocations(context.userId, staffIds);
  return {
    kind: "team",
    staffIds,
    locationIds: locations.map((loc) => loc.id),
  };
}
