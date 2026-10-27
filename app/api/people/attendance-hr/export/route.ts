import { NextResponse } from "next/server";

import { displayDepartmentShown, parseShowOrgDepartmentsParam } from "@/lib/exclude-org-departments";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  getAttendanceHrDaily,
  getAttendanceHrPunches,
  listAttendanceDeviceLogs,
  listAttendanceHrMappings,
  listAttendanceImports,
} from "@/lib/attendance-hr.functions";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import { formatPayrollBlockReasons } from "@/lib/attendance-hr/payroll";
import {
  ATTENDANCE_LISTING_COLUMNS,
  attendanceListingCells,
  buildAttendanceListingCsv,
  formatPunchTime12h,
} from "@/lib/attendance-display";
import {
  attendanceHrRowMatchesKpiFilter,
  attendanceHrToListingSource,
  type AttendanceHrKpiFilter,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";
import {
  DEVICE_LOG_EXPORT_COLUMNS,
  buildDeviceLogDaysCsv,
  deviceLogDayExportObject,
} from "@/lib/attendance-hr/device-logs";
import {
  appendExcelSheets,
  buildE3AttendanceHrWorkbookSheets,
  e3AttendanceExportFilename,
  sheetsForExportFocus,
  type ExportCorrection,
  type ExportFilterMeta,
  type ExportImportFile,
  type ExportOtClaim,
  type ExportPunchRow,
  type ExportUnmatchedMapping,
} from "@/lib/attendance-hr/export-workbook";
import { isOtClaimSubmittedForExport } from "@/lib/hr-ot";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type OtExportDbRow = {
  staff_id?: string | null;
  work_date?: string | null;
  rate_type?: string | null;
  eligible_minutes?: number | null;
  claimed_minutes?: number | null;
  approved_minutes?: number | null;
  rate_multiplier?: number | null;
  amount_qar?: number | null;
  basic_qar_snapshot?: number | null;
  hours_per_day_snapshot?: number | null;
  days_per_month_snapshot?: number | null;
  status?: string | null;
  notes?: string | null;
  purpose?: string | null;
  submitted_by?: string | null;
  verified_signer_name?: string | null;
  ops_approved_signer_name?: string | null;
  approved_signer_name?: string | null;
  gm_approved_signer_name?: string | null;
  verified_by?: string | null;
  ops_approved_by?: string | null;
  approved_by?: string | null;
  gm_approved_by?: string | null;
  staff?:
    | { employee_code?: string | null; full_name?: string | null; department?: string | null }
    | { employee_code?: string | null; full_name?: string | null; department?: string | null }[]
    | null;
  locations?: { code?: string | null } | { code?: string | null }[] | null;
};

function oneRel<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Resolve auth user ids → display names (profiles, then staff). */
async function displayNamesForUserIds(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return names;

  const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
  for (const row of profiles ?? []) {
    const name = (row.display_name as string | null)?.trim();
    if (name) names.set(String(row.id), name);
  }
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length) {
    const { data: staffRows } = await supabaseAdmin
      .from("staff")
      .select("user_id, full_name")
      .in("user_id", missing)
      .is("deleted_at", null);
    for (const row of staffRows ?? []) {
      const userId = row.user_id as string | null;
      const name = (row.full_name as string | null)?.trim();
      if (userId && name && !names.has(userId)) names.set(userId, name);
    }
  }
  return names;
}

type CorrectionExportDbRow = {
  id?: string | null;
  requested_at?: string | null;
  staff_id?: string | null;
  work_date?: string | null;
  kind?: string | null;
  original_value?: unknown;
  new_value?: unknown;
  reason?: string | null;
  requested_by?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  status?: string | null;
  current_step_role?: string | null;
  review_note?: string | null;
  staff?:
    | { employee_code?: string | null; full_name?: string | null }
    | { employee_code?: string | null; full_name?: string | null }[]
    | null;
  locations?: { code?: string | null } | { code?: string | null }[] | null;
};

