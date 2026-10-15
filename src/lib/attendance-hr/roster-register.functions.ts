"use server";

import { z } from "zod";

import { loadLinkedStaffIdentity } from "@/lib/linked-staff-job-title.server";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { assertCanManageMonthlyRoster } from "@/lib/site-ops-access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isManagerTeamSupervisor } from "@/lib/manager-supervisor-team";
import { loadAssignedTeamLocations, loadRosterChartStaffIds } from "@/lib/reporting-manager-access.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { assertAttendanceRosterLocation } from "@/lib/attendance-hr/roster-apply";
import { loadActiveShiftTemplates } from "@/lib/attendance-hr/roster-amend";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { matchShiftTemplate, parseTimeCell } from "@/lib/attendance-hr/roster-upload";
import {
  assertRosterDeletePeriod,
  chunkIds,
  collectPagedRows,
  collectPagedRowsInWaves,
  isRosterAssignableStaffStatus,
  rosterAmendRecalcLocationIds,
  isRosterLeaveType,
  rosterHiddenStaffIds,
  rosterPatchFromDayStatus,
  rosterRowsForAssignedStaff,
  rosterStaffIdsAtLocation,
  rosterRowMatchesSearch,
  type RosterDayStatus,
  type RosterLeaveType,
  type RosterMatrixStaff,
} from "@/lib/attendance-hr/roster-register-scope";
import {
  filterRosterCopyRows,
  planRosterCopyByLocation,
  rosterCopyDestinationKey,
  rosterCopyProtectedDestinationKeys,
} from "@/lib/attendance-hr/roster-copy";
import { mapRosterPeriodByDayIndex, monthBounds, nextPayrollMonth, previousPayrollMonth } from "@/lib/attendance-hr/roster-period";
import {
  filterPreviousMonthRosterDownloadRows,
  previousMonthRosterSheetLines,
  type PreviousMonthRosterDepartment,
} from "@/lib/staff-roster/previous-month-export";
import { buildPeopleRosterRowsXlsx, peopleRosterSampleFilename } from "@/lib/staff-roster/period-sample";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE } from "@/lib/attendance-hr/constants";
import { isJokerStaff, STAFF_NOT_JOKER_EMPLOYMENT_OR } from "@/lib/staff-status";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function missingCompOffColumn(error: { message?: string } | null | undefined): boolean {
  return /comp_off_for_date/i.test(error?.message ?? "");
}

function parseHm(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return parseTimeCell(value) ?? (/^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);
}

export type RosterRegisterRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftTemplateId: string | null;
  isWeekOff: boolean;
  /** From attendance_leave_records when present (annual_leave / sick_leave / comp_off). */
  leaveType: RosterLeaveType | null;
  /** Worked day a comp-off compensates. Null unless leaveType is comp_off. */
  compOffForDate: string | null;
  /** Short explanation stored on attendance_leave_records.notes for comp-off. */
  compOffNote: string | null;
  source: string;
  /** Staff profile flag. Read for the copy dialog only; punches and payroll are unchanged. */
  flexibleAttendance: boolean;
  /**
   * Legacy staff.department. Null unless the caller asked for copy-dialog departments.
   * Compound labels still match F&B Cafe.
   */
  department: string | null;
  /** Linked master department names. Empty unless copy-dialog departments were requested. */
  departmentNames: string[];
  /** Linked master department codes (FB, FB_CAFE, …). */
  departmentCodes: string[];
};

async function syncRosterLeaveRecord(
  supabase: AuthContext["supabase"],
  input: {
    locationId: string;
    staffId: string;
    workDate: string;
    leaveType: RosterLeaveType | null;
    compOffForDate?: string | null;
    compOffNote?: string | null;
    userId: string;
  },
) {
  if (input.leaveType) {
    const { data: existingLeave, error: existingErr } = await supabase
      .from("attendance_leave_records")
      .select("leave_type, notes")
      .eq("staff_id", input.staffId)
      .eq("leave_date", input.workDate)
      .maybeSingle();
    if (existingErr) throw existingErr;

    const isCompOff = input.leaveType === "comp_off";
    const previousWasCompOff = existingLeave?.leave_type === "comp_off";
    let notes: string | null = (existingLeave?.notes as string | null | undefined) ?? null;
    if (isCompOff) notes = input.compOffNote?.trim() || null;
    else if (previousWasCompOff) notes = null;

    const { error } = await supabase.from("attendance_leave_records").upsert(
      {
        location_id: input.locationId,
        staff_id: input.staffId,
        leave_date: input.workDate,
        leave_type: input.leaveType,
        source: "roster_amend",
        notes,
        comp_off_for_date: isCompOff ? input.compOffForDate : null,
        created_by: input.userId,
      },
      { onConflict: "staff_id,leave_date" },
    );
    if (error && missingCompOffColumn(error)) {
      throw new Error("Comp off date cannot be saved until the leave migration is applied.");
    }
    if (error) throw error;
    return;
  }
  // Day status left leave — clear the leave row so attendance matches On duty / Week off.
  const { error } = await supabase
    .from("attendance_leave_records")
    .delete()
    .eq("staff_id", input.staffId)
    .eq("leave_date", input.workDate);
  if (error) throw error;
}

async function assertCanAmendRoster(context: Pick<AuthContext, "userId" | "roles">) {
  await assertCanManageMonthlyRoster(context.userId);
}

type RosterActor = {
  /**
   * Null when this login can read the company roster.
   * Otherwise this manager's reporting line: direct reports and each
   * supervisor's team, including people who have no roster row yet.
   */
  teamIds: string[] | null;
  /** Team rows sit at sites the login role cannot open, so those reads and writes use the admin client. */
  db: AuthContext["supabase"];
};

/** Keep PostgREST `.in()` URLs under the gateway limit. */
const ROSTER_ID_CHUNK = 80;

type RosterAssignStaffRow = {
  id: string;
  employee_code: string | null;
  full_name: string | null;
  qid: string | null;
  status: string | null;
  employment_type: string | null;
  location_id: string | null;
};

function rosterAssignStaffOption(row: RosterAssignStaffRow) {
  return {
    id: String(row.id),
    employee_code: row.employee_code ?? null,
    full_name: row.full_name ?? null,
  };
}

function isAssignableRosterStaffRow(row: {
  status?: string | null;
  employment_type?: string | null;
}): boolean {
  return isRosterAssignableStaffStatus(row.status) && !isJokerStaff(row);
}

