import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeShiftHm, scheduledIsoFromHm } from "@/lib/attendance-hr/late-punch";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  isRosterPunchFillSubjectRow,
  mergeRosterPunchFillStaffIds,
  planRosterPunchFill,
  ROSTER_PUNCH_FILL_SOURCE,
  rosterFillAudience,
  rosterFillDates,
  type RosterFillAssignment,
  type RosterFillExistingPunch,
} from "@/lib/attendance-hr/roster-punch-fill";
import {
  loadActiveJokerStaffIdsAtLocations,
  loadDirectReportStaffIds,
  loadManagerTeamStaffIds,
  loadReportingTreeStaffIds,
  loadViewerScopedTeamLocations,
} from "@/lib/reporting-manager-access.server";
import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/authorize";

export type RosterPunchFillStaff = {
  staffId: string;
  fullName: string;
  employeeCode: string | null;
};

export type RosterPunchFillResult = {
  filledDays: number;
  skippedDays: number;
};

type StaffNameRow = {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  status?: string | null;
  employment_type?: string | null;
};

function callerGate(context: AuthContext) {
  const roles = context.roles ?? [];
  const jobTitle = context.access?.jobTitle ?? null;
  const audience = rosterFillAudience({ roles, jobTitle });
  if (!audience) throw new ForbiddenError("You cannot fill missed device punches.");
  return { roles, jobTitle, audience };
}

async function teamStaffIds(userId: string): Promise<Set<string>> {
  const [reports, tree, managerTeam] = await Promise.all([
    loadDirectReportStaffIds(userId),
    loadReportingTreeStaffIds(userId),
    loadManagerTeamStaffIds(userId),
  ]);
  const teamIds = [...reports.directReportStaffIds, ...tree, ...managerTeam.teamStaffIds];
  // Active Jokers are not on the org chart. Union location-scoped jokers so HoO
  // (and any filler) can pick the same people visible on the location roster.
  try {
    const sites = await loadViewerScopedTeamLocations(userId, teamIds);
    const jokerIds = await loadActiveJokerStaffIdsAtLocations(sites.map((site) => site.id));
    return new Set(
      mergeRosterPunchFillStaffIds({
        teamStaffIds: teamIds,
        scopedJokerStaffIds: jokerIds,
      }),
    );
  } catch (error) {
    console.error(
      "[roster-punch-fill] scoped joker union failed",
      error instanceof Error ? error.message : error,
    );
    return new Set(teamIds);
  }
}

