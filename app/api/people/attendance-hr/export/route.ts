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
  ATTENDANCE_LISTING_COLUMNS,
  attendanceListingCells,
  attendanceListingExportObjects,
  buildAttendanceListingCsv,
} from "@/lib/attendance-display";
import {
  attendanceHrExportStaffName,
  attendanceHrToListingSource,
  formatAttendanceHrLocation,
  type AttendanceHrReportRow,
} from "@/lib/attendance-hr/report";

function asUuid(value: string | null): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function listingSources(daily: AttendanceHrReportRow[]) {
  return daily.map((r) => attendanceHrToListingSource(r));
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

      const listing = listingSources(daily);
      const display = attendanceListingExportObjects(listing);
      const missed = daily.filter((r) => r.missed_punch);
      const late = daily.filter((r) => Number(r.late_minutes) > 0 || Number(r.early_leave_minutes) > 0);
      const absence = daily.filter((r) =>
        ["absent", "annual_leave", "sick_leave", "unpaid_leave", "weekly_off", "public_holiday"].includes(String(r.status)),
      );

      if (format === "csv") {
        return new NextResponse(buildAttendanceListingCsv(listing), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="attendance-${dateFrom}-${dateTo}.csv"`,
          },
        });
      }

      if (format === "pdf") {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        doc.setFontSize(14);
        doc.text(`Attendance ${dateFrom} – ${dateTo}`, 40, 36);
        autoTable(doc, {
          startY: 48,
          head: [[...ATTENDANCE_LISTING_COLUMNS]],
          body: listing.slice(0, 200).map((r) => {
            const cells = attendanceListingCells(r);
            return [
              cells.location,
              cells.userName,
              cells.date,
              cells.firstCheckIn,
              cells.lastCheckOut,
              cells.totalHours,
              cells.overtime,
              cells.overtimeHours,
              cells.status,
            ];
          }),
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