/** Non-deleted, non-joker staff, paged past PostgREST max_rows, then kept when the status is assignable. */
async function fetchAssignableStaffRows(
  db: AuthContext["supabase"],
  locationIds: string[] | null,
): Promise<RosterAssignStaffRow[]> {
  const locationChunks = locationIds == null ? [null as string[] | null] : chunkIds(locationIds, ROSTER_ID_CHUNK);
  const seen = new Set<string>();
  const out: RosterAssignStaffRow[] = [];
  for (const locChunk of locationChunks) {
    if (locChunk && locChunk.length === 0) continue;
    const page = await collectPagedRows<RosterAssignStaffRow>(async (from, to) => {
      let q = db
        .from("staff")
        .select("id, employee_code, full_name, qid, status, employment_type, location_id")
        .is("deleted_at", null)
        .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
        .order("id", { ascending: true })
        .range(from, to);
      if (locChunk) q = q.in("location_id", locChunk);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RosterAssignStaffRow[];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    for (const row of page) {
      const id = String(row.id);
      if (!id || seen.has(id) || !isAssignableRosterStaffRow(row)) continue;
      seen.add(id);
      out.push(row);
    }
  }
  return out;
}

async function fetchStaffRowsByIds(
  db: AuthContext["supabase"],
  staffIds: string[],
): Promise<RosterAssignStaffRow[]> {
  const out: RosterAssignStaffRow[] = [];
  for (const ids of chunkIds(staffIds, ROSTER_ID_CHUNK)) {
    const { data, error } = await db
      .from("staff")
      .select("id, employee_code, full_name, qid, status, employment_type, location_id")
      .in("id", ids)
      .is("deleted_at", null)
      .or(STAFF_NOT_JOKER_EMPLOYMENT_OR);
    if (error) throw error;
    out.push(...((data ?? []) as RosterAssignStaffRow[]));
  }
  return out;
}

/**
 * Team-scoped roster names from `staff_profile_ext.reporting_manager_staff_id`.
 * The viewer is included, plus every assignable person under them on the chart.
 * Resigned, terminated, deleted, and jokers stay out.
 */
async function loadTeamRosterStaffIds(userId: string): Promise<string[]> {
  return loadRosterChartStaffIds(userId);
}

async function loadExtraLocationIdsByStaff(
  db: AuthContext["supabase"],
  staffIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const ids of chunkIds(staffIds, ROSTER_ID_CHUNK)) {
    const { data, error } = await db
      .from("staff_work_locations")
      .select("staff_id, location_id")
      .in("staff_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      const locationId = row.location_id ? String(row.location_id) : "";
      if (!staffId || !locationId) continue;
      const list = map.get(staffId) ?? [];
      list.push(locationId);
      map.set(staffId, list);
    }
  }
  return map;
}

/** Team members whose home or extra site is the selected location. */
async function rosterTeamIdsAtLocation(
  db: AuthContext["supabase"],
  staffIds: string[],
  locationId: string,
): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const [profiles, extras] = await Promise.all([
    fetchStaffRowsByIds(db, staffIds),
    loadExtraLocationIdsByStaff(db, staffIds),
  ]);
  const allowed = rosterStaffIdsAtLocation(
    profiles.map((row) => ({
      staffId: String(row.id),
      homeLocationId: row.location_id,
      extraLocationIds: extras.get(String(row.id)) ?? [],
    })),
    locationId,
  );
  return new Set(allowed ?? []);
}

/** Names for team rows that have no assignment in the selected period. */
async function loadRosterTeamStaffProfiles(
  db: AuthContext["supabase"],
  staffIds: string[],
): Promise<RosterMatrixStaff[]> {
  const rows = await fetchStaffRowsByIds(db, staffIds);
  return rows
    .filter((row) => isAssignableRosterStaffRow(row))
    .map((row) => ({
      staffId: String(row.id),
      staffName: row.full_name ?? null,
      employeeCode: row.employee_code ?? null,
      qid: row.qid ?? null,
    }));
}

function canViewCompanyRoster(roles: AppRole[]): boolean {
  return (
    canUserDo(roles, "people.view_roster") ||
    canUserDo(roles, "people.import_roster") ||
    canUserDo(roles, "people.edit_roster") ||
    canUserDo(roles, "daily_ops.roster.upload") ||
    canUserDo(roles, "attendance.view")
  );
}

/**
 * Null means the company roster (every stored row).
 * A supervisor title is limited to their chart subtree plus themselves, even when the role can open the company roster.
 * A manager keeps the company roster when their role already has it.
 */
async function resolveRosterTeamIds(userId: string, roles: AppRole[]): Promise<string[] | null> {
  const viewer = await loadLinkedStaffIdentity(userId);
  if (isManagerTeamSupervisor(viewer.jobTitle, viewer.staffRole)) {
    return loadTeamRosterStaffIds(userId);
  }
  if (canViewCompanyRoster(roles)) return null;
  return loadTeamRosterStaffIds(userId);
}

/** Same split listUploadedRosterAssignments uses: company client, or admin for a reporting manager. */
async function resolveRosterActor(context: AuthContext): Promise<RosterActor> {
  const roles = (context.roles ?? []) as AppRole[];
  const teamIds = await resolveRosterTeamIds(context.userId, roles);
  if (teamIds == null) return { teamIds: null, db: context.supabase };
  return { teamIds, db: supabaseAdmin };
}

function assertRosterTeamStaff(actor: RosterActor, staffId: string) {
  if (actor.teamIds && !actor.teamIds.includes(staffId)) {
    throw new ForbiddenError("Forbidden: missing capability to amend the shift roster.");
  }
}

async function assertRosterWriteLocation(actor: RosterActor, context: AuthContext, locationId: string) {
  if (actor.teamIds) return;
  await assertAttendanceRosterLocation(context, locationId);
}

/** Role check lives in assertCanAmendRoster so a Roles-page deny cannot block edit/delete. */
const rosterAmendAuth = { auth: { requireRole: true } } as const;

function assertCanViewRosterRegister(roles: AppRole[] | string[] | undefined) {
  const list = (roles ?? []) as AppRole[];
  if (
    canUserDo(list, "people.view_roster") ||
    canUserDo(list, "people.import_roster") ||
    canUserDo(list, "people.edit_roster") ||
    canUserDo(list, "daily_ops.roster.upload") ||
    canUserDo(list, "attendance.view")
  ) {
    return;
  }
  throw new ForbiddenError("Forbidden: missing capability to view the shift roster.");
}

/** Staff linked to a master department via staff_departments (same as attendance HR reports). */
async function staffIdsForDepartment(
  supabase: AuthContext["supabase"],
  departmentId: string,
): Promise<string[]> {
  const { data: links, error } = await supabase
    .from("staff_departments")
    .select("staff_id")
    .eq("department_id", departmentId);
  if (error) throw error;
  return [...new Set((links ?? []).map((row) => row.staff_id).filter((id): id is string => Boolean(id)))];
}

/** Staff to drop when departments are unchecked. Empty exclusion set skips the lookup. */
async function hiddenStaffIdsForExcludedDepartments(
  supabase: AuthContext["supabase"],
  excludedDepartmentIds: readonly string[] | null | undefined,
): Promise<Set<string>> {
  const excluded = [...new Set((excludedDepartmentIds ?? []).filter(Boolean))];
  if (excluded.length === 0) return new Set();

  const candidateIds = new Set<string>();
  for (const ids of chunkIds(excluded, 200)) {
    const { data, error } = await supabase.from("staff_departments").select("staff_id").in("department_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.staff_id) candidateIds.add(String(row.staff_id));
    }
  }
  if (candidateIds.size === 0) return new Set();

  const links: { staffId: string; departmentId: string }[] = [];
  for (const ids of chunkIds([...candidateIds], 200)) {
    const { data, error } = await supabase
      .from("staff_departments")
      .select("staff_id, department_id")
      .in("staff_id", ids);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.staff_id && row.department_id) {
        links.push({ staffId: String(row.staff_id), departmentId: String(row.department_id) });
      }
    }
  }
  return rosterHiddenStaffIds(links, excluded);
}

/** Staff linked to at least one of these departments. People with no department are absent. */
async function staffIdsLinkedToDepartments(
  supabase: AuthContext["supabase"],
  departmentIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(departmentIds.filter(Boolean))];
  const shown = new Set<string>();
  if (ids.length === 0) return shown;
  for (const chunk of chunkIds(ids, 200)) {
    const { data, error } = await supabase.from("staff_departments").select("staff_id").in("department_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.staff_id) shown.add(String(row.staff_id));
    }
  }
  return shown;
}

type RosterCopyDepartmentLabel = {
  legacy: string | null;
  names: string[];
  codes: string[];
};

function emptyDepartmentLabel(): RosterCopyDepartmentLabel {
  return { legacy: null, names: [], codes: [] };
}

