import { describe, expect, it } from "vitest";

import {
  E3_HR_EXPORT_SHEET_NAMES,
  EMPLOYEE_SUMMARY_HEADERS,
  buildE3AttendanceHrWorkbookSheets,
  e3AttendanceExportFilename,
  employeeSummaryCellFills,
  resolveHrAttendanceStatus,
  resolveHrPunchStatus,
  sheetsForExportFocus,
} from "./export-workbook";
import { ATTENDANCE_PCT_GREEN_THRESHOLD, EXCEL_THEME, MATRIX_CODE_THEME, matrixCodeFillRgb } from "./excel-theme";
import type { AttendanceHrReportRow } from "./report";

function day(
  partial: Partial<AttendanceHrReportRow> & Pick<AttendanceHrReportRow, "work_date" | "status">,
): AttendanceHrReportRow {
  return {
    id: partial.id ?? "r1",
    location_id: partial.location_id ?? "loc-1",
    staff_id: partial.staff_id ?? "staff-a",
    biometric_user_id: partial.biometric_user_id ?? "9",
    work_date: partial.work_date,
    status: partial.status,
    actual_in: partial.actual_in ?? null,
    actual_out: partial.actual_out ?? null,
    scheduled_in: partial.scheduled_in ?? null,
    scheduled_out: partial.scheduled_out ?? null,
    late_minutes: partial.late_minutes ?? 0,
    early_leave_minutes: partial.early_leave_minutes ?? 0,
    overtime_minutes: partial.overtime_minutes ?? 0,
    missed_punch: partial.missed_punch ?? false,
    punch_count: partial.punch_count ?? 0,
    worked_minutes: partial.worked_minutes ?? null,
    employment_type: partial.employment_type ?? "permanent",
    staff_name: partial.staff_name ?? "Ada Lovelace",
    department: partial.department ?? "Ops",
    job_title: partial.job_title ?? "Supervisor",
    employee_code: partial.employee_code ?? "INF-CC-STF01",
    qid: partial.qid ?? null,
    location_code: partial.location_code ?? "INF-CC",
    location_name: partial.location_name ?? "InflataPark",
    location_region: partial.location_region ?? null,
    expected_minutes: partial.expected_minutes ?? 540,
  };
}

describe("E3 HR export workbook", () => {
  it("emits numbered sheets in the HR report order", () => {
    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-08-28",
          status: "present",
          actual_in: "2026-08-28T04:00:00.000Z",
          actual_out: "2026-08-28T13:00:00.000Z",
          worked_minutes: 540,
        }),
      ],
      punches: [],
      unmatched: [{ biometric_user_id: "99", device_name: "Ghost", location_id: "loc-1" }],
      imports: [],
      dateFrom: "2026-08-28",
      dateTo: "2026-08-29",
      generatedAt: new Date("2026-09-01T10:00:00.000Z"),
      filters: { locationLabel: "INF-CC", departmentLabel: "All Departments" },
    });

    expect(sheets.map((s) => s.name)).toEqual([...E3_HR_EXPORT_SHEET_NAMES]);
    expect(sheets[0]!.aoa[0]![0]).toBe("E3 – Monthly Attendance Report");
    expect(String(sheets[0]!.aoa[3]![0])).toMatch(/Filters:.*INF-CC/);
    expect(sheets[0]!.aoa.some((row) => row[0] === "Attendance Summary")).toBe(true);

    const daily = sheets.find((s) => s.name === "04 Daily Attendance")!;
    const headerRow = daily.filterHeaderRow!;
    expect(daily.aoa[headerRow]).toContain("Attendance Status");
    expect(daily.aoa[headerRow]).toContain("Punch Status");
    expect(daily.titleRowCount).toBeGreaterThan(0);

    const issues = sheets.find((s) => s.name === "10 Data Issues")!;
    expect(issues.aoa.some((row) => row[0] === "Unmatched Biometric User")).toBe(true);

    const audit = sheets.find((s) => s.name === "12 Audit Trail")!;
    expect(audit.aoa.flat().join(" ")).toMatch(/fills when manual/i);
  });

  it("keeps Attendance Status Present when Punch Status is Missing OUT", () => {
    const row = day({
      work_date: "2026-08-28",
      status: "missed_punch",
      missed_punch: true,
      actual_in: "2026-08-28T04:00:00.000Z",
      actual_out: null,
    });
    expect(resolveHrPunchStatus(row)).toBe("Missing OUT");
    expect(resolveHrAttendanceStatus(row)).toBe("Present");
  });

  it("puts Attendance Status and Punch Status on Daily Attendance rows", () => {
    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-08-28",
          status: "missed_punch",
          missed_punch: true,
          actual_in: "2026-08-28T04:00:00.000Z",
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      dateFrom: "2026-08-28",
      dateTo: "2026-08-28",
    });
    const daily = sheets.find((s) => s.name === "04 Daily Attendance")!;
    const headers = daily.aoa[daily.filterHeaderRow!] as string[];
    const attIdx = headers.indexOf("Attendance Status");
    const punchIdx = headers.indexOf("Punch Status");
    expect(daily.aoa[daily.filterHeaderRow! + 1]![attIdx]).toBe("Present");
    expect(daily.aoa[daily.filterHeaderRow! + 1]![punchIdx]).toBe("Missing OUT");
  });

  it("builds Employee Summary with expected columns and exception fills", () => {
    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-08-28",
          status: "present",
          actual_in: "2026-08-28T04:00:00.000Z",
          actual_out: "2026-08-28T13:00:00.000Z",
          late_minutes: 12,
          worked_minutes: 540,
        }),
        day({
          id: "r2",
          work_date: "2026-08-29",
          status: "absent",
          worked_minutes: 0,
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      dateFrom: "2026-08-28",
      dateTo: "2026-08-29",
    });
    const emp = sheets.find((s) => s.name === "02 Employee Summary")!;
    const headers = emp.aoa[emp.filterHeaderRow!] as string[];
    expect(headers).toEqual([...EMPLOYEE_SUMMARY_HEADERS]);
    expect(emp.cellFills).toBeTruthy();
    const absentCol = headers.indexOf("Absent Days");
    const lateCol = headers.indexOf("Late Instances");
    const reviewCol = headers.indexOf("HR Review Status");
    const dataRow = emp.filterHeaderRow! + 1;
    expect(emp.cellFills![`${dataRow},${absentCol}`]).toBe(EXCEL_THEME.absent);
    expect(emp.cellFills![`${dataRow},${lateCol}`]).toBe(EXCEL_THEME.late);
    expect(emp.cellFills![`${dataRow},${reviewCol}`]).toBe(EXCEL_THEME.warning);
  });

  it("filters sheets by focus without changing calc", () => {
    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-08-28",
          status: "present",
          actual_in: "2026-08-28T04:00:00.000Z",
          actual_out: "2026-08-28T13:00:00.000Z",
          worked_minutes: 540,
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      dateFrom: "2026-08-28",
      dateTo: "2026-08-28",
      sheetNames: sheetsForExportFocus("employee"),
    });
    expect(sheets.map((s) => s.name)).toEqual(["02 Employee Summary"]);
  });

  it("uses E3 filenames never export.xlsx", () => {
    expect(e3AttendanceExportFilename("2026-08-01", "2026-08-31", "xlsx")).toBe(
      "E3_HR_Attendance_2026-08-01_to_2026-08-31.xlsx",
    );
    expect(e3AttendanceExportFilename("2026-08-01", "2026-08-31", "employee")).not.toMatch(/export\.xlsx/i);
  });
});

