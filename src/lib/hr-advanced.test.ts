import { describe, expect, it } from "vitest";

import {
  aggregateHeadcountBySite,
  checklistProgress,
  dateRangesOverlap,
  detectLeaveConflicts,
  enumerateLeaveDates,
  formatOtPolicySummary,
  mapHrLeaveTypeToAttendance,
  sumLeaveDaysInPeriod,
  sumUsedLeaveDays,
  summarizeLeaveBalances,
} from "./hr-advanced";

describe("leave balances", () => {
  it("computes remaining from allotment minus approved usage", () => {
    const used = sumUsedLeaveDays(
      [
        { leaveType: "annual", days: 3, status: "approved", dateFrom: "2026-03-01" },
        { leaveType: "annual", days: 2, status: "pending", dateFrom: "2026-04-01" },
        { leaveType: "sick", days: 1, status: "approved", dateFrom: "2025-12-01" },
      ],
      2026,
    );
    expect(used).toEqual({ annual: 3 });
    const summary = summarizeLeaveBalances(
      [
        { leaveType: "annual", allottedDays: 21 },
        { leaveType: "sick", allottedDays: 14 },
      ],
      used,
    );
    expect(summary.find((s) => s.leaveType === "annual")).toMatchObject({
      usedDays: 3,
      remainingDays: 18,
    });
  });
});

describe("leave conflicts", () => {
  it("flags roster and attendance overlaps", () => {
    const conflicts = detectLeaveConflicts({
      dateFrom: "2026-08-28",
      dateTo: "2026-08-30",
      rosterDates: ["2026-08-29"],
      attendancePresentDates: ["2026-08-28"],
      overlappingLeave: [{ dateFrom: "2026-08-30", dateTo: "2026-09-01", status: "pending" }],
    });
    expect(conflicts.map((c) => c.kind).sort()).toEqual(["attendance", "leave_overlap", "roster"]);
  });

  it("detects range overlap inclusively", () => {
    expect(dateRangesOverlap("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-10")).toBe(true);
    expect(dateRangesOverlap("2026-01-01", "2026-01-05", "2026-01-06", "2026-01-10")).toBe(false);
  });
});

describe("OT policy summary", () => {
  it("formats a readable rule line", () => {
    expect(
      formatOtPolicySummary({
        overtimeAfterMinutes: 480,
        maxDailyOtMinutes: 120,
        maxWeeklyOtMinutes: null,
        requiresPreapproval: true,
      }),
    ).toContain("OT after 8h worked");
  });
});

describe("leave → attendance mapping", () => {
  it("maps HR types to attendance leave statuses", () => {
    expect(mapHrLeaveTypeToAttendance("annual")).toBe("annual_leave");
    expect(mapHrLeaveTypeToAttendance("sick")).toBe("sick_leave");
    expect(mapHrLeaveTypeToAttendance("emergency")).toBe("unpaid_leave");
    expect(enumerateLeaveDates("2026-08-28", "2026-08-30")).toEqual([
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    expect(checklistProgress([{ status: "done" }, { status: "pending" }, { status: "skipped" }])).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });
});

describe("HR reports helpers", () => {
  it("aggregates headcount by site", () => {
    const rows = aggregateHeadcountBySite([
      { locationId: "a", locationCode: "INF-CC", locationName: "Aspire" },
      { locationId: "a", locationCode: "INF-CC", locationName: "Aspire" },
      { locationId: "b", locationCode: "UA-DM", locationName: "Doha Mall" },
    ]);
    expect(rows[0]).toMatchObject({ locationCode: "INF-CC", headcount: 2 });
  });

  it("sums approved leave days overlapping a period", () => {
    expect(
      sumLeaveDaysInPeriod(
        [
          { days: 3, status: "approved", dateFrom: "2026-08-26", dateTo: "2026-08-28" },
          { days: 2, status: "rejected", dateFrom: "2026-08-27", dateTo: "2026-08-28" },
        ],
        "2026-07-28",
        "2026-08-27",
      ),
    ).toBe(3);
  });
});
