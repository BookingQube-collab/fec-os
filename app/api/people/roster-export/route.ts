import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { canUserDo } from "@/lib/rbac";
import { loadLiveStaffForSample, loadSalaryByStaffId, resolveSampleScope } from "@/lib/staff-sample-load";
import { directoryStaffForScope } from "@/lib/staff-sample-scope";
import { buildDirectorySampleCsv, directorySampleFilename } from "@/lib/staff-roster/directory-sample";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const format = (params.get("format") ?? "csv").toLowerCase();
      const { staff, locations } = await loadLiveStaffForSample(context);
      const scope = await resolveSampleScope(context, locations, params.get("locationId"));
      const includeSalary = canUserDo(context.roles ?? [], "people.view_salary");
      const scoped = directoryStaffForScope(staff, locations, {
        scopeLocationId: scope.scopeLocationId,
        accessibleLocationIds: scope.accessibleLocationIds,
      });
      let salaryById = new Map<string, number | null>();
      if (includeSalary) {
        salaryById = await loadSalaryByStaffId(
          context,
          scoped.map((row) => row.id),
        );
      }
      const people = scoped.map((row) => ({
        employee_code: row.employee_code,
        full_name: row.full_name,
        qid: row.qid,
        locationCode: row.locationCode,
        locationName: row.locationName,
        job_title: row.job_title ?? null,
        employment_type: row.employment_type ?? null,
        e3_enrolled: row.e3_enrolled ?? null,
        phone: row.phone ?? null,
        hire_date: row.hire_date ?? null,
        status: row.status ?? null,
        monthly_salary_qar: includeSalary ? (salaryById.get(row.id) ?? null) : null,
      }));
      const csv = buildDirectorySampleCsv(people, { includeSalary });

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const rows = people.map((s) => {
          const row: Record<string, unknown> = {
            employee_code: s.employee_code,
            full_name: s.full_name,
            qid: s.qid,
            location: s.locationCode,
            location_name: s.locationName,
            position: s.job_title,
            type: s.employment_type,
            e3: s.e3_enrolled == null ? "" : s.e3_enrolled ? "Yes" : "No",
            contact: s.phone,
            "joining date": s.hire_date,
            status: s.status,
          };
          if (includeSalary) row.salary = s.monthly_salary_qar ?? null;
          return row;
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Employee Roster");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
        return {
          filename: directorySampleFilename(scope.locationCode).replace(/\.csv$/i, ".xlsx"),
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: buf.toString("base64"),
        };
      }

      return { filename: directorySampleFilename(scope.locationCode), mime: "text/csv", csv };
    },
    request,
    { capability: "people.view_roster" },
  );
}