/** Punch / missed-punch corrections + approval seats for sheet 07 and Audit Trail. */
async function loadExportCorrections(input: {
  // Auth-scoped client; approval steps + names use supabaseAdmin (service-role table).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any };
  dateFrom: string;
  dateTo: string;
  locationId: string | null;
  staffIdAllowlist: Set<string> | null;
}): Promise<ExportCorrection[]> {
  let corrQ = input.supabase
    .from("attendance_corrections")
    .select(
      "id, requested_at, staff_id, work_date, kind, original_value, new_value, reason, requested_by, reviewed_by, reviewed_at, status, current_step_role, review_note, staff:staff_id(employee_code, full_name), locations:location_id(code)",
    )
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo)
    .order("requested_at", { ascending: false })
    .limit(2000);
  if (input.locationId) corrQ = corrQ.eq("location_id", input.locationId);
  const { data: corrRows, error: corrErr } = await corrQ;
  if (corrErr || !corrRows?.length) return [];

  let rows = corrRows as CorrectionExportDbRow[];
  if (input.staffIdAllowlist) {
    rows = rows.filter((r) => r.staff_id && input.staffIdAllowlist!.has(String(r.staff_id)));
  }
  if (!rows.length) return [];

  const correctionIds = rows.map((r) => String(r.id)).filter(Boolean);
  const stepsByCorrection = new Map<
    string,
    Array<{ stepRole: string; status: string; actedBy: string | null; actedAt: string | null; stepOrder: number }>
  >();
  if (correctionIds.length) {
    const { data: stepRows, error: stepErr } = await supabaseAdmin
      .from("attendance_correction_approvals")
      .select("correction_id, step_order, step_role, status, acted_by, acted_at")
      .in("correction_id", correctionIds)
      .order("step_order");
    if (!stepErr && stepRows) {
      for (const step of stepRows) {
        const id = String(step.correction_id);
        const list = stepsByCorrection.get(id) ?? [];
        list.push({
          stepRole: String(step.step_role ?? ""),
          status: String(step.status ?? ""),
          actedBy: step.acted_by == null ? null : String(step.acted_by),
          actedAt: step.acted_at == null ? null : String(step.acted_at),
          stepOrder: Number(step.step_order ?? 0),
        });
        stepsByCorrection.set(id, list);
      }
    }
  }

  const nameIds: string[] = [];
  for (const r of rows) {
    if (r.requested_by) nameIds.push(String(r.requested_by));
    if (r.reviewed_by) nameIds.push(String(r.reviewed_by));
  }
  for (const steps of stepsByCorrection.values()) {
    for (const step of steps) {
      if (step.actedBy) nameIds.push(step.actedBy);
    }
  }
  const names = await displayNamesForUserIds(nameIds);

  return rows.map((r) => {
    const staff = oneRel(r.staff);
    const loc = oneRel(r.locations);
    const id = r.id == null ? null : String(r.id);
    const requestedBy = r.requested_by == null ? null : String(r.requested_by);
    const reviewedBy = r.reviewed_by == null ? null : String(r.reviewed_by);
    const steps = (id ? stepsByCorrection.get(id) ?? [] : [])
      .slice()
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((step) => ({
        stepRole: step.stepRole,
        status: step.status,
        actedByName: step.actedBy ? names.get(step.actedBy) ?? null : null,
        actedAt: step.actedAt,
      }));
    return {
      id,
      requestedAt: String(r.requested_at ?? ""),
      staffId: r.staff_id == null ? null : String(r.staff_id),
      employeeCode: staff?.employee_code ?? null,
      employeeName: staff?.full_name ?? null,
      workDate: r.work_date == null ? null : String(r.work_date).slice(0, 10),
      kind: String(r.kind ?? ""),
      originalValue: r.original_value,
      newValue: r.new_value,
      reason: String(r.reason ?? ""),
      requestedBy,
      requestedByName: requestedBy ? names.get(requestedBy) ?? null : null,
      reviewedBy,
      reviewedByName: reviewedBy ? names.get(reviewedBy) ?? null : null,
      reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
      status: String(r.status ?? ""),
      currentStepRole: r.current_step_role == null ? null : String(r.current_step_role),
      reviewNote: r.review_note == null ? null : String(r.review_note),
      steps,
      locationCode: loc?.code ?? null,
    };
  });
}