function pushUniqueLabel(list: string[], value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || list.includes(trimmed)) return;
  list.push(trimmed);
}

function masterDepartmentJoin(
  value:
    | { name?: string | null; code?: string | null }
    | { name?: string | null; code?: string | null }[]
    | null
    | undefined,
): { name?: string | null; code?: string | null } | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Legacy department text plus linked master name/code. Used to match F&B Cafe without a second copier. */
async function loadRosterCopyDepartmentLabels(
  supabase: AuthContext["supabase"],
  staffIds: readonly string[],
): Promise<Map<string, RosterCopyDepartmentLabel>> {
  const labels = new Map<string, RosterCopyDepartmentLabel>();
  const ids = [...new Set(staffIds.filter(Boolean))];
  for (const id of ids) labels.set(id, emptyDepartmentLabel());
  for (const chunk of chunkIds(ids, 200)) {
    const { data: staffRows, error: staffError } = await supabase.from("staff").select("id, department").in("id", chunk);
    if (staffError) throw staffError;
    for (const row of staffRows ?? []) {
      const bucket = labels.get(String(row.id));
      if (bucket) bucket.legacy = (row.department as string | null) ?? null;
    }
    const { data: links, error: linkError } = await supabase
      .from("staff_departments")
      .select("staff_id, master_departments(name, code)")
      .in("staff_id", chunk);
    if (linkError) throw linkError;
    for (const link of links ?? []) {
      const bucket = labels.get(String(link.staff_id));
      if (!bucket) continue;
      const department = masterDepartmentJoin(
        link.master_departments as
          | { name?: string | null; code?: string | null }
          | { name?: string | null; code?: string | null }[]
          | null,
      );
      pushUniqueLabel(bucket.names, department?.name);
      pushUniqueLabel(bucket.codes, department?.code);
    }
  }
  return labels;
}

