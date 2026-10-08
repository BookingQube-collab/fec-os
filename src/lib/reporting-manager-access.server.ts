import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reportingTreeStaffIds } from "@/lib/attendance-listing-access";
import { unionTeamLocationIds, usesTeamLocationScope } from "@/lib/reporting-manager-locations";
import type { AppRole } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { STAFF_NOT_JOKER_EMPLOYMENT_OR } from "@/lib/staff-status";

/** Same roster the operations chart keeps on Team overview. Resigned, terminated, and jokers are out. */
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
  const { data: staff, error } = await supabaseAdmin
    .from("staff")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
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
      .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
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
 * Direct reports and everyone who reports through them.
 * Empty when this login has no direct reports. The viewer is not included.
 */
export async function loadReportingTreeStaffIds(userId: string): Promise<string[]> {
  const access = await loadDirectReportStaffIds(userId);
  if (!access.staffId || access.directReportStaffIds.length === 0) return [];

  const edges: { staffId: string; reportingManagerStaffId: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, reporting_manager_staff_id")
      .order("staff_id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      if (!row.staff_id) continue;
      edges.push({
        staffId: row.staff_id,
        reportingManagerStaffId: row.reporting_manager_staff_id,
      });
    }
    if (page.length < 1000) break;
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
      .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
      .is("deleted_at", null);
    if (staffErr) throw new Error(staffErr.message);
    for (const row of rows ?? []) active.add(row.id);
  }
  return [...active].sort();
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

export async function mergeReportingManagerSites<T extends { id: string; code: string }>(
  context: { userId: string; roles?: AppRole[] },
  sites: T[],
): Promise<T[]> {
  if (!usesTeamLocationScope(context.roles ?? [])) return sites;
  const { directReportStaffIds } = await loadDirectReportStaffIds(context.userId);
  if (directReportStaffIds.length === 0) return sites;
  const extra = await loadTeamCoverageLocations(directReportStaffIds);
  if (extra.length === 0) return sites;
  const byId = new Map<string, T>();
  for (const site of extra) byId.set(site.id, site as unknown as T);
  for (const site of sites) {
    if (!byId.has(site.id)) byId.set(site.id, site);
  }
  return [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export type ShiftRosterUploadScope =
  | { kind: "company" }
  | { kind: "team"; staffIds: string[]; locationIds: string[] };

/** Company upload stays on the existing capability. Reporting managers upload their team only. */
export async function resolveShiftRosterUploadScope(context: {
  userId: string;
  roles?: AppRole[];
}): Promise<ShiftRosterUploadScope> {
  if (!usesTeamLocationScope(context.roles ?? [])) return { kind: "company" };
  const { directReportStaffIds } = await loadDirectReportStaffIds(context.userId);
  if (directReportStaffIds.length === 0) {
    throw new ForbiddenError("Forbidden: missing capability to upload a shift roster.");
  }
  const locations = await loadTeamCoverageLocations(directReportStaffIds);
  return {
    kind: "team",
    staffIds: directReportStaffIds,
    locationIds: locations.map((loc) => loc.id),
  };
}
