"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { resolveSelfStaffId } from "@/lib/attendance-hr/self-staff";
import { normalizeShiftHm } from "@/lib/attendance-hr/late-punch";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { isRosterLeaveType, type RosterLeaveType } from "@/lib/attendance-hr/roster-register-scope";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import {
  preferMyAttendanceSummaryRow,
  preferMyRosterDayRow,
} from "@/lib/employee-attendance-day";

/**
 * Self staff row for My Day. Must use loadLinkedStaffRecord (admin + email/code
 * fallbacks) — not user-scoped maybeSingle on user_id. staff.user_id is not
 * unique and Mary-style desyncs (login email ≠ staff.user_id) otherwise show
 * "Account not linked to staff" while the topbar still shows her job title.
 */
async function myStaff(context: AuthContext) {
  const linked = await loadLinkedStaffRecord(context.userId);
  if (!linked?.id) return null;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id")
    .eq("id", linked.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const getMyAttendance = createAuthenticatedAction(
  z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    const period = defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }));
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    // Unlinked logins: empty summary (not an error) so My day does not stick on "Loading…"
    if (!staff?.id) {
      return { staffId: null, dateFrom, dateTo, rows: [] };
    }
    const staffId = resolveSelfStaffId({ linkedStaffId: staff.id });
    // Admin + staff_id: RLS on attendance_daily_summary is location-scoped
    // (user_can_access_attendance). After a site transfer, user_roles.location_ids
    // often only has the new site, so historical Inflata/etc. days would blank out
    // on My day even though rows still exist for this staff_id.
    const { data: rows, error } = await supabaseAdmin
      .from("attendance_daily_summary")
      .select(
        "id, work_date, status, late_minutes, early_leave_minutes, overtime_minutes, missed_punch, actual_in, actual_out, scheduled_in, scheduled_out, worked_minutes, locations(code, name)",
      )
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: false })
      .limit(200);
    if (error) {
      if (tableMissing(error.message)) return { staffId, dateFrom, dateTo, rows: [] };
      throw error;
    }
    const byDate = new Map<
      string,
      {
        id: string;
        workDate: string;
        status: string;
        lateMinutes: number;
        earlyLeaveMinutes: number;
        overtimeMinutes: number;
        missedPunch: boolean;
        actualIn: string | null;
        actualOut: string | null;
        scheduledIn: string | null;
        scheduledOut: string | null;
        workedMinutes: number;
        locationLabel: string;
      }
    >();
    for (const row of rows ?? []) {
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      const mapped = {
        id: row.id as string,
        workDate: String(row.work_date).slice(0, 10),
        status: String(row.status ?? ""),
        lateMinutes: Number(row.late_minutes ?? 0),
        earlyLeaveMinutes: Number(row.early_leave_minutes ?? 0),
        overtimeMinutes: Number(row.overtime_minutes ?? 0),
        missedPunch: Boolean(row.missed_punch),
        actualIn: (row.actual_in as string | null) ?? null,
        actualOut: (row.actual_out as string | null) ?? null,
        scheduledIn: (row.scheduled_in as string | null) ?? null,
        scheduledOut: (row.scheduled_out as string | null) ?? null,
        workedMinutes: Number(row.worked_minutes ?? 0),
        locationLabel: formatLocationLabel(
          (loc as { code?: string } | null)?.code,
          (loc as { name?: string } | null)?.name,
        ),
      };
      const existing = byDate.get(mapped.workDate);
      if (!existing || preferMyAttendanceSummaryRow(mapped, existing)) {
        byDate.set(mapped.workDate, mapped);
      }
    }
    return {
      staffId,
      dateFrom,
      dateTo,
      rows: [...byDate.values()].sort((a, b) => b.workDate.localeCompare(a.workDate)),
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

/** Signed-in employee's roster rows for the current FEC month. No payroll math. */
export const getMyRoster = createAuthenticatedAction(
  z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    const period = defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }));
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    if (!staff?.id) {
      return { staffId: null as string | null, dateFrom, dateTo, rows: [] as MyRosterRow[] };
    }
    const staffId = resolveSelfStaffId({ linkedStaffId: staff.id });
    // Same as getMyAttendance: roster/leave RLS is location-scoped; use admin + staff_id
    // so pre-transfer site days remain visible on My day after a location move.
    const { data: assignments, error } = await supabaseAdmin
      .from("attendance_roster_assignments")
      .select("id, location_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: true })
      .limit(120);
    if (error) {
      if (tableMissing(error.message)) return { staffId, dateFrom, dateTo, rows: [] as MyRosterRow[] };
      throw error;
    }

    const assignmentRows = assignments ?? [];
    const locationIds = [...new Set(assignmentRows.map((row) => String(row.location_id)).filter(Boolean))];
    const shiftIds = [
      ...new Set(
        assignmentRows
          .map((row) => (row.shift_template_id as string | null) ?? null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [locRes, shiftRes, leaveRes] = await Promise.all([
      locationIds.length
        ? supabaseAdmin.from("locations").select("id, code, name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      shiftIds.length
        ? supabaseAdmin.from("attendance_shift_templates").select("id, start_time, end_time").in("id", shiftIds)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("attendance_leave_records")
        .select("leave_date, leave_type")
        .eq("staff_id", staffId)
        .gte("leave_date", dateFrom)
        .lte("leave_date", dateTo),
    ]);
    if (locRes.error) throw locRes.error;
    if (shiftRes.error && !tableMissing(shiftRes.error.message)) throw shiftRes.error;

    const locById = new Map((locRes.data ?? []).map((row) => [String(row.id), row]));
    const shiftById = new Map(
      (shiftRes.data ?? []).map((row) => [String(row.id), row] as const),
    );
    const leaveByDate = new Map<string, RosterLeaveType>();
    if (!leaveRes.error) {
      for (const leave of leaveRes.data ?? []) {
        const leaveType = String(leave.leave_type ?? "");
        if (!isRosterLeaveType(leaveType)) continue;
        leaveByDate.set(String(leave.leave_date).slice(0, 10), leaveType);
      }
    }

    const byDate = new Map<string, MyRosterRow>();
    for (const row of assignmentRows) {
      const loc = locById.get(String(row.location_id));
      const template = row.shift_template_id ? shiftById.get(String(row.shift_template_id)) : undefined;
      const workDate = String(row.work_date).slice(0, 10);
      const shiftStart =
        normalizeShiftHm((row as { shift_start?: string | null }).shift_start) ??
        normalizeShiftHm(template?.start_time == null ? null : String(template.start_time));
      const shiftEnd =
        normalizeShiftHm((row as { shift_end?: string | null }).shift_end) ??
        normalizeShiftHm(template?.end_time == null ? null : String(template.end_time));
      const mapped: MyRosterRow = {
        id: String(row.id),
        workDate,
        locationLabel: formatLocationLabel(loc?.code, loc?.name),
        shiftStart,
        shiftEnd,
        isWeekOff: Boolean(row.is_week_off),
        leaveType: leaveByDate.get(workDate) ?? null,
      };
      const existing = byDate.get(workDate);
      // Multi-site: week-off (then leave) wins so My attendance never treats rest as on-duty.
      if (!existing || preferMyRosterDayRow(mapped, existing)) {
        byDate.set(workDate, mapped);
      }
    }

    const rows = [...byDate.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));

    return { staffId, dateFrom, dateTo, rows };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

type MyRosterRow = {
  id: string;
  workDate: string;
  locationLabel: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  isWeekOff: boolean;
  leaveType: RosterLeaveType | null;
};

export const listEmployeeAppStatus = createAuthenticatedActionNoInput(
  async (context) => {
    const [{ data: events, error: eventErr }, { data: faces, error: faceErr }] = await Promise.all([
      context.supabase
        .from("staff_location_events")
        .select(
          "staff_id, latitude, longitude, inside_geofence, event_type, recorded_at, staff(full_name, employee_code, is_roaming), locations(code, name)",
        )
        .order("recorded_at", { ascending: false })
        .limit(400),
      context.supabase.from("staff_face_enrollments").select("staff_id, status, enrolled_at, liveness_passed"),
    ]);
    if (eventErr && !tableMissing(eventErr.message)) throw eventErr;
    if (faceErr && !tableMissing(faceErr.message)) throw faceErr;
    const faceByStaff = new Map(
      (faces ?? []).map((row) => [String(row.staff_id), row] as const),
    );
    const seen = new Set<string>();
    const rows: Array<{
      staffId: string;
      staffName: string | null;
      employeeCode: string | null;
      isRoaming: boolean;
      locationLabel: string | null;
      eventType: string;
      insideGeofence: boolean | null;
      recordedAt: string;
      enrolled: boolean;
      livenessPassed: boolean;
    }> = [];
    for (const row of events ?? []) {
      const staffId = String(row.staff_id);
      if (seen.has(staffId)) continue;
      seen.add(staffId);
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
      const face = faceByStaff.get(staffId);
      rows.push({
        staffId,
        staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
        employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
        isRoaming: Boolean((staff as { is_roaming?: boolean } | null)?.is_roaming),
        locationLabel: loc
          ? formatLocationLabel((loc as { code?: string }).code, (loc as { name?: string }).name)
          : null,
        eventType: String(row.event_type),
        insideGeofence: row.inside_geofence as boolean | null,
        recordedAt: String(row.recorded_at),
        enrolled: face?.status === "enrolled",
        livenessPassed: Boolean(face?.liveness_passed),
      });
    }
    return { rows, checkedInCount: rows.filter((r) => r.eventType === "check_in").length };
  },
  { auth: { capability: "attendance.view" } },
);

export const getLinkedStaffId = createAuthenticatedActionNoInput(
  async (context) => {
    const staff = await myStaff(context);
    return staff ? { id: staff.id, fullName: staff.full_name, employeeCode: staff.employee_code } : null;
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

type DeptLink = {
  master_departments?: { name?: string | null } | { name?: string | null }[] | null;
};

async function reportingNames(staffId: string) {
  const { data: selfExt, error: selfErr } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("reporting_manager_staff_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (selfErr) throw new Error(selfErr.message);

  const directIds: string[] = [];
  let frontier = [staffId];
  const seen = new Set<string>([staffId]);
  let furtherReportCount = 0;
  for (let depth = 0; frontier.length > 0 && depth < 12; depth += 1) {
    const next: string[] = [];
    for (let index = 0; index < frontier.length; index += 100) {
      const chunk = frontier.slice(index, index + 100);
      const { data, error } = await supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id")
        .in("reporting_manager_staff_id", chunk);
      if (error) throw new Error(error.message);
      const found = (data ?? []).map((row) => row.staff_id).filter((id) => !seen.has(id));
      if (!found.length) continue;
      const activeIds = new Set<string>();
      for (let nameIndex = 0; nameIndex < found.length; nameIndex += 100) {
        const nameChunk = found.slice(nameIndex, nameIndex + 100);
        const { data: active, error: activeErr } = await supabaseAdmin
          .from("staff")
          .select("id")
          .in("id", nameChunk)
          .eq("status", "active")
          .is("deleted_at", null);
        if (activeErr) throw new Error(activeErr.message);
        for (const row of active ?? []) activeIds.add(row.id);
      }
      for (const id of found) {
        if (!activeIds.has(id) || seen.has(id)) continue;
        seen.add(id);
        next.push(id);
        if (depth === 0) directIds.push(id);
        else furtherReportCount += 1;
      }
    }
    frontier = next;
  }

  const managerId = selfExt?.reporting_manager_staff_id ?? null;
  const nameIds = [...directIds, ...(managerId ? [managerId] : [])];
  const names = new Map<string, string>();
  for (let index = 0; index < nameIds.length; index += 100) {
    const chunk = nameIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin.from("staff").select("id, full_name").in("id", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) names.set(row.id, row.full_name?.trim() || "Staff");
  }

  return {
    managerName: managerId ? (names.get(managerId) ?? null) : null,
    reportNames: directIds.map((id) => names.get(id) ?? "Staff").sort((a, b) => a.localeCompare(b)),
    furtherReportCount,
  };
}

/** Self-service profile for /hr/me. No salary, QID, or passport fields. */
export const getMyEmployeeProfile = createAuthenticatedActionNoInput(
  async (context) => {
    const linked = await loadLinkedStaffRecord(context.userId);
    if (!linked?.id) return null;

    // Resolve by linked id (admin). Do not filter user_id here — that path is
    // what falsely unlinked Sr. Site when staff.user_id drifted from the login.
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select(
        "id, full_name, employee_code, job_title, department, phone, email, hire_date, employment_type, status, locations!staff_location_id_fkey(code, name), staff_departments(master_departments(name))",
      )
      .eq("id", linked.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      if (tableMissing(error.message)) return null;
      throw error;
    }
    if (!data) return null;

    const locRaw = data.locations as
      | { code?: string | null; name?: string | null }
      | { code?: string | null; name?: string | null }[]
      | null;
    const loc = Array.isArray(locRaw) ? locRaw[0] : locRaw;
    const links = (data.staff_departments ?? []) as DeptLink[];
    const deptNames = links
      .map((link) => {
        const dept = Array.isArray(link.master_departments) ? link.master_departments[0] : link.master_departments;
        const name = dept?.name?.trim();
        return name || null;
      })
      .filter((name): name is string => Boolean(name));
    const fallbackDept = (data.department as string | null)?.trim() || null;
    const locationLabel = loc ? formatLocationLabel(loc.code, loc.name) : null;
    const reporting = await reportingNames(String(data.id));
    const flag = await supabaseAdmin
      .from("staff")
      .select("can_self_check_in")
      .eq("id", String(data.id))
      .maybeSingle();
    const canSelfCheckIn = !flag.error && Boolean(flag.data?.can_self_check_in);

    return {
      id: String(data.id),
      canSelfCheckIn,
      fullName: String(data.full_name ?? ""),
      employeeCode: (data.employee_code as string | null) ?? null,
      jobTitle: (data.job_title as string | null) ?? null,
      managerName: reporting.managerName,
      reportNames: reporting.reportNames,
      furtherReportCount: reporting.furtherReportCount,
      department: deptNames.length > 0 ? deptNames.join(", ") : fallbackDept,
      phone: (data.phone as string | null) ?? null,
      email: (data.email as string | null) ?? null,
      hireDate: data.hire_date ? String(data.hire_date).slice(0, 10) : null,
      employmentType: (data.employment_type as string | null) ?? null,
      status: (data.status as string | null) ?? null,
      locationLabel: locationLabel && locationLabel !== "—" ? locationLabel : null,
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);