export const listUploadedRosterAssignments = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    /** Unchecked departments. Empty keeps every department on the roster. */
    excludedDepartmentIds: z.array(z.string().uuid()).optional(),
    /**
     * View filter. When set, and no departments are excluded above, keep only
     * staff linked to one of these master departments.
     */
    showOnlyDepartmentIds: z.array(z.string().uuid()).optional(),
    dateFrom: ymd,
    dateTo: ymd,
    /** When true, only upload + amend rows (legacy import register). */
    sourceUploadOnly: z.boolean().optional().default(false),
    /** Optional single-source filter. Ignored when sourceUploadOnly is true. */
    source: z.enum(["upload", "amend", "manual", "copied"]).nullable().optional(),
    /** Attach department name/code so the copy dialog can offer F&B Cafe. */
    includeCopyDepartments: z.boolean().optional().default(false),
    /**
     * Location coverage chips only need location and staff ids for this date window.
     * Skips names, shifts, leave, and departments so the month grid is not waiting
     * on a second full enrich of the same rows.
     */
    coverageOnly: z.boolean().optional().default(false),
  }),
  async (data, context) => {
    const roles = (context.roles ?? []) as AppRole[];
    const teamIds = await resolveRosterTeamIds(context.userId, roles);
    const companyRoster = teamIds == null;
    if (!companyRoster && teamIds.length === 0) {
      throw new ForbiddenError("Forbidden: missing capability to view the shift roster.");
    }
    const cardLocationsPromise =
      data.coverageOnly || data.includeCopyDepartments
        ? teamIds
          ? loadAssignedTeamLocations(teamIds)
          : Promise.resolve(null)
        : Promise.resolve(null);

    if (teamIds && data.staffId && !teamIds.includes(data.staffId)) {
      return {
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        count: 0,
        rows: [] as RosterRegisterRow[],
        teamStaff: [] as RosterMatrixStaff[],
        cardLocations: await cardLocationsPromise,
      };
    }
    if (data.locationId && companyRoster) await assertAttendanceRosterLocation(context, data.locationId);
    // Team rows live at the sites people punch, which the manager's role locations do not include.
    const db = teamIds ? supabaseAdmin : context.supabase;

    let deptStaffIds: string[] | null = null;
    if (data.departmentId) {
      deptStaffIds = await staffIdsForDepartment(db, data.departmentId);
      if (teamIds) {
        const allow = new Set(teamIds);
        deptStaffIds = deptStaffIds.filter((id) => allow.has(id));
      }
      if (deptStaffIds.length === 0) {
        return {
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          count: 0,
          rows: [] as RosterRegisterRow[],
          teamStaff: [] as RosterMatrixStaff[],
          cardLocations: await cardLocationsPromise,
        };
      }
    }

    // Page past PostgREST max_rows (~1000). A bare .limit(5000) still returns only ~1000 and
    // silently drops later FEC-month days (ordered work_date ASC) — then client staff filters
    // look like "18 rows / empty Sept 15–27" for a complete upload.
    type AssignmentPageRow = {
      id: string;
      location_id: string;
      staff_id: string;
      work_date: string;
      shift_template_id: string | null;
      shift_start: string | null;
      shift_end: string | null;
      is_week_off: boolean | null;
      source: string | null;
      created_at: string | null;
    };
    const staffIn = data.staffId ? null : (deptStaffIds ?? teamIds);
    const staffChunks: Array<string[] | null> =
      staffIn == null ? [null] : staffIn.length === 0 ? [] : chunkIds(staffIn, ROSTER_ID_CHUNK);
    const assignmentPages = await Promise.all(
      staffChunks.map((staffChunk) =>
        collectPagedRowsInWaves<AssignmentPageRow>(async (from, to) => {
          let q = db
            .from("attendance_roster_assignments")
            .select(
              "id, location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off, source, created_at",
            )
            .gte("work_date", data.dateFrom)
            .lte("work_date", data.dateTo)
            .order("work_date", { ascending: true })
            .order("staff_id", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to);

          if (data.locationId) q = q.eq("location_id", data.locationId);
          if (data.staffId) q = q.eq("staff_id", data.staffId);
          else if (staffChunk) q = q.in("staff_id", staffChunk);
          if (data.sourceUploadOnly) q = q.in("source", ["upload", "amend"]);
          else if (data.source) q = q.eq("source", data.source);

          const { data: page, error } = await q;
          if (error) throw error;
          return (page ?? []) as AssignmentPageRow[];
        }, ATTENDANCE_DAILY_LIST_PAGE_SIZE),
      ),
    );
    let assignments: AssignmentPageRow[] = assignmentPages.flat();

    let hiddenStaff: Set<string> | null = null;
    let shownStaff: Set<string> | null = null;
    if (data.excludedDepartmentIds?.length) {
      const hidden = await hiddenStaffIdsForExcludedDepartments(db, data.excludedDepartmentIds);
      hiddenStaff = hidden;
      if (hidden.size > 0) {
        assignments = assignments.filter((row) => !hidden.has(String(row.staff_id)));
      }
    } else if (data.showOnlyDepartmentIds?.length) {
      const shown = await staffIdsLinkedToDepartments(db, data.showOnlyDepartmentIds);
      shownStaff = shown;
      assignments = assignments.filter((row) => shown.has(String(row.staff_id)));
    }

    let locationStaffIds: Set<string> | null = null;
    if (teamIds && data.locationId) {
      locationStaffIds = await rosterTeamIdsAtLocation(db, teamIds, data.locationId);
      const allowed = locationStaffIds;
      assignments = rosterRowsForAssignedStaff(
        assignments.map((row) => ({ ...row, staffId: String(row.staff_id) })),
        allowed,
      ).map(({ staffId: _staffId, ...row }) => row);
    }

    if (data.coverageOnly) {
      const rows = assignments.map((row) => ({
        id: String(row.id),
        locationId: String(row.location_id),
        locationCode: null,
        locationName: null,
        staffId: String(row.staff_id),
        staffName: null,
        employeeCode: null,
        qid: null,
        workDate: String(row.work_date).slice(0, 10),
        shiftStart: row.shift_start ? String(row.shift_start).slice(0, 5) : null,
        shiftEnd: row.shift_end ? String(row.shift_end).slice(0, 5) : null,
        shiftTemplateId: row.shift_template_id,
        isWeekOff: Boolean(row.is_week_off),
        leaveType: null,
        compOffForDate: null,
        compOffNote: null,
        source: String(row.source ?? "manual"),
        flexibleAttendance: false,
        department: null,
        departmentNames: [] as string[],
        departmentCodes: [] as string[],
      }));
      return {
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        count: rows.length,
        rows,
        teamStaff: null as RosterMatrixStaff[] | null,
        /** Null for a company roster. Assigned home and extra sites for a team roster. */
        cardLocations: await cardLocationsPromise,
      };
    }

    const staffIds = [...new Set(assignments.map((row) => String(row.staff_id)).filter(Boolean))];
    const locationIds = [...new Set(assignments.map((row) => String(row.location_id)).filter(Boolean))];
    const shiftIds = [
      ...new Set(
        assignments
          .map((row) => row.shift_template_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    type RosterStaffLookup = {
      id: string;
      full_name: string | null;
      employee_code: string | null;
      qid: string | null;
      flexible_attendance: boolean | null;
    };
    type LeaveHit = {
      leaveType: RosterLeaveType;
      compOffForDate: string | null;
      compOffNote: string | null;
    };

    const loadLeaveByStaffDate = async () => {
      const leaveByStaffDate = new Map<string, LeaveHit>();
      if (!staffIds.length) return leaveByStaffDate;
      const chunkMaps = await Promise.all(
        chunkIds(staffIds, 200).map(async (staffChunk) => {
          const leaveRows = await collectPagedRowsInWaves<{
            staff_id: string;
            leave_date: string;
            leave_type: string;
            notes: string | null;
            comp_off_for_date: string | null;
          }>(async (from, to) => {
          type LeavePageRow = {
            staff_id: string;
            leave_date: string;
            leave_type: string;
            notes: string | null;
            comp_off_for_date: string | null;
          };
          const filters = <Q extends { gte: Function; lte: Function; in: Function; order: Function; range: Function }>(
            query: Q,
          ) =>
            query
              .gte("leave_date", data.dateFrom)
              .lte("leave_date", data.dateTo)
              .in("staff_id", staffChunk)
              .order("leave_date", { ascending: true })
              .order("staff_id", { ascending: true })
              .range(from, to);
          const withDate = await filters(
            db
              .from("attendance_leave_records")
              .select("staff_id, leave_date, leave_type, notes, comp_off_for_date"),
          );
          if (withDate.error && missingCompOffColumn(withDate.error)) {
            const legacy = await filters(
              db.from("attendance_leave_records").select("staff_id, leave_date, leave_type, notes"),
            );
            if (legacy.error) throw legacy.error;
            return ((legacy.data ?? []) as Array<Omit<LeavePageRow, "comp_off_for_date">>).map((row) => ({
              staff_id: String(row.staff_id),
              leave_date: String(row.leave_date),
              leave_type: String(row.leave_type),
              notes: row.notes ?? null,
              comp_off_for_date: null,
            }));
          }
          if (withDate.error) throw withDate.error;
          return (withDate.data ?? []) as unknown as LeavePageRow[];
        }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
          const chunkLeaves = new Map<string, LeaveHit>();
          for (const leave of leaveRows) {
            const leaveType = String(leave.leave_type);
            if (!isRosterLeaveType(leaveType)) continue;
            const forDate = leave.comp_off_for_date ? String(leave.comp_off_for_date).slice(0, 10) : null;
            chunkLeaves.set(`${String(leave.staff_id)}|${String(leave.leave_date).slice(0, 10)}`, {
              leaveType,
              compOffForDate: leaveType === "comp_off" ? forDate : null,
              compOffNote: leaveType === "comp_off" ? (leave.notes?.trim() || null) : null,
            });
          }
          return chunkLeaves;
        }),
      );
      for (const chunkLeaves of chunkMaps) {
        for (const [key, value] of chunkLeaves) leaveByStaffDate.set(key, value);
      }
      return leaveByStaffDate;
    };

    const loadTeamStaff = async () => {
      if (!teamIds) return null as RosterMatrixStaff[] | null;
      let ids = teamIds;
      if (data.staffId) ids = ids.filter((id) => id === data.staffId);
      if (deptStaffIds) {
        const allow = new Set(deptStaffIds);
        ids = ids.filter((id) => allow.has(id));
      }
      if (hiddenStaff) {
        const hidden = hiddenStaff;
        ids = ids.filter((id) => !hidden.has(id));
      }
      if (shownStaff) {
        const shown = shownStaff;
        ids = ids.filter((id) => shown.has(id));
      }
      if (locationStaffIds) {
        const allowed = locationStaffIds;
        ids = ids.filter((id) => allowed.has(id));
      }
      return loadRosterTeamStaffProfiles(db, ids);
    };

    const [staffPages, locRes, shiftRes, departmentLabels, leaveByStaffDate, teamStaff] = await Promise.all([
      Promise.all(
        chunkIds(staffIds, ROSTER_ID_CHUNK).map(async (ids) => {
          const { data: staffPage, error } = await db
            .from("staff")
            .select("id, full_name, employee_code, qid, flexible_attendance")
            .in("id", ids);
          if (error) throw error;
          return (staffPage ?? []) as RosterStaffLookup[];
        }),
      ),
      locationIds.length
        ? db.from("locations").select("id, code, name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      shiftIds.length
        ? db.from("attendance_shift_templates").select("id, start_time, end_time, name").in("id", shiftIds)
        : Promise.resolve({ data: [], error: null }),
      data.includeCopyDepartments
        ? loadRosterCopyDepartmentLabels(db, staffIds)
        : Promise.resolve(new Map<string, RosterCopyDepartmentLabel>()),
      loadLeaveByStaffDate(),
      loadTeamStaff(),
    ]);
    if (locRes.error) throw locRes.error;
    if (shiftRes.error) throw shiftRes.error;
    const staffRows = staffPages.flat();

    const staffById = new Map(staffRows.map((row) => [String(row.id), row]));
    const locById = new Map((locRes.data ?? []).map((row) => [String(row.id), row]));
    const shiftById = new Map((shiftRes.data ?? []).map((row) => [String(row.id), row]));

    const mapped: RosterRegisterRow[] = assignments.map((row) => {
      const staff = staffById.get(String(row.staff_id));
      const loc = locById.get(String(row.location_id));
      const shift = row.shift_template_id ? shiftById.get(String(row.shift_template_id)) : undefined;
      const startFromRow = (row as { shift_start?: string | null }).shift_start;
      const endFromRow = (row as { shift_end?: string | null }).shift_end;
      const workDate = String(row.work_date).slice(0, 10);
      const leave = leaveByStaffDate.get(`${String(row.staff_id)}|${workDate}`) ?? null;
      return {
        id: String(row.id),
        locationId: String(row.location_id),
        locationCode: (loc?.code as string | null | undefined) ?? null,
        locationName: (loc?.name as string | null | undefined) ?? null,
        staffId: String(row.staff_id),
        staffName: (staff?.full_name as string | null | undefined) ?? null,
        employeeCode: (staff?.employee_code as string | null | undefined) ?? null,
        qid: (staff?.qid as string | null | undefined) ?? null,
        workDate,
        shiftStart: startFromRow
          ? String(startFromRow).slice(0, 5)
          : shift?.start_time
            ? String(shift.start_time).slice(0, 5)
            : null,
        shiftEnd: endFromRow
          ? String(endFromRow).slice(0, 5)
          : shift?.end_time
            ? String(shift.end_time).slice(0, 5)
            : null,
        shiftTemplateId: (row.shift_template_id as string | null) ?? null,
        isWeekOff: Boolean(row.is_week_off),
        leaveType: leave?.leaveType ?? null,
        compOffForDate: leave?.compOffForDate ?? null,
        compOffNote: leave?.compOffNote ?? null,
        source: String(row.source ?? "manual"),
        flexibleAttendance: Boolean(staff?.flexible_attendance),
        department: departmentLabels.get(String(row.staff_id))?.legacy ?? null,
        departmentNames: departmentLabels.get(String(row.staff_id))?.names ?? [],
        departmentCodes: departmentLabels.get(String(row.staff_id))?.codes ?? [],
      };
    });

    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      count: mapped.length,
      rows: mapped,
      /** Null for company roster viewers. Chart subtree plus the viewer for a team-scoped login, even with no shifts. */
      teamStaff,
      /** Null for a company roster. Assigned home and extra sites for a team roster. */
      cardLocations: await cardLocationsPromise,
    };
  },
  {
    auth: {
      anyCapability: [
        "people.view_roster",
        "people.import_roster",
        "people.edit_roster",
        "daily_ops.roster.upload",
        "attendance.view",
        "hr.employee_app",
      ],
    },
  },
);

/**
 * Staff the add-shift dialog can place on a day.
 * Company roster viewers get every assignable employee, paged past 1,000.
 * A team-scoped login gets their own name and everyone under them on the chart.
 */
export const listRosterAssignStaff = createAuthenticatedActionNoInput(async (context) => {
  const roles = (context.roles ?? []) as AppRole[];
  let rows: RosterAssignStaffRow[];
  const teamIds = await resolveRosterTeamIds(context.userId, roles);
  if (teamIds == null) {
    rows = await fetchAssignableStaffRows(supabaseAdmin, null);
  } else {
    await assertCanAmendRoster(context);
    const ids = teamIds;
    const scoped = await fetchStaffRowsByIds(supabaseAdmin, ids);
    rows = scoped.filter((row) => isAssignableRosterStaffRow(row));
  }
  return rows
    .map(rosterAssignStaffOption)
    .sort((a, b) =>
      (a.full_name || a.employee_code || a.id).localeCompare(b.full_name || b.employee_code || b.id, undefined, {
        sensitivity: "base",
      }),
    );
}, rosterAmendAuth);

/** Create one assignment on a day that has none yet. Same row the amend pencil edits. */
export const createRosterAssignment = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    staffId: z.string().uuid(),
    workDate: ymd,
    shiftStart: z.string().nullable().optional(),
    shiftEnd: z.string().nullable().optional(),
    dayStatus: z.enum(["on_duty", "weekly_off", "annual_leave", "sick_leave", "comp_off"]),
    compOffForDate: ymd.nullable().optional(),
    compOffNote: z.string().max(500).nullable().optional(),
  }),
  async (data, context) => {
    await assertCanAmendRoster(context);
    const actor = await resolveRosterActor(context);
    const db = actor.db;
    assertRosterTeamStaff(actor, data.staffId);
    await assertRosterWriteLocation(actor, context, data.locationId);

    const patch = rosterPatchFromDayStatus(data.dayStatus);
    const compOffForDate = data.dayStatus === "comp_off" ? (data.compOffForDate ?? null) : null;
    const compOffNote = data.dayStatus === "comp_off" ? (data.compOffNote ?? "").trim() : null;
    if (data.dayStatus === "comp_off") {
      if (!compOffForDate) throw new Error("Comp off requires the date it is taken for.");
      if (!compOffNote) throw new Error("Comp off requires a short note.");
    }

    const { data: existing, error: existingErr } = await db
      .from("attendance_roster_assignments")
      .select("id")
      .eq("staff_id", data.staffId)
      .eq("work_date", data.workDate)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) throw new Error("This person already has a roster row on that day.");

    let shiftTemplateId: string | null = null;
    let shiftStart: string | null = null;
    let shiftEnd: string | null = null;
    if (patch.needsShiftTimes) {
      shiftStart = parseHm(data.shiftStart);
      shiftEnd = parseHm(data.shiftEnd);
      if (!shiftStart || !shiftEnd) {
        throw new Error("On-duty rows need both shift start and end times.");
      }
      const shifts = await loadActiveShiftTemplates(db);
      shiftTemplateId = matchShiftTemplate(shiftStart, shiftEnd, data.locationId, shifts);
    }

    const { data: inserted, error: insErr } = await db
      .from("attendance_roster_assignments")
      .insert({
        location_id: data.locationId,
        staff_id: data.staffId,
        work_date: data.workDate,
        is_week_off: patch.isWeekOff,
        shift_template_id: patch.needsShiftTimes ? shiftTemplateId : null,
        shift_start: patch.needsShiftTimes ? shiftStart : null,
        shift_end: patch.needsShiftTimes ? shiftEnd : null,
        source: "manual",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw insErr ?? new Error("Could not add the roster row.");

    await syncRosterLeaveRecord(db, {
      locationId: data.locationId,
      staffId: data.staffId,
      workDate: data.workDate,
      leaveType: patch.leaveType,
      compOffForDate,
      compOffNote,
      userId: context.userId,
    });
    await recalculateAttendanceRange(db, data.locationId, data.workDate, data.workDate, {
      staffIds: [data.staffId],
    });

    return {
      id: String(inserted.id),
      locationId: data.locationId,
      staffId: data.staffId,
      workDate: data.workDate,
      dayStatus: data.dayStatus,
      shiftStart: patch.needsShiftTimes ? shiftStart : null,
      shiftEnd: patch.needsShiftTimes ? shiftEnd : null,
    };
  },
  rosterAmendAuth,
);

export const updateRosterAssignment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    shiftStart: z.string().nullable().optional(),
    shiftEnd: z.string().nullable().optional(),
    isWeekOff: z.boolean().optional(),
    /** Preferred over isWeekOff when set — weekly off / leave / comp off / on duty. */
    dayStatus: z.enum(["on_duty", "weekly_off", "annual_leave", "sick_leave", "comp_off"]).optional(),
    /** Worked day this comp-off is taken for. Required when dayStatus is comp_off. */
    compOffForDate: ymd.nullable().optional(),
    /** Short explanation. Required when dayStatus is comp_off. Stored on leave notes. */
    compOffNote: z.string().max(500).nullable().optional(),
  }),
  async (data, context) => {
    await assertCanAmendRoster(context);
    const actor = await resolveRosterActor(context);
    const db = actor.db;

    const { data: existing, error: fetchErr } = await db
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off, source")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    assertRosterTeamStaff(actor, String(existing.staff_id));
    const existingLocationId = String(existing.location_id);
    await assertRosterWriteLocation(actor, context, existingLocationId);

    const nextLocationId = data.locationId ?? existingLocationId;
    if (nextLocationId !== existingLocationId) {
      await assertRosterWriteLocation(actor, context, nextLocationId);
    }

    const dayStatus: RosterDayStatus | null = data.dayStatus ?? null;
    const patch = dayStatus
      ? rosterPatchFromDayStatus(dayStatus)
      : {
          isWeekOff: data.isWeekOff ?? Boolean(existing.is_week_off),
          leaveType: null as RosterLeaveType | null,
          needsShiftTimes: !(data.isWeekOff ?? Boolean(existing.is_week_off)),
        };
    // Legacy isWeekOff-only callers: do not clear unrelated leave rows.
    const syncLeave = dayStatus != null;
    const compOffForDate = dayStatus === "comp_off" ? (data.compOffForDate ?? null) : null;
    const compOffNote = dayStatus === "comp_off" ? (data.compOffNote ?? "").trim() : null;
    if (dayStatus === "comp_off") {
      if (!compOffForDate) throw new Error("Comp off requires the date it is taken for.");
      if (!compOffNote) throw new Error("Comp off requires a short note.");
    }

    const isWeekOff = patch.isWeekOff;
    let shiftTemplateId: string | null = null;
    let shiftStart: string | null = null;
    let shiftEnd: string | null = null;

    if (patch.needsShiftTimes) {
      const shifts = await loadActiveShiftTemplates(db);
      const current = shifts.find((s) => s.id === existing.shift_template_id);
      const existingStart = existing.shift_start
        ? String(existing.shift_start).slice(0, 5)
        : current
          ? String(current.start_time).slice(0, 5)
          : null;
      const existingEnd = existing.shift_end
        ? String(existing.shift_end).slice(0, 5)
        : current
          ? String(current.end_time).slice(0, 5)
          : null;
      const incomingStart = data.shiftStart !== undefined ? parseHm(data.shiftStart) : undefined;
      const incomingEnd = data.shiftEnd !== undefined ? parseHm(data.shiftEnd) : undefined;
      shiftStart = incomingStart !== undefined ? incomingStart : existingStart;
      shiftEnd = incomingEnd !== undefined ? incomingEnd : existingEnd;
      if (!shiftStart || !shiftEnd) {
        throw new Error("On-duty rows need both shift start and end times.");
      }
      // Match an existing template when possible; times on the row are enough if none match.
      // Avoid creating templates on amend (no HR company / RLS create failures).
      const matched = matchShiftTemplate(shiftStart, shiftEnd, nextLocationId, shifts);
      const timesUnchanged =
        shiftStart === existingStart && shiftEnd === existingEnd && nextLocationId === existingLocationId;
      shiftTemplateId = matched ?? (timesUnchanged ? ((existing.shift_template_id as string | null) ?? null) : null);
    }

    const { error: updErr } = await db
      .from("attendance_roster_assignments")
      .update({
        location_id: nextLocationId,
        is_week_off: isWeekOff,
        shift_template_id: patch.needsShiftTimes ? shiftTemplateId : null,
        shift_start: patch.needsShiftTimes ? shiftStart : null,
        shift_end: patch.needsShiftTimes ? shiftEnd : null,
        source: existing.source === "upload" || existing.source === "amend" ? "amend" : existing.source,
      })
      .eq("id", data.id);
    if (updErr) throw updErr;

    const workDate = String(existing.work_date).slice(0, 10);
    if (syncLeave) {
      await syncRosterLeaveRecord(db, {
        locationId: nextLocationId,
        staffId: existing.staff_id,
        workDate,
        leaveType: patch.leaveType,
        compOffForDate,
        compOffNote,
        userId: context.userId,
      });
    } else if (nextLocationId !== existingLocationId) {
      // Location-only amend: keep leave type, move the leave row with the assignment.
      const { error: leaveMoveErr } = await db
        .from("attendance_leave_records")
        .update({ location_id: nextLocationId })
        .eq("staff_id", existing.staff_id)
        .eq("leave_date", workDate);
      if (leaveMoveErr) throw leaveMoveErr;
    }

    for (const locationId of rosterAmendRecalcLocationIds(existingLocationId, nextLocationId)) {
      await recalculateAttendanceRange(db, locationId, workDate, workDate, {
        staffIds: [existing.staff_id],
      });
    }

    return {
      id: data.id,
      locationId: nextLocationId,
      isWeekOff,
      leaveType: patch.leaveType,
      dayStatus: dayStatus ?? (isWeekOff ? "weekly_off" : "on_duty"),
      shiftStart: patch.needsShiftTimes ? shiftStart : null,
      shiftEnd: patch.needsShiftTimes ? shiftEnd : null,
      shiftTemplateId: patch.needsShiftTimes ? shiftTemplateId : null,
    };
  },
  rosterAmendAuth,
);

