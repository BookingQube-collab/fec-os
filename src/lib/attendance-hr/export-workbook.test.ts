import { describe, expect, it } from "vitest";

import {
  E3_HR_EXPORT_SHEET_NAMES,
  EMPLOYEE_SUMMARY_HEADERS,
  buildE3AttendanceHrWorkbookSheets,
  correctedTimesFromExportCorrection,
  e3AttendanceExportFilename,
  employeeSummaryCellFills,
  formatMissedPunchApprovalDecision,
  formatMissedPunchCorrectionBy,
  formatMissedPunchExportStatus,
  formatMissedPunchSupervisorVerification,
  formatOtApproverChain,
  latestPunchCorrectionByStaffDate,
  otExportFinalApprovalPending,
  resolveHrAttendanceStatus,
  resolveHrPunchStatus,
  sheetsForExportFocus,
  type ExportCorrection,
  type ExportOtClaim,
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

  it("treats punched unscheduled (no roster / portal check-in) days as Present", () => {
    const punched = day({
      work_date: "2026-10-20",
      status: "unscheduled",
      actual_in: "2026-10-20T05:00:00.000Z",
      actual_out: "2026-10-20T14:00:00.000Z",
      worked_minutes: 540,
      punch_count: 2,
    });
    expect(resolveHrAttendanceStatus(punched)).toBe("Present");
    expect(resolveHrAttendanceStatus(day({ work_date: "2026-10-20", status: "unscheduled" }))).toBe(
      "Unscheduled",
    );
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

  it("08 Overtime lists only submitted OT claims with approvers and pending flag", () => {
    const pendingClaim: ExportOtClaim = {
      staffId: "staff-a",
      workDate: "2026-08-28",
      rateType: "weekday",
      calculatedMinutes: 90,
      approvedMinutes: null,
      status: "manager_verified",
      purpose: "Busy weekend cover",
      rateMultiplier: 1.25,
      amountQar: 6.94,
      basicQarSnapshot: 3000,
      hoursPerDaySnapshot: 9,
      daysPerMonthSnapshot: 30,
      requestedByName: "Ashfaq",
      siteApproverName: "Mary",
      employeeCode: "INF-CC-STF01",
      employeeName: "Ada Lovelace",
      locationCode: "INF-CC",
    };
    const approvedClaim: ExportOtClaim = {
      staffId: "staff-a",
      workDate: "2026-08-29",
      rateType: "weekly_off",
      calculatedMinutes: 120,
      approvedMinutes: 120,
      status: "gm_approved",
      notes: "Rest day OT",
      rateMultiplier: 1.5,
      amountQar: 33.33,
      basicQarSnapshot: 3000,
      hoursPerDaySnapshot: 9,
      daysPerMonthSnapshot: 30,
      requestedByName: "Ashfaq",
      siteApproverName: "Mary",
      hooApproverName: "Rajan",
      hrApproverName: "Sara",
      gmApproverName: "GM Name",
      employeeCode: "INF-CC-STF01",
      employeeName: "Ada Lovelace",
      locationCode: "INF-CC",
    };
    const draftIgnored: ExportOtClaim = {
      staffId: "staff-a",
      workDate: "2026-08-27",
      rateType: "weekday",
      calculatedMinutes: 60,
      approvedMinutes: null,
      status: "draft",
    };

    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-08-28",
          status: "present",
          overtime_minutes: 200,
          worked_minutes: 630,
          actual_in: "2026-08-28T04:00:00.000Z",
          actual_out: "2026-08-28T14:30:00.000Z",
        }),
        day({
          id: "r2",
          work_date: "2026-08-29",
          status: "weekly_off",
          overtime_minutes: 180,
          worked_minutes: 600,
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      otClaims: [pendingClaim, approvedClaim, draftIgnored],
      dateFrom: "2026-08-28",
      dateTo: "2026-08-29",
    });

    const ot = sheets.find((s) => s.name === "08 Overtime")!;
    const headers = ot.aoa[ot.filterHeaderRow!] as string[];
    expect(headers).toContain("Requested By");
    expect(headers).toContain("Site Approver");
    expect(headers).toContain("Final Approval Pending");
    expect(headers).toContain("Waiting On");
    expect(headers).toContain("OT Formula");
    expect(headers).toContain("Estimated Amount (QAR)");
    expect(headers).toContain("Approved Amount (QAR)");
    expect(headers).toContain("Rate Multiplier");
    expect(headers).toContain("OT Hourly Rate (QAR)");

    const dataRows = ot.aoa.slice(ot.filterHeaderRow! + 1);
    // Punch-only OT and drafts are excluded — only two submitted claims.
    expect(dataRows).toHaveLength(2);

    const pendingIdx = headers.indexOf("Final Approval Pending");
    const waitingIdx = headers.indexOf("Waiting On");
    const approvedHrsIdx = headers.indexOf("Approved OT Hours");
    const requestedIdx = headers.indexOf("Requested By");
    const siteIdx = headers.indexOf("Site Approver");
    const approversIdx = headers.indexOf("Approvers");
    const formulaIdx = headers.indexOf("OT Formula");
    const estimatedIdx = headers.indexOf("Estimated Amount (QAR)");
    const approvedAmtIdx = headers.indexOf("Approved Amount (QAR)");
    const multIdx = headers.indexOf("Rate Multiplier");

    const pendingRow = dataRows.find((r) => r[waitingIdx] === "HOO")!;
    expect(pendingRow[pendingIdx]).toBe("Yes");
    expect(pendingRow[approvedHrsIdx]).toBe(0);
    expect(pendingRow[requestedIdx]).toBe("Ashfaq");
    expect(pendingRow[siteIdx]).toBe("Mary");
    expect(pendingRow[multIdx]).toBe(1.25);
    expect(String(pendingRow[formulaIdx])).toContain("1.5h");
    expect(String(pendingRow[formulaIdx])).toContain("3000");
    expect(String(pendingRow[formulaIdx])).toContain("1.25");
    // 1.5h × (3000 ÷ (30 × 9)) × 1.25 = 20.833… → 20.83
    expect(pendingRow[estimatedIdx]).toBe(20.83);
    expect(pendingRow[approvedAmtIdx]).toBe("");

    const doneRow = dataRows.find((r) => r[pendingIdx] === "No")!;
    expect(doneRow[approvedHrsIdx]).toBe(2);
    expect(doneRow[approversIdx]).toBe("Sr. Site: Mary; HOO: Rajan; HR: Sara; GM: GM Name");
    expect(doneRow[multIdx]).toBe(1.5);
    expect(String(doneRow[formulaIdx])).toContain("2h");
    expect(String(doneRow[formulaIdx])).toContain("1.5");
    // 2h × (3000 ÷ (30 × 9)) × 1.5 = 33.333… → 33.33
    expect(doneRow[estimatedIdx]).toBe("");
    expect(doneRow[approvedAmtIdx]).toBe(33.33);
    expect(otExportFinalApprovalPending("manager_verified")).toBe(true);
    expect(formatOtApproverChain(approvedClaim)).toContain("GM: GM Name");
  });

  it("07 Missed Punches fills explanation, seats, decision, and corrected times from latest request", () => {
    const older: ExportCorrection = {
      id: "c-old",
      requestedAt: "2026-10-26T08:00:00.000Z",
      staffId: "staff-a",
      employeeCode: "INF-CC-STF01",
      employeeName: "Ada Lovelace",
      workDate: "2026-10-27",
      kind: "edit_out",
      originalValue: { actual_in: "2026-10-27T09:00:00+03:00", actual_out: null },
      newValue: {
        missed_punch_request: true,
        punch_type: "out",
        punch_out_at: "2026-10-27T22:00:00+03:00",
      },
      reason: "Old reason",
      status: "rejected",
      currentStepRole: null,
      steps: [],
    };
    const latest: ExportCorrection = {
      id: "c-new",
      requestedAt: "2026-10-27T10:00:00.000Z",
      staffId: "staff-a",
      employeeCode: "INF-CC-STF01",
      employeeName: "Ada Lovelace",
      workDate: "2026-10-27",
      kind: "edit_out",
      originalValue: { actual_in: "2026-10-27T09:00:00+03:00", actual_out: null },
      newValue: {
        missed_punch_request: true,
        punch_type: "out",
        punch_in_at: null,
        punch_out_at: "2026-10-27T22:05:00+03:00",
        requested_punch_out: "22:05",
      },
      reason: "Forgot to punch out — device offline",
      requestedByName: "Ashfaq Noori",
      status: "pending",
      currentStepRole: "ops",
      reviewNote: "Ashfaq Noori submitted this correction. Punch out 22:05.",
      steps: [
        {
          stepRole: "manager",
          status: "approved",
          actedByName: "Mary Wangare Muiruri",
          actedAt: "2026-10-27T11:00:00.000Z",
        },
        { stepRole: "ops", status: "pending", actedByName: null, actedAt: null },
      ],
      locationCode: "INF-CC",
    };

    expect(latestPunchCorrectionByStaffDate([older, latest]).get("staff-a|2026-10-27")?.id).toBe("c-new");
    expect(formatMissedPunchSupervisorVerification(latest)).toContain("Supervisor submitted · Ashfaq Noori");
    expect(formatMissedPunchSupervisorVerification(latest)).toContain(
      "Sr. Site Supervisor approved · Mary Wangare Muiruri",
    );
    expect(formatMissedPunchApprovalDecision(latest)).toBe("Pending — waiting on Head of Operations");
    expect(formatMissedPunchExportStatus(latest)).toBe("Pending");
    expect(correctedTimesFromExportCorrection(latest).correctedOut).toMatch(/10:05\s*PM/i);
    expect(formatMissedPunchCorrectionBy(latest)).toBe("Mary Wangare Muiruri");

    const approved: ExportCorrection = {
      ...latest,
      id: "c-approved",
      status: "approved",
      currentStepRole: null,
      steps: [
        {
          stepRole: "manager",
          status: "approved",
          actedByName: "Mary Wangare Muiruri",
          actedAt: "2026-10-27T11:00:00.000Z",
        },
        {
          stepRole: "ops",
          status: "approved",
          actedByName: "Rajan Pathak",
          actedAt: "2026-10-27T12:00:00.000Z",
        },
      ],
    };
    expect(formatMissedPunchApprovalDecision(approved)).toBe(
      "Approved · Head of Operations · Rajan Pathak",
    );
    expect(formatMissedPunchExportStatus(approved)).toBe("Approved");
    // No invented HR approve language.
    expect(formatMissedPunchApprovalDecision(approved)).not.toMatch(/\bHR\b/i);

    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-10-27",
          status: "missed_punch",
          missed_punch: true,
          actual_in: "2026-10-27T06:00:00.000Z",
          actual_out: null,
          staff_name: "Ada Lovelace",
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      corrections: [older, latest],
      dateFrom: "2026-10-27",
      dateTo: "2026-10-27",
    });
    const sheet = sheets.find((s) => s.name === "07 Missed Punches")!;
    const headers = sheet.aoa[sheet.filterHeaderRow!] as string[];
    expect(headers).toContain("Employee Explanation");
    expect(headers).toContain("Approval Status");
    expect(headers).not.toContain("HR Decision");
    const data = sheet.aoa[sheet.filterHeaderRow! + 1]!;
    expect(data[headers.indexOf("Employee Explanation")]).toBe("Forgot to punch out — device offline");
    expect(String(data[headers.indexOf("Supervisor Verification")])).toContain("Mary Wangare Muiruri");
    expect(data[headers.indexOf("Approval Status")]).toBe("Pending — waiting on Head of Operations");
    expect(String(data[headers.indexOf("Corrected OUT")])).toMatch(/10:05\s*PM/i);
    expect(data[headers.indexOf("Correction By")]).toBe("Mary Wangare Muiruri");
    expect(data[headers.indexOf("Status")]).toBe("Pending");
  });

  it("07 Missed Punches keeps request rows after punches are healed", () => {
    const correction: ExportCorrection = {
      requestedAt: "2026-10-27T10:00:00.000Z",
      staffId: "staff-a",
      workDate: "2026-10-27",
      kind: "edit_out",
      originalValue: {},
      newValue: {
        missed_punch_request: true,
        punch_out_at: "2026-10-27T22:00:00+03:00",
        punch_type: "out",
      },
      reason: "Applied after HoO",
      status: "approved",
      currentStepRole: null,
      requestedByName: "Ada",
      steps: [
        { stepRole: "manager", status: "approved", actedByName: "Mary", actedAt: "2026-10-27T11:00:00.000Z" },
        { stepRole: "ops", status: "approved", actedByName: "Rajan", actedAt: "2026-10-27T12:00:00.000Z" },
      ],
    };
    const sheets = buildE3AttendanceHrWorkbookSheets({
      daily: [
        day({
          work_date: "2026-10-27",
          status: "present",
          actual_in: "2026-10-27T06:00:00.000Z",
          actual_out: "2026-10-27T19:00:00.000Z",
          worked_minutes: 780,
        }),
      ],
      punches: [],
      unmatched: [],
      imports: [],
      corrections: [correction],
      dateFrom: "2026-10-27",
      dateTo: "2026-10-27",
    });
    const sheet = sheets.find((s) => s.name === "07 Missed Punches")!;
    const headers = sheet.aoa[sheet.filterHeaderRow!] as string[];
    const dataRows = sheet.aoa.slice(sheet.filterHeaderRow! + 1);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0]![headers.indexOf("Missing Punch Type")]).toBe("Corrected");
    expect(dataRows[0]![headers.indexOf("Status")]).toBe("Approved");
    expect(dataRows[0]![headers.indexOf("Approval Status")]).toContain("Head of Operations");
  });

  it("keeps 04–06 / 08–09 tallies stable when corrections are attached", () => {
    const daily = [
      day({
        work_date: "2026-10-27",
        status: "missed_punch",
        missed_punch: true,
        actual_in: "2026-10-27T06:00:00.000Z",
        late_minutes: 15,
        overtime_minutes: 60,
        worked_minutes: 480,
      }),
      day({
        id: "r2",
        work_date: "2026-10-26",
        status: "absent",
        worked_minutes: 0,
      }),
    ];
    const otClaim: ExportOtClaim = {
      staffId: "staff-a",
      workDate: "2026-10-27",
      rateType: "weekday",
      calculatedMinutes: 60,
      approvedMinutes: 60,
      status: "gm_approved",
      rateMultiplier: 1.25,
      amountQar: 6.94,
      basicQarSnapshot: 3000,
      hoursPerDaySnapshot: 9,
      daysPerMonthSnapshot: 30,
      siteApproverName: "Mary",
      hooApproverName: "Rajan",
      hrApproverName: "Sara",
      gmApproverName: "GM",
    };
    const without = buildE3AttendanceHrWorkbookSheets({
      daily,
      punches: [],
      unmatched: [],
      imports: [],
      otClaims: [otClaim],
      dateFrom: "2026-10-26",
      dateTo: "2026-10-27",
    });
    const withCorr = buildE3AttendanceHrWorkbookSheets({
      daily,
      punches: [],
      unmatched: [],
      imports: [],
      otClaims: [otClaim],
      corrections: [
        {
          requestedAt: "2026-10-27T10:00:00.000Z",
          staffId: "staff-a",
          workDate: "2026-10-27",
          kind: "edit_out",
          originalValue: {},
          newValue: { missed_punch_request: true, punch_out_at: "2026-10-27T22:00:00+03:00" },
          reason: "x",
          status: "pending",
          currentStepRole: "manager",
          steps: [],
        },
      ],
      dateFrom: "2026-10-26",
      dateTo: "2026-10-27",
    });

    for (const name of ["04 Daily Attendance", "05 Late & Early Exit", "06 Absence & Leave", "08 Overtime", "09 Payroll Input"] as const) {
      const a = without.find((s) => s.name === name)!;
      const b = withCorr.find((s) => s.name === name)!;
      expect(b.aoa.slice(b.filterHeaderRow!)).toEqual(a.aoa.slice(a.filterHeaderRow!));
    }
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
