"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { resolveSelfStaffId } from "@/lib/attendance-hr/self-staff";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
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
    const staffId = resolveSelfStaffId({ linkedStaffId: staff?.id ?? null });
    const period = defaultPayrollPeriod(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }));
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;
    const { data: rows, error } = await context.supabase
      .from("attendance_daily_summary")
      .select("id, work_date, status, late_minutes, overtime_minutes, missed_punch, actual_in, actual_out, worked_minutes, locations(code, name)")
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .order("work_date", { ascending: false })
      .limit(40);
    if (error) {
      if (tableMissing(error.message)) return { staffId, dateFrom, dateTo, rows: [] };
      throw error;
    }
    return {
      staffId,
      dateFrom,
      dateTo,
      rows: (rows ?? []).map((row) => {
        const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
        return {
          id: row.id as string,
          workDate: String(row.work_date).slice(0, 10),
          status: String(row.status ?? ""),
          lateMinutes: Number(row.late_minutes ?? 0),
          overtimeMinutes: Number(row.overtime_minutes ?? 0),
          missedPunch: Boolean(row.missed_punch),
          actualIn: (row.actual_in as string | null) ?? null,
          actualOut: (row.actual_out as string | null) ?? null,
          workedMinutes: Number(row.worked_minutes ?? 0),
          locationLabel: formatLocationLabel(
            (loc as { code?: string } | null)?.code,
            (loc as { name?: string } | null)?.name,
          ),
        };
      }),
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);

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