export const deleteRosterAssignment = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    await assertCanAmendRoster(context);
    const actor = await resolveRosterActor(context);
    const db = actor.db;

    const { data: existing, error: fetchErr } = await db
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    assertRosterTeamStaff(actor, String(existing.staff_id));
    await assertRosterWriteLocation(actor, context, existing.location_id);

    const { error: delErr } = await db
      .from("attendance_roster_assignments")
      .delete()
      .eq("id", data.id);
    if (delErr) throw delErr;

    const workDate = String(existing.work_date).slice(0, 10);
    // Clear roster-amend leave only; HR leave stays if the day was leave outside this UI.
    await db
      .from("attendance_leave_records")
      .delete()
      .eq("staff_id", existing.staff_id)
      .eq("leave_date", workDate)
      .eq("source", "roster_amend");

    await recalculateAttendanceRange(db, existing.location_id, workDate, workDate, {
      staffIds: [existing.staff_id],
    });

    return { ok: true as const, id: data.id };
  },
  rosterAmendAuth,
);

const rosterScopeInput = z.object({
  locationId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  excludedDepartmentIds: z.array(z.string().uuid()).optional(),
  dateFrom: ymd,
  dateTo: ymd,
  sourceUploadOnly: z.boolean().optional().default(false),
  source: z.enum(["upload", "amend", "manual", "copied"]).nullable().optional(),
  search: z.string().nullable().optional(),
});