describe("excel theme", () => {
  it("maps matrix codes to fixed theme fills", () => {
    expect(matrixCodeFillRgb("P")).toBe(EXCEL_THEME.present);
    expect(matrixCodeFillRgb("A")).toBe(EXCEL_THEME.absent);
    expect(matrixCodeFillRgb("WO")).toBe(EXCEL_THEME.weeklyOff);
    expect(matrixCodeFillRgb("AL")).toBe(EXCEL_THEME.leave);
    expect(matrixCodeFillRgb("UL")).toBe(EXCEL_THEME.unpaidLeave);
    expect(matrixCodeFillRgb("PH")).toBe(EXCEL_THEME.publicHoliday);
    expect(matrixCodeFillRgb("MP")).toBe(EXCEL_THEME.missedPunch);
    expect(Object.keys(MATRIX_CODE_THEME).length).toBeGreaterThanOrEqual(10);
  });

  it("colors employee summary only on exception columns", () => {
    const headerRow = 5;
    const row = Array(EMPLOYEE_SUMMARY_HEADERS.length).fill("") as (string | number | null)[];
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Present Days")] = 20;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Absent Days")] = 2;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Late Instances")] = 1;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Missed Punches")] = 1;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Total OT Hours")] = 3.5;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Attendance %")] = ATTENDANCE_PCT_GREEN_THRESHOLD;
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("HR Review Status")] = "Pending";
    row[EMPLOYEE_SUMMARY_HEADERS.indexOf("Employee Name")] = "Ada";

    const fills = employeeSummaryCellFills([row], headerRow);
    expect(fills[`${headerRow + 1},${EMPLOYEE_SUMMARY_HEADERS.indexOf("Employee Name")}`]).toBeUndefined();
    expect(fills[`${headerRow + 1},${EMPLOYEE_SUMMARY_HEADERS.indexOf("Present Days")}`]).toBe(EXCEL_THEME.present);
    expect(fills[`${headerRow + 1},${EMPLOYEE_SUMMARY_HEADERS.indexOf("Absent Days")}`]).toBe(EXCEL_THEME.absent);
    expect(fills[`${headerRow + 1},${EMPLOYEE_SUMMARY_HEADERS.indexOf("Attendance %")}`]).toBe(EXCEL_THEME.present);
  });
});
