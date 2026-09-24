import { describe, expect, it } from "vitest";

import {
  E3_HR_EXPORT_SHEET_NAMES,
  buildE3AttendanceHrWorkbookSheets,
  resolveHrAttendanceStatus,
  resolveHrPunchStatus,
} from "./export-workbook";
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
    });

    expect(sheets.map((s) => s.name)).toEqual([...E3_HR_EXPORT_SHEET_NAMES]);
    expect(sheets[0]!.aoa[0]![0]).toBe("E3 – Monthly Attendance Report");

    const daily = sheets.find((s) => s.name === "04 Daily Attendance")!;
    expect(daily.aoa[0]).toContain("Attendance Status");
    expect(daily.aoa[0]).toContain("Punch Status");

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
    const headers = daily.aoa[0] as string[];
    const attIdx = headers.indexOf("Attendance Status");
    const punchIdx = headers.indexOf("Punch Status");
    expect(daily.aoa[1]![attIdx]).toBe("Present");
    expect(daily.aoa[1]![punchIdx]).toBe("Missing OUT");
  });
});