async function loadExportOtClaims(input: {
  // Auth-scoped client; name backfill uses supabaseAdmin separately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any };
  dateFrom: string;
  dateTo: string;
  locationId: string | null;
  /** When set, keep only claims for staff already in the filtered attendance set. */
  staffIdAllowlist: Set<string> | null;
}): Promise<ExportOtClaim[]> {
  let otQ = input.supabase
    .from("hr_ot_claims")
    .select(
      "staff_id, work_date, rate_type, eligible_minutes, claimed_minutes, approved_minutes, rate_multiplier, amount_qar, basic_qar_snapshot, hours_per_day_snapshot, days_per_month_snapshot, status, notes, purpose, submitted_by, verified_by, verified_signer_name, ops_approved_by, ops_approved_signer_name, approved_by, approved_signer_name, gm_approved_by, gm_approved_signer_name, staff:staff_id(employee_code, full_name, department), locations:location_id(code)",
    )
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo)
    .neq("status", "draft")
    .limit(2000);
  if (input.locationId) otQ = otQ.eq("location_id", input.locationId);
  const { data: otRows, error: otErr } = await otQ;
  if (otErr || !otRows) return [];

  const rows = (otRows as OtExportDbRow[]).filter((r) => isOtClaimSubmittedForExport(String(r.status ?? "")));
  const nameIds: string[] = [];
  for (const r of rows) {
    if (r.submitted_by) nameIds.push(String(r.submitted_by));
    if (r.verified_by && !r.verified_signer_name) nameIds.push(String(r.verified_by));
    if (r.ops_approved_by && !r.ops_approved_signer_name) nameIds.push(String(r.ops_approved_by));
    if (r.approved_by && !r.approved_signer_name) nameIds.push(String(r.approved_by));
    if (r.gm_approved_by && !r.gm_approved_signer_name) nameIds.push(String(r.gm_approved_by));
  }
  const names = await displayNamesForUserIds(nameIds);

  const mapped: ExportOtClaim[] = rows.map((r) => {
    const staff = oneRel(r.staff);
    const loc = oneRel(r.locations);
    const submittedBy = r.submitted_by ? String(r.submitted_by) : null;
    return {
      staffId: String(r.staff_id ?? ""),
      workDate: String(r.work_date ?? "").slice(0, 10),
      rateType: String(r.rate_type ?? "weekday"),
      calculatedMinutes: Number(r.claimed_minutes ?? r.eligible_minutes ?? 0),
      approvedMinutes: r.approved_minutes == null ? null : Number(r.approved_minutes),
      status: String(r.status ?? ""),
      notes: r.notes == null ? null : String(r.notes),
      purpose: r.purpose == null ? null : String(r.purpose),
      rateMultiplier: r.rate_multiplier == null ? null : Number(r.rate_multiplier),
      amountQar: r.amount_qar == null ? null : Number(r.amount_qar),
      basicQarSnapshot: r.basic_qar_snapshot == null ? null : Number(r.basic_qar_snapshot),
      hoursPerDaySnapshot: r.hours_per_day_snapshot == null ? null : Number(r.hours_per_day_snapshot),
      daysPerMonthSnapshot: r.days_per_month_snapshot == null ? null : Number(r.days_per_month_snapshot),
      requestedByName: submittedBy ? names.get(submittedBy) ?? null : null,
      siteApproverName: (r.verified_signer_name as string | null)?.trim()
        || (r.verified_by ? names.get(String(r.verified_by)) ?? null : null),
      hooApproverName: (r.ops_approved_signer_name as string | null)?.trim()
        || (r.ops_approved_by ? names.get(String(r.ops_approved_by)) ?? null : null),
      hrApproverName: (r.approved_signer_name as string | null)?.trim()
        || (r.approved_by ? names.get(String(r.approved_by)) ?? null : null),
      gmApproverName: (r.gm_approved_signer_name as string | null)?.trim()
        || (r.gm_approved_by ? names.get(String(r.gm_approved_by)) ?? null : null),
      employeeCode: staff?.employee_code ?? null,
      employeeName: staff?.full_name ?? null,
      locationCode: loc?.code ?? null,
    };
  });

  if (!input.staffIdAllowlist) return mapped;
  return mapped.filter((c) => input.staffIdAllowlist!.has(c.staffId));
}

