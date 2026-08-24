import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  getAttendanceHrDaily,
  getAttendanceHrPunches,
  listAttendanceHrMappings,
  listAttendanceImports,
} from "@/lib/attendance-hr.functions";
import {
  attendanceHrExportStaffName,
  formatAttendanceHrLocation,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function asUuid(value: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function exportDisplayRows(daily: AttendanceHrReportRow[]) {
  return daily.map((r) => ({
    work_date: r.work_date,
    staff_name: attendanceHrExportStaffName(r),
    employee_code: r.employee_code ?? "",
    location: formatAttendanceHrLocation(r.location_code, r.location_name),
    location_code: r.location_code ?? "",
    location_name: r.location_name ?? "",
    status: r.status,
    actual_in: r.actual_in ?? "",
    actual_out: r.actual_out ?? "",
    late_minutes: r.late_minutes,
    overtime_minutes: r.overtime_minutes,
    punch_count: r.punch_count,
    biometric_user_id: r.biometric_user_id ?? "",
  }));
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (_context, req) => {
      const params = searchParams(req);
      const locationId = asUuid(params.get("locationId"));
      const staffId = asUuid(params.get("staffId"));
      const status = params.get("status") || null;
      const staffQ = params.get("staffQ")?.trim() || undefined;
      const dateFrom = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const dateTo = params.get("to") ?? new Date().toISOString().slice(0, 10);
      const format = params.get("format") ?? "xlsx";

      const [daily, punches, unmatched, imports] = await Promise.all([
        getAttendanceHrDaily({ locationId, dateFrom, dateTo, status, staffId, staffQ }),
        getAttendanceHrPunches({ locationId, dateFrom, dateTo }),
        listAttendanceHrMappings({ locationId, unmatchedOnly: true }),
        listAttendanceImports({ locationId }),
      ]);

      const display = exportDisplayRows(daily);
      const missed = daily.filter((r) => r.missed_punch);
      const late = daily.filter((r) => Number(r.late_minutes) > 0 || Number(r.early_leave_minutes) > 0);
      const absence = daily.filter((r) =>
        ["absent", "annual_leave", "sick_leave", "unpaid_leave", "weekly_off", "public_holiday"].includes(String(r.status)),
      );

      if (format === "csv") {
        const header = [
          "work_date",
          "staff_name",
          "employee_code",
          "location",
          "location_code",
          "location_name",
          "status",
          "actual_in",
          "actual_out",
          "late_minutes",
          "overtime_minutes",
        ];
        const body = display
          .map((r) =>
            [
              r.work_date,
              r.staff_name,
              r.employee_code,
              r.location,
              r.location_code,
              r.location_name,
              r.status,
              r.actual_in,
              r.actual_out,
              r.late_minutes,
              r.overtime_minutes,
            ]
              .map(csvCell)
              .join(","),
          )
          .join("\n");
        return new NextResponse(`${header.join(",")}\n${body}`, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="attendance-${dateFrom}-${dateTo}.csv"`,
          },
        });
      }

      if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        doc.setFontSize(14);
        doc.text(`Attendance HR ${dateFrom} – ${dateTo}`, 40, 36);
        autoTable(doc, {
          startY: 48,
          head: [["Date", "Staff", "Location", "Status", "In", "Out", "Late", "OT"]],
          body: display.slice(0, 200).map((r) => [
            r.work_date,
            r.staff_name,
            r.location,
            r.status,
            r.actual_in ? String(r.actual_in).slice(11, 16) : "",
            r.actual_out ? String(r.actual_out).slice(11, 16) : "",
            String(r.late_minutes ?? 0),
            String(r.overtime_minutes ?? 0),
          ]),
          styles: { fontSize: 8 },
        });
        const buf = Buffer.from(doc.output("arraybuffer"));
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="attendance-hr-${dateFrom}-${dateTo}.pdf"`,
          },
        });
      }

      const wb = XLSX.utils.book_new();
      const sheet = (name: string, rows: unknown[]) => {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows as Record<string, unknown>[]), name.slice(0, 31));
      };
      sheet("HR Summary", display);
      sheet("Daily Attendance", display);
      sheet("Raw Punches", punches);
      sheet("Missed Punches", missed.map((r) => ({
        work_date: r.work_date,
        staff_name: attendanceHrExportStaffName(r),
        location: formatAttendanceHrLocation(r.location_code, r.location_name),
        status: r.status,
      })));
      sheet("Late Early Exit", late.map((r) => ({
        work_date: r.work_date,
        staff_name: attendanceHrExportStaffName(r),
        location: formatAttendanceHrLocation(r.location_code, r.location_name),
        late_minutes: r.late_minutes,
        early_leave_minutes: r.early_leave_minutes,
      })));
      sheet("Absence Leave", absence.map((r) => ({
        work_date: r.work_date,
        staff_name: attendanceHrExportStaffName(r),
        location: formatAttendanceHrLocation(r.location_code, r.location_name),
        status: r.status,
      })));
      sheet("Unmatched Users", unmatched);
      sheet("Import Errors", imports);
      sheet(
        "Audit Trail",
        imports.map((r) => ({ file: r.original_filename, status: r.status, at: r.created_at })),
      );

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="attendance-hr-${dateFrom}-${dateTo}.xlsx"`,
        },
      });
    },
    request,
    { capability: "attendance.export" },
  );
}
