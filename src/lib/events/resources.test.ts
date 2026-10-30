import { describe, expect, it } from "vitest";

import {
  allocationHoursInRange,
  allocationsByDay,
  buildStaffWorkload,
  capacityForStaff,
  daysInclusive,
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  detectCapacityConflicts,
  detectOverlappingAllocations,
  estimatedVsActual,
  rangesOverlap,
  resolveAllocationTotalHours,
  weekStartMonday,
} from "@/lib/events/resources";

describe("event pm phase 5 resources", () => {
  it("computes inclusive day spans and overlaps", () => {
    expect(daysInclusive("2026-11-01", "2026-11-01")).toBe(1);
    expect(daysInclusive("2026-11-01", "2026-11-07")).toBe(7);
    expect(rangesOverlap("2026-11-01", "2026-11-05", "2026-11-05", "2026-11-10")).toBe(true);
    expect(rangesOverlap("2026-11-01", "2026-11-04", "2026-11-05", "2026-11-10")).toBe(false);
  });

  it("anchors weeks on Monday", () => {
    expect(weekStartMonday("2026-11-04")).toBe("2026-11-02"); // Wed → Mon
    expect(weekStartMonday("2026-11-01")).toBe("2026-10-26"); // Sun → prior Mon
    expect(weekStartMonday("2026-11-02")).toBe("2026-11-02");
  });

  it("resolves allocation hours from explicit hours or pct", () => {
    expect(
      resolveAllocationTotalHours({
        id: "1",
        staff_id: "s",
        start_date: "2026-11-02",
        end_date: "2026-11-08",
        allocated_hours: 20,
      }),
    ).toBe(20);

    // 50% of 40h/wk over 7 days = 20h
    expect(
      resolveAllocationTotalHours(
        {
          id: "2",
          staff_id: "s",
          start_date: "2026-11-02",
          end_date: "2026-11-08",
          allocation_pct: 50,
        },
        40,
      ),
    ).toBe(20);
  });

  it("pro-rates allocation hours into a week window", () => {
    const alloc = {
      id: "a",
      staff_id: "s1",
      start_date: "2026-11-02",
      end_date: "2026-11-15", // 14 days, 40h total
      allocated_hours: 40,
    };
    // Week Mon 2–Sun 8 = 7 of 14 days → 20h
    expect(allocationHoursInRange(alloc, "2026-11-02", "2026-11-08")).toBe(20);
    // Partial second week Mon 9–Sun 15 = 7 days → 20h
    expect(allocationHoursInRange(alloc, "2026-11-09", "2026-11-15")).toBe(20);
    expect(allocationHoursInRange(alloc, "2026-10-01", "2026-10-07")).toBe(0);
  });

  it("flags over-capacity weeks", () => {
    const conflicts = detectCapacityConflicts(
      [
        {
          id: "a1",
          staff_id: "s1",
          start_date: "2026-11-02",
          end_date: "2026-11-08",
          allocated_hours: 50,
        },
        {
          id: "a2",
          staff_id: "s1",
          start_date: "2026-11-09",
          end_date: "2026-11-15",
          allocated_hours: 10,
        },
      ],
      [{ staff_id: "s1", weekly_hours: 40 }],
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.weekStart).toBe("2026-11-02");
    expect(conflicts[0]?.allocatedHours).toBe(50);
    expect(conflicts[0]?.overBy).toBe(10);
  });

  it("detects overlapping allocations for the same staff", () => {
    const overlaps = detectOverlappingAllocations([
      { id: "a", staff_id: "s1", start_date: "2026-11-01", end_date: "2026-11-10", allocated_hours: 10 },
      { id: "b", staff_id: "s1", start_date: "2026-11-08", end_date: "2026-11-20", allocated_hours: 10 },
      { id: "c", staff_id: "s2", start_date: "2026-11-01", end_date: "2026-11-10", allocated_hours: 10 },
    ]);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.aId).toBe("a");
    expect(overlaps[0]?.bId).toBe("b");
    expect(overlaps[0]?.start).toBe("2026-11-08");
  });

  it("builds workload and utilization rows", () => {
    const rows = buildStaffWorkload(
      ["s1", "s2"],
      [
        {
          id: "a1",
          staff_id: "s1",
          start_date: "2026-11-02",
          end_date: "2026-11-08",
          allocated_hours: 30,
        },
      ],
      [{ staff_id: "s1", weekly_hours: 40 }],
      [
        { id: "t1", assignee_staff_id: "s1", estimated_hours: 12, actual_hours: 5 },
        { id: "t2", owner_staff_id: "s2", estimated_hours: 8, actual_hours: null },
      ],
      [
        { id: "ts1", staff_id: "s1", work_date: "2026-11-03", hours: 4, status: "approved" },
        { id: "ts2", staff_id: "s1", work_date: "2026-11-04", hours: 2, status: "draft" },
      ],
      { from: "2026-11-02", to: "2026-11-08" },
    );
    expect(rows[0]?.allocatedHours).toBe(30);
    expect(rows[0]?.utilizationPct).toBe(75);
    expect(rows[0]?.overAllocated).toBe(false);
    expect(rows[0]?.taskEstimatedHours).toBe(12);
    expect(rows[0]?.approvedTimesheetHours).toBe(4);
    expect(rows[1]?.allocatedHours).toBe(0);
    expect(rows[1]?.taskEstimatedHours).toBe(8);
  });

  it("aggregates estimated vs actual", () => {
    const rows = estimatedVsActual(
      [
        { id: "1", assignee_staff_id: "s1", estimated_hours: 10, actual_hours: 12 },
        { id: "2", owner_staff_id: "s1", estimated_hours: 5, actual_hours: 0 },
      ],
      [{ id: "ts", staff_id: "s1", work_date: "2026-11-01", hours: 3, status: "approved" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.estimatedHours).toBe(15);
    expect(rows[0]?.actualHours).toBe(12);
    expect(rows[0]?.timesheetApprovedHours).toBe(3);
    expect(rows[0]?.varianceHours).toBe(-3);
  });

  it("maps allocations onto month days", () => {
    const map = allocationsByDay(
      [
        {
          id: "a",
          staff_id: "s1",
          start_date: "2026-11-03",
          end_date: "2026-11-05",
          allocated_hours: 6,
        },
      ],
      "2026-11",
    );
    expect(map.get("2026-11-03")?.map((a) => a.id)).toEqual(["a"]);
    expect(map.get("2026-11-04")?.map((a) => a.id)).toEqual(["a"]);
    expect(map.has("2026-11-02")).toBe(false);
  });

  it("falls back to default weekly capacity", () => {
    expect(capacityForStaff("missing", [])).toBe(DEFAULT_WEEKLY_CAPACITY_HOURS);
    expect(capacityForStaff("s1", [{ staff_id: "s1", weekly_hours: 32 }])).toBe(32);
  });
});
