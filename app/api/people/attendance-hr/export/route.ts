import { NextResponse } from "next/server";

import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  getAttendanceHrDaily,
  getAttendanceHrPunches,
  listAttendanceDeviceLogs,
  listAttendanceHrMappings,
  listAttendanceImports,
} from "@/lib/attendance-hr.functions";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import {
  ATTENDANCE_LISTING_COLUMNS,
  attendanceListingCells,
  buildAttendanceListingCsv,
  formatPunchTime12h,
} from "@/lib/attendance-display";
import {
  attendanceHrToListingSource,
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

function asUuid(value: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
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
      const departmentId = asUuid(params.get("departmentId"));
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

        const XLSX = await import("xlsx");
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
            dayRows.map((row) =>
              deviceLogDayExportObject(
                row,
                formatPunchTime12h(row.punchInAt) || "",
                formatPunchTime12h(row.punchOutAt) || "",
              ),
            ),
          ),
          "Device logs",
        );
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="E3_Device_Logs_${dateFrom}_to_${dateTo}.xlsx"`,
          },
        });
      }

      if (format === "payroll") {
        const XLSX = await import("xlsx");
        const payroll = await getPayrollAttendanceSummary({ locationId, dateFrom, dateTo });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(
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
            })),
          ),
          "Payroll",
        );
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
        const filename = e3AttendanceExportFilename(dateFrom, dateTo, "payroll");
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      const [daily, punches, unmatched, imports] = await Promise.all([
        getAttendanceHrDaily({ locationId, dateFrom, dateTo, status, staffId, staffQ, departmentId }),
        getAttendanceHrPunches({ locationId, dateFrom, dateTo }),
        listAttendanceHrMappings({ locationId, unmatchedOnly: true }),
        listAttendanceImports({ locationId }),
      ]);

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
          body: listing.slice(0, 200).map((r) => {
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

      // Optional OT claims + corrections for OT / Audit sheets (best-effort; empty on failure).
      let otClaims: ExportOtClaim[] = [];
      let corrections: ExportCorrection[] = [];
      {
        let otQ = context.supabase
          .from("hr_ot_claims")
          .select("staff_id, work_date, rate_type, eligible_minutes, claimed_minutes, approved_minutes, status, notes")
          .gte("work_date", dateFrom)
          .lte("work_date", dateTo)
          .limit(2000);
        if (locationId) otQ = otQ.eq("location_id", locationId);
        const { data: otRows, error: otErr } = await otQ;
        if (!otErr && otRows) {
          otClaims = otRows.map((r) => ({
            staffId: String(r.staff_id ?? ""),
            workDate: String(r.work_date ?? "").slice(0, 10),
            rateType: String(r.rate_type ?? "weekday"),
            calculatedMinutes: Number(r.claimed_minutes ?? r.eligible_minutes ?? 0),
            approvedMinutes: r.approved_minutes == null ? null : Number(r.approved_minutes),
            status: String(r.status ?? ""),
            notes: r.notes == null ? null : String(r.notes),
          }));
        }
      }
      {
        let corrQ = context.supabase
          .from("attendance_corrections")
          .select(
            "requested_at, staff_id, work_date, kind, original_value, new_value, reason, requested_by, reviewed_by, status, staff:staff_id(employee_code, full_name)",
          )
          .gte("work_date", dateFrom)
          .lte("work_date", dateTo)
          .order("requested_at", { ascending: false })
          .limit(500);
        if (locationId) corrQ = corrQ.eq("location_id", locationId);
        const { data: corrRows, error: corrErr } = await corrQ;
        if (!corrErr && corrRows) {
          corrections = corrRows.map((r) => {
            const staff = r.staff as { employee_code?: string | null; full_name?: string | null } | null;
            return {
              requestedAt: String(r.requested_at ?? ""),
              staffId: r.staff_id == null ? null : String(r.staff_id),
              employeeCode: staff?.employee_code ?? null,
              employeeName: staff?.full_name ?? null,
              workDate: r.work_date == null ? null : String(r.work_date).slice(0, 10),
              kind: String(r.kind ?? ""),
              originalValue: r.original_value,
              newValue: r.new_value,
              reason: String(r.reason ?? ""),
              requestedBy: r.requested_by == null ? null : String(r.requested_by),
              reviewedBy: r.reviewed_by == null ? null : String(r.reviewed_by),
              status: String(r.status ?? ""),
            };
          });
        }
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
      appendExcelSheets(XLSX as unknown as typeof import("xlsx"), wb, sheets);

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
