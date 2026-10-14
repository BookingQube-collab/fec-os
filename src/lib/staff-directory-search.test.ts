import { describe, expect, it } from "vitest";

import { staffDirectorySearchNeedle, staffDirectorySearchOrFilter } from "./staff-directory-search";

const PASSPORT_ID = "11111111-1111-4111-8111-111111111111";

describe("staff directory search filter", () => {
  it("scans name, code, qid, phone, and job title without loading the rest of the roster", () => {
    expect(staffDirectorySearchOrFilter("gor")).toBe(
      [
        'full_name.ilike."%gor%"',
        'employee_code.ilike."%gor%"',
        'qid.ilike."%gor%"',
        'phone.ilike."%gor%"',
        'job_title.ilike."%gor%"',
      ].join(","),
    );
  });

  it("keeps apostrophes and drops characters that break the or filter", () => {
    expect(staffDirectorySearchNeedle(` O'Brien, (a)" `)).toBe("O'Brien a");
    expect(staffDirectorySearchOrFilter("O'Brien")).toContain('full_name.ilike."%O\'Brien%"');
  });

  it("returns null for an empty search so the directory query stays unfiltered", () => {
    expect(staffDirectorySearchOrFilter("   ")).toBeNull();
    expect(staffDirectorySearchOrFilter("(),")).toBeNull();
  });

  it("adds passport matches as staff ids instead of joining profile rows into the scan", () => {
    expect(staffDirectorySearchOrFilter("p123", [PASSPORT_ID, "not-a-uuid", PASSPORT_ID])).toBe(
      [
        'full_name.ilike."%p123%"',
        'employee_code.ilike."%p123%"',
        'qid.ilike."%p123%"',
        'phone.ilike."%p123%"',
        'job_title.ilike."%p123%"',
        `id.in.(${PASSPORT_ID})`,
      ].join(","),
    );
  });
});
