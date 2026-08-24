import { describe, expect, it } from "vitest";

import { parseDatedRosterRows, parseStaffImportRows } from "./staff-import";
import { isQidShapedCode } from "./staff-employee-code";

describe("parseStaffImportRows", () => {
  it("does not write QID into employee_code", () => {
    const rows = parseStaffImportRows([
      {
        location_code: "INF-CC",
        employee_code: "29160813855",
        full_name: "Angie Urania santos",
        job_title: "Crew / Attendant",
        staff_role: "crew",
        qid: "29160813855",
      },
      {
        location_code: "INF-CC",
        employee_code: "INF-CC-BM",
        full_name: "Existing Manager",
        job_title: "Venue Supervisor",
        staff_role: "venue_supervisor",
        qid: "29440401419",
      },
    ]);
    expect(rows[0]?.qid).toBe("29160813855");
    expect(rows[0]?.employee_code).toBe("INF-CC-STF01");
    expect(rows[0]?.employee_code).not.toBe(rows[0]?.qid);
    expect(isQidShapedCode(rows[0]!.employee_code)).toBe(false);
    expect(rows[1]?.employee_code).toBe("INF-CC-BM");
    expect(rows[1]?.qid).toBe("29440401419");
  });

  it("promotes a QID-only code column into qid and generates a venue code", () => {
    const rows = parseStaffImportRows([
      {
        location_code: "KDS-CC",
        employee_code: "29973602805",
        full_name: "Mohammed Abdelazeem M",
        job_title: "Cashier",
      },
    ]);
    expect(rows[0]?.qid).toBe("29973602805");
    expect(rows[0]?.employee_code).toBe("KDS-CC-CSH");
  });
});

describe("parseDatedRosterRows", () => {
  it("rejects QID-shaped employee_code on roster rows", () => {
    expect(() =>
      parseDatedRosterRows([
        { location_code: "INF-CC", employee_code: "29160813855", date: "2026-08-01" },
      ]),
    ).toThrow(/internal staff code/i);
  });
});
