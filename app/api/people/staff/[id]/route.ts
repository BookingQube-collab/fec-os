import { formatLocationLabel } from "@/lib/locations/normalize";
import { withAuthRouteRequest } from "@/lib/server/api-route";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withAuthRouteRequest(
    async (context) => {
      const includeSalary = canUserDo(context.roles ?? [], "people.view_salary");
      const { data: staff, error } = await context.supabase
        .from("staff")
        .select(
          "id, employee_code, full_name, job_title, department, status, location_id, is_roaming, phone, email, hire_date, qid, e3_enrolled, employment_type, staff_role, source_row_no, deleted_at, locations!staff_location_id_fkey(code, name), staff_departments(department_id, master_departments(id, name, sort_order))",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!staff) throw new Error("Staff member not found");

      const { data: allowed, error: locErr } = await context.supabase.rpc("user_can_access_staff", {
        _staff_id: id,
      });
      if (locErr) {
        const { data: homeOk, error: homeErr } = await context.supabase.rpc("user_can_access_location", {
          _location_id: staff.location_id,
        });
        if (homeErr) throw homeErr;
        if (!homeOk) throw new ForbiddenError("Forbidden: cannot access this branch");
      } else if (!allowed) {
        throw new ForbiddenError("Forbidden: cannot access this branch");
      }

      let compensation: { monthly_salary_qar: number | null; daily_rate_qar: number | null; currency: string } | null = null;
      if (includeSalary) {
        const { data: comp } = await context.supabase
          .from("staff_compensation")
          .select("monthly_salary_qar, daily_rate_qar, currency")
          .eq("staff_id", id)
          .maybeSingle();
        compensation = comp
          ? {
              monthly_salary_qar: comp.monthly_salary_qar == null ? null : Number(comp.monthly_salary_qar),
              daily_rate_qar: comp.daily_rate_qar == null ? null : Number(comp.daily_rate_qar),
              currency: comp.currency,
            }
          : null;
      }

      const { data: transferRows } = await context.supabase
        .from("staff_transfers")
        .select("id, from_location_id, to_location_id, effective_on, reason, created_at")
        .eq("staff_id", id)
        .order("effective_on", { ascending: false })
        .limit(20);

      const locationIds = [
        ...new Set(
          (transferRows ?? []).flatMap((row) => [row.from_location_id, row.to_location_id]).filter((value): value is string => Boolean(value)),
        ),
      ];
      const locationLabels = new Map<string, string>();
      if (locationIds.length) {
        const { data: locs } = await context.supabase
          .from("locations")
          .select("id, code, name")
          .in("id", locationIds);
        for (const loc of locs ?? []) {
          locationLabels.set(loc.id, formatLocationLabel(loc.code, loc.name));
        }
      }
      const transfers = (transferRows ?? []).map((row) => ({
        ...row,
        from_location_label: row.from_location_id ? (locationLabels.get(row.from_location_id) ?? null) : null,
        to_location_label: locationLabels.get(row.to_location_id) ?? null,
      }));

      const { data: attendance } = await context.supabase
        .from("attendance_daily_summary")
        .select("id, location_id, work_date, status, actual_in, actual_out, worked_minutes, overtime_minutes, missed_punch")
        .eq("staff_id", id)
        .order("work_date", { ascending: false })
        .limit(30);

      const workLocations = (await fetchWorkLocationsByStaffId(context.supabase, [id])).get(id) ?? [];
      const attendanceLocationIds = [...new Set((attendance ?? []).map((row) => row.location_id).filter(Boolean))];
      for (const loc of workLocations) {
        locationLabels.set(loc.id, formatLocationLabel(loc.code, loc.name));
      }
      const missingAttendanceLocs = attendanceLocationIds.filter((locId) => !locationLabels.has(locId));
      if (missingAttendanceLocs.length) {
        const { data: attLocs } = await context.supabase
          .from("locations")
          .select("id, code, name")
          .in("id", missingAttendanceLocs);
        for (const loc of attLocs ?? []) {
          locationLabels.set(loc.id, formatLocationLabel(loc.code, loc.name));
        }
      }

      const { data: punches } = await context.supabase
        .from("attendance_logs")
        .select("id, punch_at, punch_type, source, location_id")
        .eq("staff_id", id)
        .order("punch_at", { ascending: false })
        .limit(40);

      const { data: training } = await context.supabase
        .from("training_enrollments")
        .select("id, course_name, status, due_on, completed_on")
        .eq("staff_id", id)
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(20);

      return {
        staff: {
          ...staff,
          is_roaming: Boolean(staff.is_roaming),
          work_locations: workLocations,
        },
        compensation,
        transfers,
        attendance: (attendance ?? []).map((row) => ({
          ...row,
          location_label: row.location_id ? (locationLabels.get(row.location_id) ?? null) : null,
        })),
        punches: punches ?? [],
        training: training ?? [],
        canViewSalary: includeSalary,
      };
    },
    request,
    { capability: "people.view_roster" },
  );
}
