import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCsvRoster, parseHtmlRoster, parseRosterWorkbook, parseXlsxRoster, mapRosterColumns } from "./parse-workbook";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("parseHtmlRoster", () => {
  const html = readFileSync(join(fixtureDir, "employee-roster.snippet.html"), "utf8");
  const parsed = parseHtmlRoster(html);

  it("reads the Employee Roster waffle table and skips the empty template row", () => {
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.worksheetName).toMatch(/Employee Roster/i);
    expect(parsed.skippedEmpty).toBeGreaterThanOrEqual(1);
    expect(parsed.rows.map((r) => r.fullName)).toEqual([
      "Waqar Asghar",
      "Abdallah Osman",
      "Lilam Chaudry",
      "Jorene Tesoro Quixote",
      "Unknown Guest",
    ]);
  });

  it("treats # as a non-unique source row, not an employee id", () => {
    const ones = parsed.rows.filter((r) => r.sourceRowNo === 1);
    expect(ones).toHaveLength(2);
    expect(new Set(ones.map((r) => r.qid)).size).toBe(2);
  });

  it("keeps Lilam without a QID and maps Jorene date typo + E3 + location", () => {
    const lilam = parsed.rows.find((r) => r.fullName.startsWith("Lilam"));
    expect(lilam?.qid).toBeNull();
    expect(lilam?.e3Enrolled).toBe(false);
    expect(lilam?.employmentType).toBe("temporary");
    expect(lilam?.status).toBeNull();
    expect(lilam?.warnings.some((w) => /status/i.test(w))).toBe(true);

    const jorene = parsed.rows.find((r) => r.fullName.includes("Jorene"));
    expect(jorene?.locationCode).toBe("INF-CC");
    expect(jorene?.e3Enrolled).toBe(true);
    expect(jorene?.employmentType).toBe("permanent");
    expect(jorene?.monthlySalaryQar).toBe(3405);
    expect(jorene?.hireDate).toBe("0202-02-25");
    expect(jorene?.warnings.some((w) => /0202|1990/.test(w))).toBe(true);
    expect(jorene?.staffRole).toBe("cashier");
  });

  it("flags unmapped locations for review instead of creating a venue", () => {
    const mystery = parsed.rows.find((r) => r.fullName === "Unknown Guest");
    expect(mystery?.locationCode).toBeNull();
    expect(mystery?.warnings.some((w) => /Unmapped location/.test(w))).toBe(true);
  });
});

describe("parseXlsxRoster", () => {
  it("imports only the Employee Roster worksheet", async () => {
    const XLSX = await import("xlsx");
    const other = XLSX.utils.aoa_to_sheet([
      ["#", "Location", "Employee Name", "QID"],
      ["1", "Urban Arena - Doha Mall", "Should Ignore", "000"],
    ]);
    const roster = XLSX.utils.aoa_to_sheet([
      ["EMPLOYEE ROSTER"],
      ["#", "Location", "Employee Name", "E3", "Employee Type", "Salary", "QID", "Activity", "Position", "Contact Number", "Joining Date", "Status"],
      ["1", "Urban Arena - Doha Mall", "Waqar Asghar", "", "", "", "29658611062", "OverAll", "Venue Supervisor", "51234705", "19/03/2026", "Active"],
      ["", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, other, "Ignore Me");
    XLSX.utils.book_append_sheet(wb, roster, "Employee Roster");
    const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const parsed = await parseXlsxRoster(buffer);
    expect(parsed.worksheetName).toBe("Employee Roster");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.fullName).toBe("Waqar Asghar");
    expect(parsed.skippedEmpty).toBeGreaterThanOrEqual(1);
  });
});

describe("parseCsvRoster", () => {
  it("maps CSV columns the same way", () => {
    const csv = [
      "#,Location,Employee Name,E3,Employee Type,Salary,QID,Activity,Position,Contact Number,Joining Date,Status",
      "1,Urban Arena - Doha Mall,Waqar Asghar,,, ,29658611062,OverAll,Venue Supervisor,51234705,19/03/2026,Active",
    ].join("\n");
    const parsed = parseCsvRoster(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.locationCode).toBe("UA-DM");
    expect(parsed.rows[0]?.contactDisplay).toBe("+97451234705");
  });

  it("matches location code and ignores location_name when both are present", () => {
    const csv = [
      "employee_code,full_name,qid,location,location_name,position,type,e3,contact,joining date,status",
      "INF-CC-BM,Amna Al-Naimi,2891,INF-CC,Wrong Name That Should Be Ignored,Branch Manager,permanent,Yes,555,2020-01-01,active",
    ].join("\n");
    const parsed = parseCsvRoster(csv);
    expect(parsed.mapping.location).toBe("location");
    expect(parsed.rows[0]?.locationCode).toBe("INF-CC");
    expect(parsed.rows[0]?.locationLabel).toBe("INF-CC");
  });

  it("resolves combined location labels from a sample export", () => {
    const csv = [
      "employee_code,full_name,qid,location,location_name,position,type,e3,contact,joining date,status",
      "INF-CC-BM,Amna Al-Naimi,2891,INF-CC — Inflatapark - City Center,Inflatapark - City Center,Branch Manager,permanent,Yes,555,2020-01-01,active",
    ].join("\n");
    const parsed = parseCsvRoster(csv);
    expect(parsed.rows[0]?.locationCode).toBe("INF-CC");
  });
});

describe("parseRosterWorkbook", () => {
  it("accepts the HTML export by filename", async () => {
    const html = readFileSync(join(fixtureDir, "employee-roster.snippet.html"));
    const parsed = await parseRosterWorkbook("Employee Roster.html", html);
    expect(parsed.rows.length).toBe(5);
  });
});

describe("mapRosterColumns", () => {
  it("maps Name / QID / Location aliases without a manual step", () => {
    const mapping = mapRosterColumns(["Location", "Name", "QID", "Contact Number"]);
    expect(mapping.location).toBe("Location");
    expect(mapping.full_name).toBe("Name");
    expect(mapping.qid).toBe("QID");
    expect(mapping.contact).toBe("Contact Number");
  });

  it("fills gaps from a remembered map when headers are not aliases", () => {
    const mapping = mapRosterColumns(
      ["Outlet", "Staff Member", "Civil No"],
      { location: "Outlet", full_name: "Staff Member", qid: "Civil No" },
    );
    expect(mapping.location).toBe("Outlet");
    expect(mapping.full_name).toBe("Staff Member");
    expect(mapping.qid).toBe("Civil No");
  });
});

describe("parseCsvRoster aliases and remembered maps", () => {
  it("parses a Name column as employee name", () => {
    const csv = [
      "Location,Name,QID",
      "Urban Arena - Doha Mall,Waqar Asghar,29658611062",
    ].join("\n");
    const parsed = parseCsvRoster(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows[0]?.fullName).toBe("Waqar Asghar");
    expect(parsed.rows[0]?.qid).toBe("29658611062");
  });

  it("applies a saved column map so users do not remap next upload", () => {
    const csv = [
      "Outlet,Staff Member,Civil No",
      "Urban Arena - Doha Mall,Waqar Asghar,29658611062",
    ].join("\n");
    const parsed = parseCsvRoster(csv, {
      columnMap: { location: "Outlet", full_name: "Staff Member", qid: "Civil No" },
    });
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows[0]?.fullName).toBe("Waqar Asghar");
    expect(parsed.rows[0]?.qid).toBe("29658611062");
    expect(parsed.mapping.location?.toLowerCase()).toBe("outlet");
    expect(parsed.mapping.full_name?.toLowerCase()).toMatch(/staff member/);
  });
});
