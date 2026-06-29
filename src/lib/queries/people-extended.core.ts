import { assertLocationAccess } from "@/lib/server/authorize";
import type { AuthContext } from "@/lib/server/auth";

export async function fetchShifts(context: AuthContext, locationId?: string | null) {
  if (!locationId) return [];

  await assertLocationAccess(context, locationId);

  const fromDate = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

  const { data: rows, error } = await context.supabase
    .from("shifts")
    .select(
      "id, location_id, user_id, staff_id, role_label, starts_at, ends_at, status, clock_in_at, clock_out_at, notes, roster_upload_id",
    )
    .eq("location_id", locationId)
    .not("staff_id", "is", null)
    .gte("starts_at", `${fromDate}T00:00:00+03:00`)
    .lte("starts_at", `${toDate}T23:59:59+03:00`)
    .order("starts_at");
  if (error) throw error;
  if (!rows?.length) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
  const { data: staff } = staffIds.length
    ? await context.supabase
        .from("staff")
        .select("id, full_name, employee_code, department, job_title")
        .in("id", staffIds)
    : { data: [] };

  const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));

  return rows.map((r) => ({
    ...r,
    staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null,
  }));
}

export async function fetchTraining(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("training_enrollments")
    .select(
      "id, location_id, staff_id, course_name, required, status, due_on, completed_on, score, staff(full_name, employee_code)",
    )
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(200);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  return rows ?? [];
}

export async function fetchAttendanceDailySummary(context: AuthContext, locationId?: string | null) {
  const from = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  let q = context.supabase
    .from("attendance_daily_summary")
    .select(
      "id, location_id, staff_id, work_date, status, late_minutes, early_leave_minutes, overtime_minutes, missed_punch, actual_in, actual_out, scheduled_in, scheduled_out",
    )
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false });
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
  const { data: staff } = staffIds.length
    ? await context.supabase.from("staff").select("id, full_name, employee_code").in("id", staffIds)
    : { data: [] };
  const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));

  return rows.map((r) => ({
    ...r,
    staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null,
  }));
}

export async function fetchAttendanceExceptions(context: AuthContext, locationId?: string | null) {
  let q = context.supabase
    .from("attendance_exceptions")
    .select("id, summary_id, location_id, staff_id, exception_type, description, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  if (locationId) q = q.eq("location_id", locationId);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
  const { data: staff } = staffIds.length
    ? await context.supabase.from("staff").select("id, full_name").in("id", staffIds)
    : { data: [] };
  const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
  return rows.map((r) => ({ ...r, staff: r.staff_id ? staffMap.get(r.staff_id) ?? null : null }));
}
