import { describe, expect, it } from "vitest";

import {
  assertRosterDeletePeriod,
  chunkIds,
  filterRosterRegisterRows,
  rosterRegisterHasExtraFilters,
  rosterRowMatchesSearch,
} from "./roster-register-scope";

const row = {
  staffId: "staff-1",
  staffName: "WASANTHI HAMAMALI RANKOTH PEDIGE",
  employeeCode: "INF-CC-STFI3",
  qid: "12345678901",
  locationCode: "INF-CC",
  workDate: "2026-07-28",
  source: "upload",
};

describe("roster register bulk-delete scope", () => {
  it("treats only the selected period as unfiltered", () => {
    expect(rosterRegisterHasExtraFilters({})).toBe(false);
    expect(rosterRegisterHasExtraFilters({ locationId: "", staffId: "", search: "  ", source: null })).toBe(false);
    expect(rosterRegisterHasExtraFilters({ sourceUploadOnly: true, source: "upload" })).toBe(false);
  });

  it("treats location, staff, source, and search as extra filters", () => {
    expect(rosterRegisterHasExtraFilters({ locationId: "loc-1" })).toBe(true);
    expect(rosterRegisterHasExtraFilters({ staffId: "staff-1" })).toBe(true);
    expect(rosterRegisterHasExtraFilters({ search: "wasanthi" })).toBe(true);
    expect(rosterRegisterHasExtraFilters({ source: "upload" })).toBe(true);
  });

  it("matches the visible-table search fields", () => {
    expect(rosterRowMatchesSearch(row, "wasanthi")).toBe(true);
    expect(rosterRowMatchesSearch(row, "INF-CC-STFI3")).toBe(true);
    expect(rosterRowMatchesSearch(row, "2026-07-28")).toBe(true);
    expect(rosterRowMatchesSearch(row, "upload")).toBe(true);
    expect(rosterRowMatchesSearch(row, "other-site")).toBe(false);
    expect(rosterRowMatchesSearch(row, "")).toBe(true);
  });

  it("narrows client rows by staff and search without leaving the period set", () => {
    const other = { ...row, staffId: "staff-2", staffName: "OTHER PERSON", employeeCode: "INF-CC-STF99" };
    expect(filterRosterRegisterRows([row, other], { staffId: "staff-1", search: "" })).toEqual([row]);
    expect(filterRosterRegisterRows([row, other], { staffId: "", search: "OTHER" })).toEqual([other]);
    expect(filterRosterRegisterRows([row, other], { staffId: "staff-1", search: "OTHER" })).toEqual([]);
  });

  it("rejects a missing or inverted delete period", () => {
    expect(() => assertRosterDeletePeriod("2026-07-28", "2026-08-27")).not.toThrow();
    expect(() => assertRosterDeletePeriod("2026-08-27", "2026-07-28")).toThrow(/period start/i);
    expect(() => assertRosterDeletePeriod("August 2026", "2026-08-27")).toThrow(/required/i);
  });

  it("chunks delete ids so PostgREST IN lists stay bounded", () => {
    expect(chunkIds(["a", "b", "c", "d"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(chunkIds([], 200)).toEqual([]);
  });
});
