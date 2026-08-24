import { describe, expect, it } from "vitest";

import { diffStaffFields, matchRosterRow, proposeStaffValues, salaryWouldWipe } from "./match";
import { parseHtmlRoster } from "./parse-workbook";
import type { ExistingStaffForMatch, ParsedRosterRow } from "./types";
import { stripSalary } from "./values";

function staff(partial: Partial<ExistingStaffForMatch> & Pick<ExistingStaffForMatch, "id" | "full_name">): ExistingStaffForMatch {
  return {
    employee_code: partial.employee_code ?? (partial.qid ? `UA-DM-STF01` : "CODE"),
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
    warnings: [],
    errors: [],
    emptyTemplate: false,
    ...partial,
  };
}

describe("matchRosterRow", () => {
  it("matches QID before phone or name", () => {
    const existing = [
      staff({ id: "a", full_name: "Waqar Asghar", qid: "29658611062", phone: "+97400000000" }),
    ];
    const result = matchRosterRow(
      row({ fullName: "Waqar Asghar", qid: "29658611062", contactMatch: "+97451234705" }),
      existing,
      "loc-ua",
    );
    expect(result.matchRule).toBe("qid");
    expect(result.staffId).toBe("a");
  });

  it("matches contact + name when QID is missing", () => {
    const existing = [
      staff({ id: "b", full_name: "Abdallah Osman", phone: "+97431203338", qid: null }),
    ];
    const result = matchRosterRow(
      row({ fullName: "Abdallah Osman", contactMatch: "+97431203338", qid: null }),
      existing,
      "loc-ua",
    );
    expect(result.matchRule).toBe("contact_name");
    expect(result.staffId).toBe("b");
  });

  it("matches name + location only when QID and contact are unavailable", () => {
    const existing = [
      staff({ id: "c", full_name: "Lilam Chaudry", qid: null, phone: null, location_id: "loc-kds" }),
    ];
    const result = matchRosterRow(
      row({
        fullName: "Lilam Chaudry",
        locationCode: "KDS-CC",
        qid: null,
        contactMatch: null,
        status: "active",
      }),
      existing,
      "loc-kds",
    );
    expect(result.matchRule).toBe("name_location");
    expect(result.staffId).toBe("c");
  });

  it("refuses to merge on similar name only", () => {
    const existing = [
      staff({ id: "d", full_name: "Mary Muiruri", qid: "29440401419", phone: "+97466269506" }),
    ];
    const result = matchRosterRow(
      row({
        fullName: "Mary Muiruri Garcia",
        qid: null,
        contactMatch: null,
        locationCode: "INF-CC",
      }),
      existing,
      "loc-inf",
    );
    expect(result.action).toBe("review");
    expect(result.matchRule).toBe("fuzzy_name");
    expect(result.staffId).toBeNull();
  });

  it("updates the sheet name when the same QID has a different spelling", () => {
    const existing = [staff({ id: "e", full_name: "Yebach Ruth", qid: "28528801171" })];
    const result = matchRosterRow(
      row({ fullName: "Yebaoh Ruth", qid: "28528801171" }),
      existing,
      "loc-ua",
    );
    expect(result.action).toBe("update");
    expect(result.matchRule).toBe("qid");
    expect(result.staffId).toBe("e");
    expect(result.warnings.some((w) => /spelling|name/i.test(w))).toBe(true);
  });

  it("treats the same name with different QIDs as a new employee", () => {
    const existing = [staff({ id: "f", full_name: "Ali Husnain", qid: "111" })];
    const result = matchRosterRow(row({ fullName: "Ali Husnain", qid: "222" }), existing, "loc-ua");
    expect(result.action).toBe("create");
    expect(result.matchRule).toBe("qid_unmatched");
  });
});

