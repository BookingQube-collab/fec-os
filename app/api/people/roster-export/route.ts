import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { canUserDo } from "@/lib/rbac";
import { countsAsActiveStaff, isJokerStaff } from "@/lib/staff-status";
import { loadLiveStaffForSample, loadSalaryByStaffId, resolveSampleScope } from "@/lib/staff-sample-load";
import { directoryStaffForScope } from "@/lib/staff-sample-scope";
import { buildDirectorySampleCsv, directorySampleFilename } from "@/lib/staff-roster/directory-sample";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const format = (params.get("format") ?? "csv").toLowerCase();
      const scopeMode = (params.get("scope") ?? "all").toLowerCase();
      const { staff, locations } = await loadLiveStaffForSample(context);
      const scope = await resolveSampleScope(context, locations, params.get("locationId"));
      const includeSalary = canUserDo(context.roles ?? [], "people.view_salary");
      let scoped = directoryStaffForScope(staff, locations, {
        scopeLocationId: scope.scopeLocationId,
        accessibleLocationIds: scope.accessibleLocationIds,
      });

      if (scopeMode === "active") {
        scoped = scoped.filter((row) => countsAsActiveStaff(row.status, row.employment_type));
      } else if (scopeMode === "selected") {
        const ids = new Set(
          (params.get("ids") ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
        scoped = scoped.filter((row) => ids.has(row.id));
      } else if (scopeMode === "filtered") {
        const status = (params.get("status") ?? "").trim().toLowerCase();
        const q = (params.get("q") ?? "").trim().toLowerCase();
        const type = (params.get("type") ?? "").trim().toLowerCase();
        const loc = (params.get("loc") ?? "").trim().toUpperCase();
        const showJokers = params.get("jokers") === "1";
        scoped = scoped.filter((row) => {
          const jokerOnly = showJokers || type === "joker" || status === "joker";
          if (jokerOnly && !isJokerStaff(row)) return false;
          if (!jokerOnly && status === "active" && !countsAsActiveStaff(row.status, row.employment_type)) {
            return false;
          }
          if (!jokerOnly && status && status !== "active" && (row.status ?? "").toLowerCase() !== status) return false;
          if (type && (row.employment_type ?? "").toLowerCase() !== type) return false;
          if (loc && row.locationCode !== loc) return false;
          if (q) {
            const blob = `${row.full_name} ${row.employee_code} ${row.qid ?? ""} ${row.phone ?? ""}`.toLowerCase();
            if (!blob.includes(q)) return false;
          }
          return true;
        });
      }

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
      const generatedAt = new Date().toISOString();
      const filterNote = `scope=${scopeMode}; generated=${generatedAt}`;

      if (format === "xlsx") {
        const { writeXlsxBuffer } = await import("@/lib/spreadsheet/workbook");
        // Column names aligned to E3 Employee Masterfile 2026 (single-sheet export; Status replaces sheet membership).
        const header = [
          "Department",
          "E.Code",
          "E.Name",
          "Position",
          "Location of Work",
          "QID",
          "Contact Number",
          "DOJ",
          "Status",
          "Employee Type",
          ...(includeSalary ? (["Gross Salary"] as const) : []),
        ];
        const dataRows = people.map((s) => {
          const cells: unknown[] = [
            "",
            s.employee_code ?? "",
            s.full_name ?? "",
            s.job_title ?? "",
            s.locationName || s.locationCode || "",
            s.qid ?? "",
            s.phone ?? "",
            s.hire_date ?? "",
            s.status ?? "",
            s.employment_type ?? "",
          ];
          if (includeSalary) cells.push(s.monthly_salary_qar ?? "");
          return cells;
        });
        const aoa: unknown[][] = [
          ["E3 Employee Masterfile", filterNote],
          header,
          ...dataRows,
        ];
        const buf = await writeXlsxBuffer([
          {
            name: "Employee Master",
            rows: aoa,
            freezeRows: 2,
            colWidths: header.map((k) => Math.max(12, Math.min(28, k.length + 4))),
            autoFilter: { headerRow: 1, cols: header.length },
          },
        ]);
        await context.supabase.rpc("log_audit", {
          _action: "staff.export",
          _table_name: "staff",
          _row_id: scope.scopeLocationId ?? "all",
          _after: { scope: scopeMode, count: people.length, format: "xlsx" },
          _metadata: {},
        });
        return {
          filename: directorySampleFilename(scope.locationCode).replace(/\.csv$/i, ".xlsx").replace("roster-sample", "master"),
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: buf.toString("base64"),
        };
      }

      await context.supabase.rpc("log_audit", {
        _action: "staff.export",
        _table_name: "staff",
        _row_id: scope.scopeLocationId ?? "all",
        _after: { scope: scopeMode, count: people.length, format: "csv" },
        _metadata: {},
      });
      return { filename: directorySampleFilename(scope.locationCode).replace("roster-sample", "master"), mime: "text/csv", csv };
    },
    request,
    { capability: "people.view_roster" },
  );
}