function asUuid(value: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

/** departmentId=… and/or departmentIds=a,b (same shape as deviceUserKeys). */
function departmentIdsFromParams(params: URLSearchParams): string[] {
  return [
    ...new Set(
      [
        ...params.getAll("departmentId"),
        ...params.getAll("departmentIds").flatMap((value) => value.split(",")),
      ]
        .map((value) => asUuid(value.trim()))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

function listingSources(daily: AttendanceHrReportRow[]) {
  return daily.map((r) => attendanceHrToListingSource(r));
}

function filterMetaFromParams(params: URLSearchParams): ExportFilterMeta {
  return {
    locationLabel: params.get("locationLabel")?.trim() || undefined,
    departmentLabel: params.get("departmentLabel")?.trim() || undefined,
    statusLabel: params.get("statusLabel")?.trim() || params.get("status")?.trim() || undefined,
  };
}

function focusFilenameKind(
  focus: string | null,
): "xlsx" | "employee" | "matrix" | "payroll-input" {
  switch ((focus ?? "").toLowerCase()) {
    case "employee":
    case "employee-summary":
      return "employee";
    case "matrix":
      return "matrix";
    case "payroll":
    case "payroll-input":
      return "payroll-input";
    default:
      return "xlsx";
  }
}

export async function GET(request: Request) {
  // Default = Excel workbook when format omitted (UI Excel button has no format=).
  const rawFormat = searchParams(request).get("format") ?? "xlsx";
  const format = rawFormat === "excel" ? "xlsx" : rawFormat;
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = asUuid(params.get("locationId"));
      const staffId = asUuid(params.get("staffId"));
      const status = params.get("status") || null;
      const staffQ = params.get("staffQ")?.trim() || undefined;
      const departmentIds = departmentIdsFromParams(params);
      const dateFrom = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const dateTo = params.get("to") ?? new Date().toISOString().slice(0, 10);
      const filters = filterMetaFromParams(params);
      const focus = params.get("focus");

      if (params.get("view") === "device-logs") {
        const deviceId = asUuid(params.get("deviceId"));
        const deviceUserKeys = [
          ...new Set(
            [...params.getAll("deviceUserKey"), ...(params.get("deviceUserKeys")?.split(",") ?? [])]
              .map((key) => key.trim())
              .filter(Boolean),
          ),
        ];
        const biometricUserId = !deviceUserKeys.length
          ? params.get("biometricUserId")?.trim() || undefined
          : undefined;
        const q = params.get("q")?.trim() || undefined;
        const logs = await listAttendanceDeviceLogs({
          locationId,
          deviceId,
          dateFrom,
          dateTo,
          deviceUserKeys: deviceUserKeys.length ? deviceUserKeys : undefined,
          biometricUserId,
          q,
        });
        const dayRows = logs.rows;

        if (format === "csv") {
          return new NextResponse(buildDeviceLogDaysCsv(dayRows, formatPunchTime12h), {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="E3_Device_Logs_${dateFrom}_to_${dateTo}.csv"`,
            },
          });
        }

        if (format === "pdf") {
          const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
          const autoTable = autoTableMod.default;
          const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
          doc.setFontSize(14);
          doc.text(`Device logs ${dateFrom} – ${dateTo}`, 40, 36);
          autoTable(doc, {
            startY: 48,
            head: [[...DEVICE_LOG_EXPORT_COLUMNS]],
            body: dayRows.map((row) => {
              const obj = deviceLogDayExportObject(
                row,
                formatPunchTime12h(row.punchInAt) || "",
                formatPunchTime12h(row.punchOutAt) || "",
              );
              return DEVICE_LOG_EXPORT_COLUMNS.map((col) => obj[col] || "—");
            }),
            styles: { fontSize: 8 },
          });
          const buf = Buffer.from(doc.output("arraybuffer"));
          return new NextResponse(new Uint8Array(buf), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="E3_Device_Logs_${dateFrom}_to_${dateTo}.pdf"`,
            },
          });
        }

        const { objectsToRows, writeXlsxBuffer } = await import("@/lib/spreadsheet/workbook");
        const buf = await writeXlsxBuffer([
          {
            name: "Device logs",
            rows: objectsToRows(
              dayRows.map((row) =>
                deviceLogDayExportObject(
                  row,
                  formatPunchTime12h(row.punchInAt) || "",
                  formatPunchTime12h(row.punchOutAt) || "",
                ),
              ),
            ),
          },
        ]);
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="E3_Device_Logs_${dateFrom}_to_${dateTo}.xlsx"`,
          },
        });
      }

      if (format === "payroll") {
        const { objectsToRows, writeXlsxBuffer } = await import("@/lib/spreadsheet/workbook");
        const payroll = await getPayrollAttendanceSummary({ locationId, dateFrom, dateTo });
        const buf = await writeXlsxBuffer([
          {
            name: "Payroll",
            rows: objectsToRows(
              payroll.rows.map((r) => ({
                Location: r.locationLabel ?? "—",
                Employee: r.staffName,
                "Employee code": r.employeeCode,
                Present: r.daysPresent,
                Absent: r.daysAbsent,
                Late: r.daysLate,
                "Missed punches": r.missedPunches,
                "Worked hours": Math.round((r.workedMinutes / 60) * 100) / 100,
                "Overtime hours": Math.round((r.overtimeMinutes / 60) * 100) / 100,
                "Ready for payroll": r.payrollReady ? "Yes" : "No",
                "Block reasons": formatPayrollBlockReasons(r.blockReasons ?? []).join("; "),
              })),
            ),
          },
        ]);
        const filename = e3AttendanceExportFilename(dateFrom, dateTo, "payroll");
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      const [dailyRows, punches, unmatched, imports] = await Promise.all([
        getAttendanceHrDaily({
          locationId,
          dateFrom,
          dateTo,
          status,
          staffId,
          staffQ,
          departmentIds: departmentIds.length ? departmentIds : undefined,
        }),
        getAttendanceHrPunches({ locationId, dateFrom, dateTo }),
        listAttendanceHrMappings({ locationId, unmatchedOnly: true }),
        listAttendanceImports({ locationId }),
      ]);

      const showOrgDepartments =
        departmentIds.length === 0 ? parseShowOrgDepartmentsParam(params.get("showOrgDepartments")) : [];
      const kpiFilterRaw = params.get("kpiFilter")?.trim() || null;
      const kpiFilter = (
        [
          "total",
          "staff",
          "present",
          "absent",
          "late",
          "missed_punch",
          "unscheduled",
        ] as const
      ).includes(kpiFilterRaw as AttendanceHrKpiFilter)
        ? (kpiFilterRaw as AttendanceHrKpiFilter)
        : null;
      // Same row set as the on-screen listing (org-dept chips + KPI strip filter).
      let daily = showOrgDepartments.length
        ? dailyRows.filter((row) => displayDepartmentShown(row.department, showOrgDepartments))
        : dailyRows;
      if (kpiFilter) {
        daily = daily.filter((row) => attendanceHrRowMatchesKpiFilter(row, kpiFilter));
      }
      const listing = listingSources(daily);

      if (format === "csv") {
        const filename = e3AttendanceExportFilename(dateFrom, dateTo, "csv");
        return new NextResponse(buildAttendanceListingCsv(listing), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      if (format === "pdf") {
        const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
        const autoTable = autoTableMod.default;
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        doc.setFontSize(14);
        doc.text(`E3 HR Attendance ${dateFrom} – ${dateTo}`, 40, 36);
        if (filters.locationLabel || filters.departmentLabel) {
          doc.setFontSize(9);
          doc.text(
            [
              filters.locationLabel ? `Location: ${filters.locationLabel}` : "Location: All Locations",
              filters.departmentLabel ? `Department: ${filters.departmentLabel}` : null,
            ]
              .filter(Boolean)
              .join("  |  "),
            40,
            48,
          );
        }
        autoTable(doc, {
          startY: filters.locationLabel || filters.departmentLabel ? 56 : 48,
          head: [[...ATTENDANCE_LISTING_COLUMNS]],
          body: listing.map((r) => {
            const cells = attendanceListingCells(r);
            return [
              cells.location,
              cells.userName,
              cells.deviceUserId,
              cells.date,
              cells.reportingTime,
              cells.shiftStart,
              cells.firstCheckIn,
              cells.lastCheckOut,
              cells.totalHours,
              cells.latePunch,
              cells.overtime,
              cells.overtimeHours,
              cells.status,
            ];
          }),
          styles: { fontSize: 8 },
        });
        const buf = Buffer.from(doc.output("arraybuffer"));
        const filename = e3AttendanceExportFilename(dateFrom, dateTo, "pdf");
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      // Submitted OT claims (+ corrections) for OT / Missed Punches / Audit (best-effort).
      let otClaims: ExportOtClaim[] = [];
      let corrections: ExportCorrection[] = [];
      // Keep OT / correction rows aligned with listing filters (department / staff / search).
      const staffScoped =
        departmentIds.length > 0 ||
        showOrgDepartments.length > 0 ||
        Boolean(staffId) ||
        Boolean(staffQ);
      const staffIdAllowlist = staffScoped
        ? new Set(daily.map((row) => row.staff_id).filter((id): id is string => Boolean(id)))
        : null;
      try {
        otClaims = await loadExportOtClaims({
          supabase: context.supabase,
          dateFrom,
          dateTo,
          locationId,
          staffIdAllowlist,
        });
      } catch {
        otClaims = [];
      }
      try {
        corrections = await loadExportCorrections({
          supabase: context.supabase,
          dateFrom,
          dateTo,
          locationId,
          staffIdAllowlist,
        });
      } catch {
        corrections = [];
      }

      // xlsx-js-style: drop-in SheetJS with cell fills (community xlsx ignores styles).
      const XLSX = await import("xlsx-js-style");
      const wb = XLSX.utils.book_new();
      const sheets = buildE3AttendanceHrWorkbookSheets({
        daily,
        punches: punches as ExportPunchRow[],
        unmatched: unmatched as ExportUnmatchedMapping[],
        imports: imports as ExportImportFile[],
        otClaims,
        corrections,
        dateFrom,
        dateTo,
        filters,
        sheetNames: sheetsForExportFocus(focus),
      });
      appendExcelSheets(XLSX, wb, sheets);

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const filename = e3AttendanceExportFilename(dateFrom, dateTo, focusFilenameKind(focus));
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    request,
    { capability: format === "payroll" ? "payroll.view" : "attendance.export" },
  );
}
