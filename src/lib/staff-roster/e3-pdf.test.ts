import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseE3PdfPageTexts, parseE3MasterfilePdf } from "./e3-pdf";
import { matchRosterRow } from "./match";
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

describe("E3 PDF page zip", () => {
  it("zips active column pages into employee rows", () => {
    const pages = [
      {
        pageNumber: 1,
        lines: [
          "Department E.Code E.Name",
          "Management 1 Adil Bashir Ahmed",
          "HR 88 Reycie Mia Cenizal Memije",
        ],
      },
      {
        pageNumber: 3,
        lines: ["Sponsorship Position", "Sponsorship Managing Director / Chief Executive Officer", "Sponsorship HR Generalist"],
      },
      {
        pageNumber: 5,
        lines: [
          "Location of Work QID QID Ex.Date DOJ",
          "Head Office 27658603057 15/05/2028",
          "Head Office 28960803115 07/10/2026 20 July 2026",
        ],
      },
    ];
    const { rows, sheetsParsed } = parseE3PdfPageTexts(pages);
    expect(sheetsParsed[0]).toBe("E3 - Active Employee");
    expect(rows).toHaveLength(2);
    expect(rows[0].employeeCode).toBe("1");
    expect(rows[0].fullName).toBe("Adil Bashir Ahmed");
    expect(rows[0].qid).toBe("27658603057");
    expect(rows[0].position).toMatch(/Managing Director/i);
    expect(rows[0].status).toBe("active");
  });

  it("matches PDF rows by employee code then QID", () => {
    const row: ParsedRosterRow = {
      rowNumber: 1,
      sourceRowNo: null,
      locationLabel: "Head Office",
      locationCode: null,
      fullName: "Adil Bashir Ahmed",
      employeeCode: "1",
      e3Raw: "",
      e3Enrolled: null,
      employmentTypeRaw: "",
      employmentType: null,
      salaryRaw: "",
      monthlySalaryQar: null,
      qidRaw: "27658603057",
      qid: "27658603057",
      activity: "Management",
      position: "MD",
      staffRole: null,
      contactRaw: "",
      contactDisplay: null,
      contactMatch: null,
      joiningDateRaw: "",
      hireDate: null,
      statusRaw: "active",
      status: "active",
      sheetSource: "E3 - Active Employee",
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
    };
    const existing = [staff({ id: "a", full_name: "Adil", employee_code: "1", qid: "27658603057" })];
    expect(matchRosterRow(row, existing, null).matchRule).toBe("employee_code");
  });
});

describe("E3 PDF real file (optional)", () => {
  it("extracts rows from demo-data PDF when present", async () => {
    let buf: Buffer;
    try {
      buf = readFileSync("demo-data/E3_Employee_Masterfile_2026.pdf");
    } catch {
      return;
    }
    const parsed = await parseE3MasterfilePdf(buf);
    expect(parsed.nonemptyPages).toBeGreaterThan(10);
    expect(parsed.rows.length).toBeGreaterThan(50);
    expect(parsed.sheetsParsed).toContain("E3 - Active Employee");
    expect(parsed.sheetsParsed).toContain("Secondment Contract");
    const withCode = parsed.rows.filter((r) => r.employeeCode);
    expect(withCode.length).toBeGreaterThan(40);
  }, 30_000);
});