type RosterScopeAssignment = {
  id: string;
  location_id: string;
  staff_id: string;
  work_date: string;
  source: string | null;
};

async function fetchRosterAssignmentsInScope(
  supabase: AuthContext["supabase"],
  data: z.infer<typeof rosterScopeInput>,
): Promise<RosterScopeAssignment[]> {
  let deptStaffIds: string[] | null = null;
  if (data.departmentId) {
    deptStaffIds = await staffIdsForDepartment(supabase, data.departmentId);
    if (deptStaffIds.length === 0) return [];
  }

  const assignments = await collectPagedRows<RosterScopeAssignment>(async (from, to) => {
    let q = supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, source")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .order("id", { ascending: true })
      .range(from, to);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    if (deptStaffIds) q = q.in("staff_id", deptStaffIds);
    if (data.sourceUploadOnly) q = q.in("source", ["upload", "amend"]);
    else if (data.source) q = q.eq("source", data.source);

    const { data: page, error } = await q;
    if (error) throw error;
    return (page ?? []) as RosterScopeAssignment[];
  }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);

  if (!data.excludedDepartmentIds?.length) return assignments;
  const hiddenStaff = await hiddenStaffIdsForExcludedDepartments(supabase, data.excludedDepartmentIds);
  if (hiddenStaff.size === 0) return assignments;
  return assignments.filter((row) => !hiddenStaff.has(String(row.staff_id)));
}

