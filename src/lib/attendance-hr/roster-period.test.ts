import { describe, expect, it } from "vitest";

import {
  attendanceRosterPeriod,
  filterPunchesForImportPeriod,
  punchWorkDateInPeriod,
} from "./roster-period";

describe("attendance import period", () => {
  it("resolves a Qatar week from a mid-week date", () => {
    expect(attendanceRosterPeriod({ mode: "week", weekStart: "2026-08-19" })).toEqual({
      dateFrom: "2026-08-16",
      dateTo: "2026-08-22",
    });
  });

  it("resolves a calendar month", () => {
    expect(attendanceRosterPeriod({ mode: "month", month: "2026-08" })).toEqual({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
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
