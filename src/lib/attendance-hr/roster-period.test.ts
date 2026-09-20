import { describe, expect, it } from "vitest";

import {
  attendanceRosterPeriod,
  defaultPayrollPeriod,
  filterPunchesForImportPeriod,
  formatPayrollRange,
  mapRosterPeriodByDayIndex,
  monthBounds,
  nextPayrollMonth,
  payrollMonthMatchingBounds,
  payrollMonthOf,
  punchWorkDateInPeriod,
} from "./roster-period";

describe("attendance import period", () => {
  it("resolves a Qatar week from a mid-week date", () => {
    expect(attendanceRosterPeriod({ mode: "week", weekStart: "2026-08-19" })).toEqual({
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
    });
  });

  it("resolves the 28–27 payroll month, not a calendar month", () => {
    expect(attendanceRosterPeriod({ mode: "month", month: "2026-08" })).toEqual({
      dateFrom: "2026-07-28",
      dateTo: "2026-08-27",
    });
  });

  it("maps a date onto the FEC month that contains it", () => {
    expect(payrollMonthOf("2026-08-27")).toBe("2026-08");
    expect(payrollMonthOf("2026-07-28")).toBe("2026-08");
    expect(payrollMonthOf("2026-08-28")).toBe("2026-09");
    expect(payrollMonthOf("2026-12-28")).toBe("2027-01");
  });

  it("formats the payroll range as day + short month", () => {
    expect(formatPayrollRange("2026-07-28", "2026-08-27")).toBe("28 Jul – 27 Aug");
    expect(payrollMonthMatchingBounds("2026-07-28", "2026-08-27")).toBe("2026-08");
    expect(payrollMonthMatchingBounds("2026-08-01", "2026-08-31")).toBeNull();
    expect(defaultPayrollPeriod("2026-08-27")).toEqual({
      month: "2026-08",
      dateFrom: "2026-07-28",
      dateTo: "2026-08-27",
    });
  });

  it("rolls the monthly cycle across year-end", () => {
    expect(attendanceRosterPeriod({ mode: "month", month: "2027-01" })).toEqual({
      dateFrom: "2026-12-28",
      dateTo: "2027-01-27",
    });
  });

  it("advances the FEC payroll month label", () => {
    expect(nextPayrollMonth("2026-08")).toBe("2026-09");
    expect(nextPayrollMonth("2026-12")).toBe("2027-01");
  });

  it("maps roster dates by day-of-period index into the next FEC month", () => {
    const source = monthBounds("2026-08");
    const target = monthBounds(nextPayrollMonth("2026-08"));
    const map = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);
    expect(map.get("2026-07-28")).toBe("2026-08-28");
    expect(map.get("2026-08-01")).toBe("2026-09-01");
    expect(map.get("2026-08-27")).toBe("2026-09-27");
    expect(map.size).toBe(31);
  });

  it("drops trailing source days when the target period is shorter", () => {
    // Feb FEC month (non-leap): Jan 28–Feb 27 = 31 days; Mar: Feb 28–Mar 27 = 28 days
    const source = monthBounds("2026-02");
    const target = monthBounds("2026-03");
    const map = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);
    expect(source.dateFrom).toBe("2026-01-28");
    expect(target.dateFrom).toBe("2026-02-28");
    expect(map.size).toBe(28);
    expect(map.get("2026-01-28")).toBe("2026-02-28");
    expect(map.has("2026-02-27")).toBe(false);
  });

  it("keeps punches whose Qatar work date falls in the period", () => {
    expect(punchWorkDateInPeriod("2026-08-03T05:00:00.000Z", "2026-08-01", "2026-08-07")).toBe(true);
    expect(punchWorkDateInPeriod("2026-07-31T10:00:00.000Z", "2026-08-01", "2026-08-07")).toBe(false);
  });

  it("filters punches outside the selected week", () => {
    const punches = [
      { punchAt: "2026-08-17T05:00:00.000Z" },
      { punchAt: "2026-08-24T05:00:00.000Z" },
    ];
    const result = filterPunchesForImportPeriod(punches, { dateFrom: "2026-08-16", dateTo: "2026-08-22" });
    expect(result.kept).toEqual([punches[0]]);
    expect(result.skipped).toBe(1);
  });
});
