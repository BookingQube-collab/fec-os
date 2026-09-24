import { describe, expect, it } from "vitest";

import { matchRosterRow, proposeStaffValues } from "./match";
import { validateE3ImportRows, passportDatesValid } from "./e3-validate";
import { matchE3SheetName, workbookHasE3Sheets } from "./e3-masterfile";
import { parseHireDate } from "./values";
import type { ExistingStaffForMatch, ParsedRosterRow } from "./types";

function staff(partial: Partial<ExistingStaffForMatch> & Pick<ExistingStaffForMatch, "id" | "full_name">): ExistingStaffForMatch {
  return {
    employee_code: partial.employee_code ?? "CODE",
    qid: partial.qid ?? null,
    phone: partial.phone ?? null,
    location_id: partial.location_id ?? "loc-ua",
    location_code: partial.location_code ?? "UA-DM",
    status: partial.status ?? "active",
    deleted_at: partial.deleted_at ?? null,
    job_title: partial.job_title ?? null,
    department: partial.department ?? null,
    hire_date: partial.hire_date ?? null,
    e3_enrolled: partial.e3_enrolled ?? null,
    employment_type: partial.employment_type ?? null,
    staff_role: partial.staff_role ?? null,
    is_roaming: partial.is_roaming ?? false,
    monthly_salary_qar: partial.monthly_salary_qar ?? null,
    ...partial,
  };
}

function row(partial: Partial<ParsedRosterRow> & Pick<ParsedRosterRow, "fullName">): ParsedRosterRow {
  return {
    rowNumber: 1,
    sourceRowNo: 1,
    locationLabel: "Urban Arena - Doha Mall",
    locationCode: "UA-DM",
    employeeCode: null,
    e3Raw: "",
    e3Enrolled: null,
    employmentTypeRaw: "",
    employmentType: null,
    salaryRaw: "",
    monthlySalaryQar: null,
    qidRaw: "",
    qid: null,
    activity: null,
    position: "Cashier",
    staffRole: "cashier",
    contactRaw: "",
    contactDisplay: null,
    contactMatch: null,
    joiningDateRaw: "",
    hireDate: null,
    statusRaw: "Active",
    status: "active",
    sheetSource: null,
    sponsorship: null,
    nationality: null,
    gender: null,
    dateOfBirthRaw: "",
    dateOfBirth: null,
    qidExpiryRaw: "",
    qidExpiry: null,
    passportNumber: null,
    passportIssueDate: null,
    passportExpiryRaw: "",
    passportExpiry: null,
    ticketEligibility: null,
    ticketEligibilityMonths: null,
    ticketAmount: null,
    notes: null,
    warnings: [],
    errors: [],
    emptyTemplate: false,
    ...partial,
  };
}

describe("E3 / directory matching", () => {
  it("matches employee code before QID", () => {
    const existing = [
      staff({ id: "a", full_name: "Waqar Asghar", employee_code: "UA-DM-STF01", qid: "29658611062" }),
      staff({ id: "b", full_name: "Other", employee_code: "OTHER", qid: "111" }),
    ];
    const result = matchRosterRow(
      row({ fullName: "Waqar Renamed", employeeCode: "UA-DM-STF01", qid: "29658611062" }),
      existing,
      "loc-ua",
    );
    expect(result.matchRule).toBe("employee_code");
    expect(result.staffId).toBe("a");
  });

  it("does not overwrite existing phone with blank Excel cell", () => {
    const existing = staff({
      id: "a",
      full_name: "Keep Phone",
      employee_code: "KEEP-1",
      phone: "+97451234705",
    });
    const proposed = proposeStaffValues(
      row({ fullName: "Keep Phone", employeeCode: "KEEP-1", contactDisplay: null, contactMatch: null }),
      existing,
      "loc-ua",
      new Set(["KEEP-1"]),
    );
    expect(proposed.phone).toBe("+97451234705");
  });

  it("flags duplicate codes and passport expiry before issue", () => {
    const rows = [
      row({ rowNumber: 1, fullName: "A", employeeCode: "DUP", position: "Crew", status: "active", locationCode: "UA-DM" }),
      row({ rowNumber: 2, fullName: "B", employeeCode: "DUP", position: "Crew", status: "active", locationCode: "UA-DM" }),
      row({
        rowNumber: 3,
        fullName: "C",
        employeeCode: "OK",
        position: "Crew",
        status: "active",
        locationCode: "UA-DM",
        passportIssueDate: "2026-06-01",
        passportExpiry: "2025-01-01",
      }),
    ];
    const issues = validateE3ImportRows(rows);
    expect(issues.some((i) => i.code === "duplicate_code")).toBe(true);
    expect(issues.some((i) => i.code === "passport_expiry_before_issue")).toBe(true);
    expect(passportDatesValid("2024-01-01", "2025-01-01")).toBe(true);
    expect(passportDatesValid("2026-01-01", "2025-01-01")).toBe(false);
  });

  it("detects E3 sheet titles", () => {
    expect(matchE3SheetName("E3 - Active Employee")).toBe("E3 - Active Employee");
    expect(matchE3SheetName("Secondment Contract")).toBe("Secondment Contract");
    expect(workbookHasE3Sheets(["Summary", "Remote Staff"])).toBe(true);
    expect(workbookHasE3Sheets(["Employee Roster"])).toBe(false);
  });

  it("matches real 2026 Excel sheet tab names", () => {
    expect(matchE3SheetName("E3 -Active Employee")).toBe("E3 - Active Employee");
    expect(matchE3SheetName("Secondment_contract")).toBe("Secondment Contract");
    expect(matchE3SheetName("Remote staff")).toBe("Remote Staff");
    expect(matchE3SheetName("Resigned-Terminated")).toBe("Resigned-Terminated");
    expect(matchE3SheetName("Sheet2")).toBeNull();
    expect(workbookHasE3Sheets(["E3 -Active Employee", "Sheet1", "Sheet2"])).toBe(true);
  });

  it("parses Qatar D/M/Y and Excel US M/D/YY when month slot is impossible", () => {
    expect(parseHireDate("15/05/2028").iso).toBe("2028-05-15");
    expect(parseHireDate("29 January 2023").iso).toBe("2023-01-29");
    expect(parseHireDate("7/21/27").iso).toBe("2027-07-21");
    expect(parseHireDate("3/30/26").iso).toBe("2026-03-30");
  });
});