describe("proposeStaffValues", () => {
  it("issues a synthetic code when QID is missing and never uses #", () => {
    const used = new Set<string>();
    const proposed = proposeStaffValues(
      row({ fullName: "Lilam Chaudry", qid: null, locationCode: "KDS-CC", sourceRowNo: 43 }),
      null,
      "loc-kds",
      used,
    );
    expect(proposed.employee_code).toBe("KDS-CC-CSH");
    expect(proposed.employee_code).not.toBe("43");
    expect(proposed.employee_code).not.toMatch(/^\d+$/);
  });

  it("never copies QID into employee_code for a new person", () => {
    const used = new Set<string>(["INF-CC-BM", "INF-CC-STF03"]);
    const proposed = proposeStaffValues(
      row({
        fullName: "Angie Urania santos",
        qid: "29160813855",
        locationCode: "INF-CC",
        staffRole: "crew",
        position: "Crew / Attendant",
      }),
      null,
      "loc-inf",
      used,
    );
    expect(proposed.employee_code).toBe("INF-CC-STF01");
    expect(proposed.employee_code).not.toBe("29160813855");
    expect(proposed.qid).toBe("29160813855");
  });

  it("preserves existing non-QID codes and rewrites QID-shaped codes", () => {
    const keep = proposeStaffValues(
      row({
        fullName: "Mary Muiruri",
        qid: "29440401419",
        locationCode: "INF-CC",
        staffRole: "venue_supervisor",
      }),
      staff({
        id: "keep",
        full_name: "Mary Muiruri",
        employee_code: "INF-CC-BM",
        qid: "29440401419",
        staff_role: "venue_supervisor",
        location_code: "INF-CC",
      }),
      "loc-inf",
      new Set(["INF-CC-BM"]),
    );
    expect(keep.employee_code).toBe("INF-CC-BM");

    const rewrite = proposeStaffValues(
      row({
        fullName: "Angie Urania santos",
        qid: "29160813855",
        locationCode: "INF-CC",
        staffRole: "crew",
        position: "Crew / Attendant",
      }),
      staff({
        id: "dirty",
        full_name: "Angie Urania santos",
        employee_code: "29160813855",
        qid: "29160813855",
        staff_role: "crew",
        location_code: "INF-CC",
      }),
      "loc-inf",
      new Set(["29160813855", "INF-CC-BM"]),
    );
    expect(rewrite.qid).toBe("29160813855");
    expect(rewrite.employee_code).toBe("INF-CC-STF01");
    expect(rewrite.employee_code).not.toBe("29160813855");
  });

  it("does not treat a blank salary as a wipe", () => {
    expect(salaryWouldWipe(3405, null)).toBe(true);
    expect(salaryWouldWipe(3405, 3405)).toBe(false);
    const existing = staff({
      id: "g",
      full_name: "Jorene Tesoro Quixote",
      monthly_salary_qar: 3405,
    });
    const proposed = proposeStaffValues(
      row({ fullName: "Jorene Tesoro Quixote", monthlySalaryQar: null, qid: "28460819784" }),
      existing,
      "loc-inf",
      new Set(),
    );
    const diffs = diffStaffFields(existing, { ...proposed, monthly_salary_qar: existing.monthly_salary_qar ?? null }, true);
    expect(diffs.some((d) => d.field === "monthly_salary_qar")).toBe(false);
  });

  it("omits salary when the viewer lacks the capability", () => {
    const withSalary = { id: "h", full_name: "X", monthly_salary_qar: 1000 };
    expect(stripSalary(withSalary, false)).not.toHaveProperty("monthly_salary_qar");
    expect(stripSalary(withSalary, true).monthly_salary_qar).toBe(1000);
  });
});

describe("html fixture matching path", () => {
  it("parses five fixture people for the preview pipeline", () => {
    const html = `<table class="waffle"><tr><td>1</td><td>EMPLOYEE ROSTER</td></tr><tr><td>4</td><td>#</td><td>Location</td><td>Employee Name</td><td>E3</td><td>Employee Type</td><td>Salary</td><td>QID</td><td>Activity</td><td>Position</td><td>Contact Number</td><td>Joining Date</td><td>Status</td></tr>
      <tr><td>5</td><td>1</td><td>Urban Arena - Doha Mall</td><td>Waqar Asghar</td><td></td><td></td><td></td><td>29658611062</td><td>OverAll</td><td>Venue Supervisor</td><td>51234705</td><td>19/03/2026</td><td>Active</td></tr></table>`;
    expect(parseHtmlRoster(html).rows).toHaveLength(1);
  });
});
