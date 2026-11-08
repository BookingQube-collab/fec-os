import { describe, expect, it } from "vitest";

import { findStaffingShortageDays } from "@/lib/events/staffing-shortage";

describe("staffing shortage", () => {
  it("flags days where schedule is below covering crew", () => {
    const alerts = findStaffingShortageDays({
      assignments: [
        {
          staff_id: "a",
          date_from: "2026-11-10",
          date_to: "2026-11-11",
          status: "active",
        },
        {
          staff_id: "b",
          date_from: "2026-11-10",
          date_to: "2026-11-11",
          status: "active",
        },
      ],
      slots: [{ work_date: "2026-11-10", staff_id: "a" }],
      minScheduled: 1,
    });
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.workDate).toBe("2026-11-10");
    expect(alerts[0]?.deficit).toBe(1);
    expect(alerts[1]?.workDate).toBe("2026-11-11");
    expect(alerts[1]?.scheduledCount).toBe(0);
  });

  it("ignores closed assignments", () => {
    const alerts = findStaffingShortageDays({
      assignments: [
        {
          staff_id: "a",
          date_from: "2026-11-10",
          date_to: "2026-11-10",
          status: "closed",
        },
      ],
      slots: [],
    });
    expect(alerts).toEqual([]);
  });
});
