import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv-parse";

import { buildDirectorySampleCsv, directorySampleFilename } from "./directory-sample";

describe("directory sample", () => {
  it("prefills saved employees and omits salary by default", () => {
    const csv = buildDirectorySampleCsv([
      {
        employee_code: "INF-CC-BM",
        full_name: "Amna Al-Naimi",
        qid: "2891",
        locationCode: "INF-CC",
        locationName: "Inflatapark - City Center",
        job_title: "Branch Manager",
        employment_type: "permanent",
        e3_enrolled: true,
        phone: "555",
        hire_date: "2020-01-01",
        status: "active",
        monthly_salary_qar: 9000,
      },
    ]);
    const rows = parseCsv(csv);
    expect(rows[0]).toMatchObject({
      employee_code: "INF-CC-BM",
      full_name: "Amna Al-Naimi",
      location: "INF-CC — Inflatapark - City Center",
      location_name: "Inflatapark - City Center",
      e3: "Yes",
      contact: "555",
    });
    expect(rows[0]).not.toHaveProperty("salary");
    expect(Object.keys(rows[0])).toEqual([
      "employee_code",
      "full_name",
      "qid",
      "location",
      "location_name",
      "position",
      "type",
      "e3",
      "contact",
      "joining date",
      "status",
    ]);
  });

  it("names the file by location scope", () => {
    expect(directorySampleFilename(null)).toBe("employee-roster-sample-all.csv");
    expect(directorySampleFilename("INF-CC")).toBe("employee-roster-sample-inf-cc.csv");
  });
});
