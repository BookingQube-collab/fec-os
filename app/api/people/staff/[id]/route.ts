import { redactStaffIdentityNumbers } from "@/lib/hr-advanced";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";

type ProfileSection = "overview" | "attendance" | "training" | "all";

function parseSections(raw: string | null): Set<ProfileSection> {
  if (!raw || raw === "all") return new Set(["all"]);
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean) as ProfileSection[];
  return new Set(parts.length ? parts : ["overview"]);
}

function wants(sections: Set<ProfileSection>, key: ProfileSection): boolean {
  return sections.has("all") || sections.has(key) || (key !== "overview" && sections.has(key));
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const sections = parseSections(params.get("sections"));
      const loadOverview = wants(sections, "overview") || sections.has("all") || sections.size === 0;
      const loadAttendance = wants(sections, "attendance");
      const loadTraining = wants(sections, "training");
      // Default request with no sections param → full payload (legacy callers).
      const legacyFull = params.get("sections") == null;

      const includeSalary = canUserDo(context.roles ?? [], "people.view_salary");
      const { data: staff, error } = await context.supabase
        .from("staff")
        .select(
          "id, employee_code, full_name, job_title, department, status, location_id, is_roaming, phone, email, hire_date, qid, e3_enrolled, employment_type, staff_role, source_row_no, deleted_at, photo_updated_at, photo_mime, flexible_attendance, reporting_time_minutes, buffer_minutes, expected_hours, break_minutes, weekly_off_weekday, locations!staff_location_id_fkey(code, name), staff_departments(department_id, master_departments(id, name, sort_order))",
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
      if (includeSalary && (loadOverview || legacyFull)) {
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

      const locationLabels = new Map<string, string>();
      let transfers: Array<Record<string, unknown>> = [];
      if (loadOverview || legacyFull) {
        const { data: transferRows } = await context.supabase
          .from("staff_transfers")
          .select("id, from_location_id, to_location_id, effective_on, reason, created_at")
          .eq("staff_id", id)
          .order("effective_on", { ascending: false })
          .limit(20);

        const locationIds = [
          ...new Set(
            (transferRows ?? [])
              .flatMap((row) => [row.from_location_id, row.to_location_id])
              .filter((value): value is string => Boolean(value)),
          ),
        ];
        if (locationIds.length) {
          const { data: locs } = await context.supabase
            .from("locations")
            .select("id, code, name")
            .in("id", locationIds);
          for (const loc of locs ?? []) {
            locationLabels.set(loc.id, formatLocationLabel(loc.code, loc.name));
          }
        }
        transfers = (transferRows ?? []).map((row) => ({
          ...row,
          from_location_label: row.from_location_id ? (locationLabels.get(row.from_location_id) ?? null) : null,
          to_location_label: locationLabels.get(row.to_location_id) ?? null,
        }));
      }

      const workLocations = (await fetchWorkLocationsByStaffId(context.supabase, [id])).get(id) ?? [];
      for (const loc of workLocations) {
        locationLabels.set(loc.id, formatLocationLabel(loc.code, loc.name));
      }

      let attendance: Array<Record<string, unknown>> = [];
      let punches: Array<Record<string, unknown>> = [];
      if (loadAttendance || legacyFull) {
        const { data: attendanceRows } = await context.supabase
          .from("attendance_daily_summary")
          .select("id, location_id, work_date, status, actual_in, actual_out, worked_minutes, overtime_minutes, missed_punch")
          .eq("staff_id", id)
          .order("work_date", { ascending: false })
          .limit(30);

        const attendanceLocationIds = [
          ...new Set((attendanceRows ?? []).map((row) => row.location_id).filter(Boolean)),
        ];
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

        attendance = (attendanceRows ?? []).map((row) => ({
          ...row,
          location_label: row.location_id ? (locationLabels.get(row.location_id) ?? null) : null,
        }));

        const { data: punchRows } = await context.supabase
          .from("attendance_logs")
          .select("id, punch_at, punch_type, source, location_id")
          .eq("staff_id", id)
          .order("punch_at", { ascending: false })
          .limit(40);
        punches = punchRows ?? [];
      }

      let training: Array<Record<string, unknown>> = [];
      if (loadTraining || legacyFull) {
        const { data: trainingRows } = await context.supabase
          .from("training_enrollments")
          .select("id, course_name, status, due_on, completed_on")
          .eq("staff_id", id)
          .order("due_on", { ascending: true, nullsFirst: false })
          .limit(20);
        training = trainingRows ?? [];
      }

      const canSensitive = canUserDo(context.roles ?? [], "hr.profile.view_sensitive");
      const canDocs =
        canSensitive ||
        canUserDo(context.roles ?? [], "hr.docs.manage") ||
        canUserDo(context.roles ?? [], "hr.manage");

      let profileExt: Record<string, unknown> | null = null;
      let statusHistory: Array<Record<string, unknown>> = [];
      let documents: Array<Record<string, unknown>> = [];
      let managerName: string | null = null;

      if (loadOverview || legacyFull) {
        const { data: ext } = await context.supabase
          .from("staff_profile_ext")
          .select(
            "nationality, gender, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, reporting_manager_staff_id, employment_category, probation_start, probation_end, passport_number, passport_expiry, visa_number, visa_expiry, sponsorship_info, qid_expiry, ticket_eligibility, ticket_eligibility_months, ticket_amount, contract_start, contract_end, notes, payment_method, bank_name, iban, last_working_date, releasing_date, exit_reason",
          )
          .eq("staff_id", id)
          .maybeSingle();
        profileExt = ext;

        const { data: historyRows } = await context.supabase
          .from("staff_status_history")
          .select("id, from_status, to_status, effective_on, reason, created_at, created_by")
          .eq("staff_id", id)
          .order("effective_on", { ascending: false })
          .limit(50);
        statusHistory = historyRows ?? [];

        if (canDocs) {
          const { data: docRows } = await context.supabase
            .from("hr_employee_documents")
            .select(
              "id, doc_type, document_number, issue_date, expiry_date, verification_status, status, file_name, notes, verification_remarks, created_at",
            )
            .eq("staff_id", id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(100);
          documents = docRows ?? [];
        }

        if (ext?.reporting_manager_staff_id) {
          const { data: mgr } = await context.supabase
            .from("staff")
            .select("full_name, employee_code")
            .eq("id", ext.reporting_manager_staff_id)
            .maybeSingle();
          managerName = mgr ? `${mgr.full_name} (${mgr.employee_code})` : null;
        }
      }

      const sensitiveExt = canSensitive
        ? profileExt
        : profileExt
          ? {
              ...profileExt,
              passport_number: profileExt.passport_number ? "••••••••" : null,
              qid_expiry: profileExt.qid_expiry,
              bank_name: null,
              iban: null,
              wps_employee_id: null,
            }
          : null;

      const safeStaff = redactStaffIdentityNumbers(
        {
          ...staff,
          is_roaming: Boolean(staff.is_roaming),
          has_photo: Boolean(staff.photo_updated_at),
          work_locations: workLocations,
        },
        canSensitive,
      );

      return {
        staff: safeStaff,
        profileExt: sensitiveExt,
        managerName,
        statusHistory,
        documents,
        compensation,
        transfers,
        attendance,
        punches,
        training,
        canViewSalary: includeSalary,
        canViewSensitive: canSensitive,
      };
    },
    request,
    { capability: "people.view_roster" },
  );
}