async function staffNames(ids: readonly string[]): Promise<RosterPunchFillStaff[]> {
  const rows: StaffNameRow[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code")
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as StaffNameRow[]));
  }
  return rows
    .map((row) => ({
      staffId: String(row.id),
      fullName: String(row.full_name ?? "Staff"),
      employeeCode: row.employee_code ? String(row.employee_code) : null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.staffId.localeCompare(b.staffId));
}

async function companyStaff(): Promise<RosterPunchFillStaff[]> {
  const rows: StaffNameRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code, status, employment_type")
      .is("deleted_at", null)
      .order("full_name")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as StaffNameRow[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows
    .filter((row) =>
      isRosterPunchFillSubjectRow({
        status: row.status,
        employment_type: row.employment_type,
      }),
    )
    .map((row) => ({
      staffId: String(row.id),
      fullName: String(row.full_name ?? "Staff"),
      employeeCode: row.employee_code ? String(row.employee_code) : null,
    }));
}

export async function loadRosterPunchFillStaff(context: AuthContext): Promise<RosterPunchFillStaff[]> {
  const gate = callerGate(context);
  if (gate.audience === "company") return companyStaff();
  const ids = [...(await teamStaffIds(context.userId))];
  if (!ids.length) return [];
  return staffNames(ids);
}

async function assertTargetStaff(context: AuthContext, staffId: string, audience: "company" | "team") {
  if (audience === "team") {
    const allowed = await teamStaffIds(context.userId);
    if (!allowed.has(staffId)) {
      throw new ForbiddenError("You can only fill punches for people on your team.");
    }
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, status, employment_type, deleted_at")
    .eq("id", staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (
    !data ||
    !isRosterPunchFillSubjectRow({
      status: data.status as string | null,
      employment_type: data.employment_type as string | null,
      deleted_at: data.deleted_at as string | null,
    })
  ) {
    throw new ForbiddenError("Choose a current staff member.");
  }
}

function punchWorkDate(row: { attendance_date: string | null; punch_at: string | null }): string {
  if (row.attendance_date) return String(row.attendance_date).slice(0, 10);
  if (!row.punch_at) return "";
  const parsed = new Date(row.punch_at);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
}

async function loadAssignments(staffId: string, dateFrom: string, dateTo: string): Promise<RosterFillAssignment[]> {
  const { data, error } = await supabaseAdmin
    .from("attendance_roster_assignments")
    .select("location_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
    .eq("staff_id", staffId)
    .gte("work_date", dateFrom)
    .lte("work_date", dateTo);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const templateIds = [
    ...new Set(rows.map((row) => (row.shift_template_id ? String(row.shift_template_id) : "")).filter(Boolean)),
  ];
  const templateTimes = new Map<string, { start: string | null; end: string | null }>();
  if (templateIds.length) {
    const { data: templates, error: templateError } = await supabaseAdmin
      .from("attendance_shift_templates")
      .select("id, start_time, end_time")
      .in("id", templateIds);
    if (templateError) throw new Error(templateError.message);
    for (const template of templates ?? []) {
      templateTimes.set(String(template.id), {
        start: normalizeShiftHm(template.start_time ? String(template.start_time) : null),
        end: normalizeShiftHm(template.end_time ? String(template.end_time) : null),
      });
    }
  }
  return rows.map((row) => {
    const weekOff = Boolean(row.is_week_off);
    const template = row.shift_template_id ? templateTimes.get(String(row.shift_template_id)) : undefined;
    return {
      workDate: String(row.work_date).slice(0, 10),
      locationId: String(row.location_id),
      isWeekOff: weekOff,
      shiftStart: weekOff ? null : normalizeShiftHm(row.shift_start ? String(row.shift_start) : null) ?? template?.start ?? null,
      shiftEnd: weekOff ? null : normalizeShiftHm(row.shift_end ? String(row.shift_end) : null) ?? template?.end ?? null,
    };
  });
}

function pushPunchPage(
  punches: RosterFillExistingPunch[],
  page: Array<{
    attendance_date: string | null;
    punch_at: string | null;
    source: string | null;
    excluded_from_calc: boolean | null;
    probable_duplicate: boolean | null;
  }>,
  allowedDays: ReadonlySet<string>,
) {
  for (const row of page) {
    const workDate = punchWorkDate(row);
    if (!workDate || !allowedDays.has(workDate)) continue;
    punches.push({
      workDate,
      source: row.source,
      excludedFromCalc: Boolean(row.excluded_from_calc),
      probableDuplicate: Boolean(row.probable_duplicate),
    });
  }
}

async function loadPunches(staffId: string, dateFrom: string, dateTo: string): Promise<RosterFillExistingPunch[]> {
  const allowedDays = new Set(rosterFillDates(dateFrom, dateTo));
  const punches: RosterFillExistingPunch[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("attendance_logs")
      .select("attendance_date, punch_at, source, excluded_from_calc, probable_duplicate")
      .eq("staff_id", staffId)
      .gte("attendance_date", dateFrom)
      .lte("attendance_date", dateTo)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<{
      attendance_date: string | null;
      punch_at: string | null;
      source: string | null;
      excluded_from_calc: boolean | null;
      probable_duplicate: boolean | null;
    }>;
    pushPunchPage(punches, page, allowedDays);
    if (page.length < 1000) break;
  }

  const { data: undated, error: undatedError } = await supabaseAdmin
    .from("attendance_logs")
    .select("attendance_date, punch_at, source, excluded_from_calc, probable_duplicate")
    .eq("staff_id", staffId)
    .is("attendance_date", null)
    .gte("punch_at", scheduledIsoFromHm(dateFrom, "00:00"))
    .lte("punch_at", scheduledIsoFromHm(dateTo, "23:59"));
  if (undatedError) throw new Error(undatedError.message);
  pushPunchPage(
    punches,
    (undated ?? []) as Array<{
      attendance_date: string | null;
      punch_at: string | null;
      source: string | null;
      excluded_from_calc: boolean | null;
      probable_duplicate: boolean | null;
    }>,
    allowedDays,
  );
  return punches;
}

export async function applyRosterPunchFill(
  context: AuthContext,
  input: { staffId: string; dateFrom: string; dateTo: string },
): Promise<RosterPunchFillResult> {
  const gate = callerGate(context);
  rosterFillDates(input.dateFrom, input.dateTo);
  await assertTargetStaff(context, input.staffId, gate.audience);

  const [assignments, punches, staff] = await Promise.all([
    loadAssignments(input.staffId, input.dateFrom, input.dateTo),
    loadPunches(input.staffId, input.dateFrom, input.dateTo),
    supabaseAdmin.from("staff").select("employee_code").eq("id", input.staffId).maybeSingle(),
  ]);
  if (staff.error) throw new Error(staff.error.message);
  const plan = planRosterPunchFill({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    assignments,
    punches,
  });

  let insertedIds: string[] = [];
  if (plan.punches.length) {
    const employeeCode = staff.data?.employee_code ? String(staff.data.employee_code) : null;
    const { data: inserted, error } = await supabaseAdmin
      .from("attendance_logs")
      .insert(
        plan.punches.map((punch) => ({
          location_id: punch.locationId,
          staff_id: input.staffId,
          biometric_user_id: employeeCode,
          punch_at: punch.punchAt,
          punch_type: punch.punchType,
          in_out_status: punch.punchType === "in" ? 0 : 1,
          source: ROSTER_PUNCH_FILL_SOURCE,
          attendance_date: punch.attendanceDate,
          excluded_from_calc: false,
          probable_duplicate: false,
          raw_payload: { via: ROSTER_PUNCH_FILL_SOURCE, note: punch.note },
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);
    insertedIds = (inserted ?? []).map((row) => String(row.id));
    if (insertedIds.length !== plan.punches.length) {
      if (insertedIds.length) {
        await supabaseAdmin.from("attendance_logs").delete().in("id", insertedIds);
      }
      throw new Error("The roster punches could not be saved.");
    }
  }

  const byLocation = new Map<string, { from: string; to: string }>();
  for (const punch of plan.punches) {
    const current = byLocation.get(punch.locationId);
    if (!current) byLocation.set(punch.locationId, { from: punch.workDate, to: punch.workDate });
    else {
      if (punch.workDate < current.from) current.from = punch.workDate;
      if (punch.workDate > current.to) current.to = punch.workDate;
    }
  }

  try {
    for (const [locationId, range] of byLocation) {
      await recalculateAttendanceRange(
        supabaseAdmin as unknown as Parameters<typeof recalculateAttendanceRange>[0],
        locationId,
        range.from,
        range.to,
        { staffIds: [input.staffId] },
      );
    }
  } catch (error) {
    if (insertedIds.length) {
      await supabaseAdmin.from("attendance_logs").delete().in("id", insertedIds);
    }
    throw error instanceof Error ? error : new Error("Attendance could not be recalculated.");
  }

  const locationId = plan.punches[0]?.locationId ?? null;
  const { error: auditError } = await supabaseAdmin.from("attendance_audit_events").insert({
    actor_id: context.userId,
    action: "attendance.roster_punch_fill",
    entity_type: "staff",
    entity_id: input.staffId,
    location_id: locationId,
    after: {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      filledDays: plan.filledDays,
      skippedDays: plan.skippedDays,
      source: ROSTER_PUNCH_FILL_SOURCE,
    },
  });
  if (auditError) console.warn("[roster-punch-fill] audit failed", auditError.message);

  return { filledDays: plan.filledDays, skippedDays: plan.skippedDays };
}
