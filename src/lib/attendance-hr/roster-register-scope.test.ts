import { describe, expect, it } from "vitest";

import {
  assertRosterDeletePeriod,
  buildRosterMatrix,
  chunkIds,
  collectPagedRows,
  filterRosterRegisterRows,
  isWeekendYmd,
  rosterAmendRecalcLocationIds,
  rosterDayStatusFromRow,
  rosterMatrixCellKey,
  rosterMonthSpans,
  rosterPatchFromDayStatus,
  rosterRegisterHasExtraFilters,
  rosterRowMatchesSearch,
} from "./roster-register-scope";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE } from "./constants";

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

  it("pages past PostgREST max_rows so later FEC-month days are not dropped", async () => {
    expect(ATTENDANCE_DAILY_LIST_PAGE_SIZE).toBe(1000);
    const calls: Array<[number, number]> = [];
    const rows = await collectPagedRows(async (from, to) => {
      calls.push([from, to]);
      if (from === 0) {
        // First page filled to the cap (early work_dates only).
        return Array.from({ length: ATTENDANCE_DAILY_LIST_PAGE_SIZE }, (_, i) => `early-${i}`);
      }
      // Second page holds later dates a bare .limit(5000) never returned.
      return ["2026-09-15", "2026-09-27"];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    expect(calls).toEqual([
      [0, ATTENDANCE_DAILY_LIST_PAGE_SIZE - 1],
      [ATTENDANCE_DAILY_LIST_PAGE_SIZE, ATTENDANCE_DAILY_LIST_PAGE_SIZE * 2 - 1],
    ]);
    expect(rows).toHaveLength(ATTENDANCE_DAILY_LIST_PAGE_SIZE + 2);
    expect(rows.slice(-2)).toEqual(["2026-09-15", "2026-09-27"]);
  });

  it("builds a staff × day matrix and stacks same-day multi-location rows", () => {
    const a = {
      ...row,
      id: "1",
      staffName: "Ada",
      employeeCode: "A1",
      qid: null as string | null,
      workDate: "2026-07-28",
      locationCode: "INF-CC",
    };
    const b = {
      ...a,
      id: "2",
      staffId: "staff-2",
      staffName: "Bob",
      employeeCode: "B1",
      workDate: "2026-07-29",
    };
    const multi = { ...a, id: "3", locationCode: "INF-EE" };
    const matrix = buildRosterMatrix([b, a, multi], "2026-07-28", "2026-07-29");
    expect(matrix.dates).toEqual(["2026-07-28", "2026-07-29"]);
    expect(matrix.staff.map((s) => s.staffId)).toEqual(["staff-1", "staff-2"]);
    expect(matrix.byStaffDate.get(rosterMatrixCellKey("staff-1", "2026-07-28"))).toHaveLength(2);
    expect(matrix.monthSpans).toEqual([{ monthKey: "2026-07", startIdx: 0, count: 2 }]);
    expect(isWeekendYmd("2026-08-01")).toBe(true);
    expect(isWeekendYmd("2026-08-03")).toBe(false);
    expect(rosterMonthSpans(["2026-07-31", "2026-08-01"])).toEqual([
      { monthKey: "2026-07", startIdx: 0, count: 1 },
      { monthKey: "2026-08", startIdx: 1, count: 1 },
    ]);
  });

  it("maps amend day status to roster + leave patches", () => {
    expect(rosterDayStatusFromRow({ isWeekOff: false, leaveType: null })).toBe("on_duty");
    expect(rosterDayStatusFromRow({ isWeekOff: true, leaveType: null })).toBe("weekly_off");
    expect(rosterDayStatusFromRow({ isWeekOff: true, leaveType: "annual_leave" })).toBe("annual_leave");
    expect(rosterDayStatusFromRow({ isWeekOff: false, leaveType: "sick_leave" })).toBe("sick_leave");

    expect(rosterPatchFromDayStatus("on_duty")).toEqual({
      isWeekOff: false,
      leaveType: null,
      needsShiftTimes: true,
    });
    expect(rosterPatchFromDayStatus("weekly_off")).toEqual({
      isWeekOff: true,
      leaveType: null,
      needsShiftTimes: false,
    });
    expect(rosterPatchFromDayStatus("annual_leave")).toEqual({
      isWeekOff: false,
      leaveType: "annual_leave",
      needsShiftTimes: false,
    });
    expect(rosterPatchFromDayStatus("sick_leave")).toEqual({
      isWeekOff: false,
      leaveType: "sick_leave",
      needsShiftTimes: false,
    });
  });

  it("recalcs both sites when amend moves location", () => {
    expect(rosterAmendRecalcLocationIds("loc-inf", "loc-inf")).toEqual(["loc-inf"]);
    expect(rosterAmendRecalcLocationIds("loc-inf", "loc-ua")).toEqual(["loc-inf", "loc-ua"]);
  });
});
