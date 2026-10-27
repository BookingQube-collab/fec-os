import { NextResponse } from "next/server";

import { listUploadedRosterAssignments } from "@/lib/attendance-hr/roster-register.functions";
import {
  buildRosterRegisterExcelSheet,
  buildRosterRegisterPdfBuffer,
  e3RosterRegisterExportFilename,
  writeRosterRegisterXlsxBuffer,
  type RosterExportFilterMeta,
} from "@/lib/attendance-hr/roster-register-export";
import { filterRosterRegisterRows } from "@/lib/attendance-hr/roster-register-scope";
import { parseShowOrgDepartmentsParam, type OrgFocusDepartment } from "@/lib/exclude-org-departments";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";

export const runtime = "nodejs";

const ROSTER_EXPORT_CAPABILITIES = [
  "people.view_roster",
  "people.import_roster",
  "people.edit_roster",
  "daily_ops.roster.upload",
  "attendance.view",
  "hr.employee_app",
] as const;

function parseUuidList(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function parseSource(raw: string | null): "upload" | "amend" | "manual" | "copied" | null {
  if (raw === "upload" || raw === "amend" || raw === "manual" || raw === "copied") return raw;
  return null;
}

function groupLabelFromShowOnly(keys: OrgFocusDepartment[]): string | undefined {
  if (!keys.length) return undefined;
  const labels: Record<OrgFocusDepartment, string> = {
    operations: "Operations",
    maintenance: "Maintenance",
    fb_cafe: "F&B",
  };
  // showOnlyOrgDepartments = focus set after unchecking chips (show-only mode).
  return keys.map((key) => labels[key]).join(", ");
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const params = searchParams(req);
      const dateFrom = (params.get("dateFrom") ?? params.get("from") ?? "").slice(0, 10);
      const dateTo = (params.get("dateTo") ?? params.get("to") ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        return NextResponse.json({ error: "dateFrom and dateTo (YYYY-MM-DD) are required." }, { status: 400 });
      }
      if (dateFrom > dateTo) {
        return NextResponse.json({ error: "dateFrom must be on or before dateTo." }, { status: 400 });
      }

      const formatRaw = (params.get("format") ?? "xlsx").toLowerCase();
      const format = formatRaw === "excel" ? "xlsx" : formatRaw === "pdf" ? "pdf" : formatRaw === "xlsx" ? "xlsx" : null;
      if (!format) {
        return NextResponse.json({ error: "format must be xlsx or pdf." }, { status: 400 });
      }

      const locationId = params.get("locationId")?.trim() || null;
      const staffId = params.get("staffId")?.trim() || null;
      const search = params.get("search")?.trim() || params.get("q")?.trim() || null;
      const sourceUploadOnly = params.get("sourceUploadOnly") === "1" || params.get("sourceUploadOnly") === "true";
      const source = parseSource(params.get("source"));
      const excludedDepartmentIds = parseUuidList(params.get("excludedDepartmentIds"));
      const showOnlyDepartmentIds = parseUuidList(params.get("showOnlyDepartmentIds"));
      const showOnlyOrgDepartments = parseShowOrgDepartmentsParam(params.get("showOrgDepartments"));

      const listed = await listUploadedRosterAssignments({
        dateFrom,
        dateTo,
        locationId,
        // Keep full staff list for matrix placeholders; apply staff/search after fetch.
        staffId: null,
        excludedDepartmentIds: excludedDepartmentIds.length ? excludedDepartmentIds : undefined,
        showOnlyDepartmentIds: showOnlyDepartmentIds.length ? showOnlyDepartmentIds : undefined,
        showOnlyOrgDepartments: showOnlyOrgDepartments.length ? showOnlyOrgDepartments : undefined,
        sourceUploadOnly,
        source: !sourceUploadOnly && source ? source : null,
      });

      const filtered = filterRosterRegisterRows(listed.rows, {
        staffId,
        search,
        locationId,
      });

      const locationCode =
        filtered.find((row) => row.locationCode)?.locationCode ??
        listed.rows.find((row) => row.locationCode)?.locationCode ??
        null;

      const filters: RosterExportFilterMeta = {
        locationLabel: params.get("locationLabel")?.trim() || undefined,
        staffLabel: params.get("staffLabel")?.trim() || undefined,
        departmentLabel: params.get("departmentLabel")?.trim() || undefined,
        groupLabel: params.get("groupLabel")?.trim() || groupLabelFromShowOnly(showOnlyOrgDepartments),
        sourceLabel: params.get("sourceLabel")?.trim() || undefined,
        search: search || undefined,
      };

      const filename = e3RosterRegisterExportFilename(dateFrom, dateTo, format, locationCode);

      if (format === "pdf") {
        const buf = await buildRosterRegisterPdfBuffer(filtered, dateFrom, dateTo, {
          teamStaff: listed.teamStaff,
          locationCode,
          staffId,
          search,
          filters,
        });
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      const built = buildRosterRegisterExcelSheet(filtered, dateFrom, dateTo, {
        teamStaff: listed.teamStaff,
        locationCode,
        staffId,
        search,
        filters,
      });
      const buf = await writeRosterRegisterXlsxBuffer(built.sheet);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    request,
    { anyCapability: [...ROSTER_EXPORT_CAPABILITIES] },
  );
}