async function applyRosterSearchFilter(
  supabase: AuthContext["supabase"],
  assignments: RosterScopeAssignment[],
  search: string,
): Promise<RosterScopeAssignment[]> {
  const q = search.trim();
  if (!q) return assignments;

  const staffIds = [...new Set(assignments.map((row) => String(row.staff_id)).filter(Boolean))];
  const locationIds = [...new Set(assignments.map((row) => String(row.location_id)).filter(Boolean))];
  const staffRows: { id: string; full_name: string | null; employee_code: string | null; qid: string | null }[] = [];
  const locRows: { id: string; code: string | null }[] = [];
  for (const ids of chunkIds(staffIds, 200)) {
    const staffRes = await supabase.from("staff").select("id, full_name, employee_code, qid").in("id", ids);
    if (staffRes.error) throw staffRes.error;
    staffRows.push(...((staffRes.data ?? []) as typeof staffRows));
  }
  for (const ids of chunkIds(locationIds, 200)) {
    const locRes = await supabase.from("locations").select("id, code").in("id", ids);
    if (locRes.error) throw locRes.error;
    locRows.push(...((locRes.data ?? []) as typeof locRows));
  }

  const staffById = new Map(staffRows.map((row) => [String(row.id), row]));
  const locById = new Map(locRows.map((row) => [String(row.id), row]));

  return assignments.filter((row) => {
    const staff = staffById.get(String(row.staff_id));
    const loc = locById.get(String(row.location_id));
    return rosterRowMatchesSearch(
      {
        staffName: staff?.full_name ?? null,
        employeeCode: staff?.employee_code ?? null,
        qid: staff?.qid ?? null,
        locationCode: loc?.code ?? null,
        workDate: String(row.work_date).slice(0, 10),
        source: String(row.source ?? "manual"),
      },
      q,
    );
  });
}

/**
 * Delete roster rows in the selected period that match the current register filters.
 * When `ids` is set, only those rows are removed (still limited to the filtered scope).
 */
export const deleteRosterAssignments = createAuthenticatedAction(
  rosterScopeInput.extend({
    ids: z.array(z.string().uuid()).max(10000).optional(),
  }),
  async (data, context) => {
    await assertCanAmendRoster(context);
    const actor = await resolveRosterActor(context);
    const db = actor.db;
    assertRosterDeletePeriod(data.dateFrom, data.dateTo);
    if (data.locationId) await assertRosterWriteLocation(actor, context, data.locationId);

    const scopedAll = await fetchRosterAssignmentsInScope(db, data);
    const teamScoped = actor.teamIds
      ? scopedAll.filter((row) => actor.teamIds!.includes(String(row.staff_id)))
      : scopedAll;
    const searched = data.search?.trim()
      ? await applyRosterSearchFilter(db, teamScoped, data.search)
      : teamScoped;
    const allowedIds = data.ids ? new Set(data.ids) : null;
    const toDelete = allowedIds
      ? searched.filter((row) => allowedIds.has(String(row.id)))
      : searched;

    if (!toDelete.length) {
      return { ok: true as const, deleted: 0, dateFrom: data.dateFrom, dateTo: data.dateTo };
    }

    const locationIds = [...new Set(toDelete.map((row) => String(row.location_id)))];
    for (const locationId of locationIds) {
      await assertRosterWriteLocation(actor, context, locationId);
    }

    for (const ids of chunkIds(toDelete.map((row) => String(row.id)), 200)) {
      const { error: delErr } = await db
        .from("attendance_roster_assignments")
        .delete()
        .in("id", ids)
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo);
      if (delErr) throw delErr;
    }

    const byLocation = new Map<string, { staffIds: Set<string>; minDate: string; maxDate: string }>();
    for (const row of toDelete) {
      const locationId = String(row.location_id);
      const staffId = String(row.staff_id);
      const workDate = String(row.work_date).slice(0, 10);
      const current = byLocation.get(locationId);
      if (!current) {
        byLocation.set(locationId, { staffIds: new Set([staffId]), minDate: workDate, maxDate: workDate });
        continue;
      }
      current.staffIds.add(staffId);
      if (workDate < current.minDate) current.minDate = workDate;
      if (workDate > current.maxDate) current.maxDate = workDate;
    }

    for (const [locationId, scope] of byLocation) {
      await recalculateAttendanceRange(db, locationId, scope.minDate, scope.maxDate, {
        staffIds: [...scope.staffIds],
      });
    }

    return {
      ok: true as const,
      deleted: toDelete.length,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    };
  },
  rosterAmendAuth,
);

type CopySourceRow = {
  location_id: string;
  staff_id: string;
  work_date: string;
  shift_template_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  is_week_off: boolean;
};

type CopyTargetRow = {
  id: string;
  location_id: string;
  staff_id: string;
  work_date: string;
};

/**
 * Copy assignments in the selected FEC month into the next FEC month.
 * Dates map by day-of-period index (see mapRosterPeriodByDayIndex). Empty cells stay empty.
 * Omit locationIds to copy every site. Pass locationIds to copy only those sites.
 * Pass staffIds to copy only those people. Pass department "fb_cafe" to copy the F&B Cafe team.
 * Each row keeps the location already stored on it.
 * If that target scope already has rows, pass replace=true after UI confirm; otherwise returns needs_replace.
 * All locations replaces every row in the next month.
 * A site filter replaces only those locations. A staff or department filter replaces only those people's rows.
 */
export const copyRosterToNextMonth = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    replace: z.boolean().optional().default(false),
    locationIds: z.array(z.string().uuid()).max(100).optional(),
    staffIds: z.array(z.string().uuid()).max(2000).optional(),
    department: z.enum(["fb_cafe"]).optional(),
  }),
  async (data, context) => {
    await assertCanAmendRoster(context);
    const actor = await resolveRosterActor(context);
    const db = actor.db;

    const source = monthBounds(data.month);
    const targetMonth = nextPayrollMonth(data.month);
    const target = monthBounds(targetMonth);
    assertRosterDeletePeriod(source.dateFrom, source.dateTo);
    assertRosterDeletePeriod(target.dateFrom, target.dateTo);

    const siteFilter = data.locationIds ? [...new Set(data.locationIds)] : null;
    const staffFilter = data.staffIds ? [...new Set(data.staffIds)] : null;
    const siteWise = siteFilter != null;
    if (siteFilter) {
      for (const locationId of siteFilter) {
        await assertRosterWriteLocation(actor, context, locationId);
      }
    }

    const dateMap = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);

    const sourceRowsAll = await collectPagedRows<CopySourceRow>(async (from, to) => {
      const { data: page, error } = await db
        .from("attendance_roster_assignments")
        .select("location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
        .gte("work_date", source.dateFrom)
        .lte("work_date", source.dateTo)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (page ?? []) as CopySourceRow[];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);

    let sourceRows = filterRosterCopyRows(sourceRowsAll, siteFilter, staffFilter ? { staffIds: staffFilter } : null);
    if (data.department) {
      const labelIds = [...new Set(sourceRows.map((row) => String(row.staff_id)))];
      const labels = await loadRosterCopyDepartmentLabels(db, labelIds);
      sourceRows = filterRosterCopyRows(
        sourceRows.map((row) => {
          const label = labels.get(String(row.staff_id));
          return {
            ...row,
            department: label?.legacy ?? null,
            departmentNames: label?.names ?? [],
            departmentCodes: label?.codes ?? [],
          };
        }),
        null,
        { department: data.department },
      );
    }
    if (actor.teamIds) {
      const allow = new Set(actor.teamIds);
      sourceRows = sourceRows.filter((row) => allow.has(String(row.staff_id)));
    }

    if (!sourceRows.length) {
      return {
        status: "empty" as const,
        sourceMonth: data.month,
        targetMonth,
        copied: 0,
        skipped: 0,
        replaced: 0,
        source: source,
        target,
      };
    }

    const peopleScoped = staffFilter != null || Boolean(data.department) || actor.teamIds != null;
    const replaceStaffIds = peopleScoped ? [...new Set(sourceRows.map((row) => String(row.staff_id)))] : null;
    const scopedCopy = siteWise || peopleScoped;

    const rowsInCopyScope = (rows: readonly CopyTargetRow[]) => {
      const byStaff = replaceStaffIds ? filterRosterCopyRows(rows, null, { staffIds: replaceStaffIds }) : rows;
      return siteFilter ? filterRosterCopyRows(byStaff, siteFilter) : byStaff.slice();
    };

    let destinationRows: CopyTargetRow[] | null = null;
    if (scopedCopy) {
      destinationRows = await collectPagedRows<CopyTargetRow>(async (from, to) => {
        const { data: page, error } = await db
          .from("attendance_roster_assignments")
          .select("id, location_id, staff_id, work_date")
          .gte("work_date", target.dateFrom)
          .lte("work_date", target.dateTo)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (page ?? []) as CopyTargetRow[];
      }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    }

    let targetCount = 0;
    if (scopedCopy) {
      targetCount = rowsInCopyScope(destinationRows ?? []).length;
    } else {
      const { count, error } = await db
        .from("attendance_roster_assignments")
        .select("id", { count: "exact", head: true })
        .gte("work_date", target.dateFrom)
        .lte("work_date", target.dateTo);
      if (error) throw error;
      targetCount = count ?? 0;
    }

    if (targetCount > 0 && !data.replace) {
      return {
        status: "needs_replace" as const,
        sourceMonth: data.month,
        targetMonth,
        sourceCount: sourceRows.length,
        targetCount,
        copied: 0,
        skipped: 0,
        replaced: 0,
        source,
        target,
      };
    }

    const locationIds = [...new Set(sourceRows.map((row) => String(row.location_id)))];
    for (const locationId of locationIds) {
      await assertRosterWriteLocation(actor, context, locationId);
    }

    let replaced = 0;
    if (targetCount > 0 && data.replace) {
      const existing = scopedCopy
        ? rowsInCopyScope(destinationRows ?? [])
        : await fetchRosterAssignmentsInScope(db, {
            dateFrom: target.dateFrom,
            dateTo: target.dateTo,
            sourceUploadOnly: false,
          });
      replaced = existing.length;
      for (const ids of chunkIds(existing.map((row) => String(row.id)), 200)) {
        const { error: delErr } = await db
          .from("attendance_roster_assignments")
          .delete()
          .in("id", ids)
          .gte("work_date", target.dateFrom)
          .lte("work_date", target.dateTo);
        if (delErr) throw delErr;
      }
    }

    const protectedKeys = siteWise
      ? rosterCopyProtectedDestinationKeys(destinationRows ?? [], siteFilter)
      : new Set<string>();
    const planned = planRosterCopyByLocation(sourceRows, null, dateMap);

    const payload: {
      location_id: string;
      staff_id: string;
      work_date: string;
      shift_template_id: string | null;
      shift_start: string | null;
      shift_end: string | null;
      is_week_off: boolean;
      source: string;
      created_by: string;
    }[] = [];
    let skipped = planned.skipped;
    for (const row of planned.rows) {
      if (protectedKeys.has(rosterCopyDestinationKey(String(row.staff_id), row.work_date))) {
        skipped += 1;
        continue;
      }
      const isWeekOff = Boolean(row.is_week_off);
      payload.push({
        location_id: String(row.location_id),
        staff_id: String(row.staff_id),
        work_date: row.work_date,
        shift_template_id: isWeekOff ? null : ((row.shift_template_id as string | null) ?? null),
        shift_start: isWeekOff
          ? null
          : row.shift_start
            ? String(row.shift_start).slice(0, 5)
            : null,
        shift_end: isWeekOff ? null : row.shift_end ? String(row.shift_end).slice(0, 5) : null,
        is_week_off: isWeekOff,
        source: "copied",
        created_by: context.userId,
      });
    }

    for (const chunk of chunkIds(payload, 400)) {
      const { error } = await db
        .from("attendance_roster_assignments")
        .upsert(chunk, { onConflict: "staff_id,work_date" });
      if (error) throw error;
    }

    const byLocation = new Map<string, { staffIds: Set<string>; minDate: string; maxDate: string }>();
    for (const row of payload) {
      const current = byLocation.get(row.location_id);
      if (!current) {
        byLocation.set(row.location_id, {
          staffIds: new Set([row.staff_id]),
          minDate: row.work_date,
          maxDate: row.work_date,
        });
        continue;
      }
      current.staffIds.add(row.staff_id);
      if (row.work_date < current.minDate) current.minDate = row.work_date;
      if (row.work_date > current.maxDate) current.maxDate = row.work_date;
    }
    for (const [locationId, scope] of byLocation) {
      await recalculateAttendanceRange(db, locationId, scope.minDate, scope.maxDate, {
        staffIds: [...scope.staffIds],
      });
    }

    await db.from("attendance_audit_events").insert({
      actor_id: context.userId,
      action: "roster.copy_to_next_month",
      entity_type: "attendance_roster_assignments",
      entity_id: null,
      location_id: locationIds[0] ?? null,
      after: {
        sourceMonth: data.month,
        targetMonth,
        sourceFrom: source.dateFrom,
        sourceTo: source.dateTo,
        targetFrom: target.dateFrom,
        targetTo: target.dateTo,
        copied: payload.length,
        skipped,
        replaced,
        mapping: "day_of_period_index",
        locationIds: siteWise ? siteFilter : null,
        staffIds: peopleScoped ? replaceStaffIds : null,
        department: data.department ?? null,
      },
    });

    return {
      status: "ok" as const,
      sourceMonth: data.month,
      targetMonth,
      copied: payload.length,
      skipped,
      replaced,
      source,
      target,
    };
  },
  rosterAmendAuth,
);

async function rosterDownloadLocationCode(
  supabase: AuthContext["supabase"],
  locationId: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("locations").select("code").eq("id", locationId).maybeSingle();
  if (error) return null;
  const code = (data?.code as string | null | undefined)?.trim();
  return code || null;
}

/**
 * Excel of roster rows already stored for the FEC month before `month`,
 * for one location and one department group (operations with maintenance, F&B, or both).
 * Same DATE / EMPLOYEE / LOCATION / SHIFT workbook as the shift-roster sample.
 * An empty selection still returns headers and no invented shifts.
 */
export const downloadPreviousMonthRoster = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    locationId: z.string().uuid(),
    department: z.enum(["operations", "fb", "both"]),
  }),
  async (data, context) => {
    const priorMonth = previousPayrollMonth(data.month);
    const period = monthBounds(priorMonth);
    const department = data.department as PreviousMonthRosterDepartment;
    const listed = await listUploadedRosterAssignments({
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      sourceUploadOnly: false,
      locationId: data.locationId,
      includeCopyDepartments: true,
    });
    const filtered = filterPreviousMonthRosterDownloadRows(listed.rows, {
      locationId: data.locationId,
      department,
    });
    const lines = previousMonthRosterSheetLines(filtered);
    const built = await buildPeopleRosterRowsXlsx(lines, period, { periodMode: "month" });
    if (built.truncated) {
      throw new Error("Previous month roster is too large to download in one file.");
    }
    const locationCode =
      listed.rows.find((row) => row.locationCode)?.locationCode ??
      (await rosterDownloadLocationCode(context.supabase, data.locationId));
    return {
      filename: peopleRosterSampleFilename(period.dateFrom, period.dateTo, locationCode),
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      base64: built.buffer.toString("base64"),
      rowCount: built.rowCount,
      empty: built.rowCount === 0,
      month: priorMonth,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
    };
  },
  {
    auth: {
      anyCapability: [
        "people.view_roster",
        "people.import_roster",
        "people.edit_roster",
        "daily_ops.roster.upload",
        "attendance.view",
        "hr.employee_app",
      ],
    },
  },
);
