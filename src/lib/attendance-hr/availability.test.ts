import { describe, expect, it } from "vitest";

import { buildAvailabilityTrends, previousPeriod, tallyAvailability, upcomingPeriod } from "./availability";

describe("previousPeriod / upcomingPeriod", () => {
  it("mirrors an August month into July", () => {
    expect(previousPeriod("2026-08-01", "2026-08-31")).toEqual({ dateFrom: "2026-07-01", dateTo: "2026-07-31" });
  });

  it("looks seven days ahead of the current window", () => {
    expect(upcomingPeriod("2026-08-31", 7)).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-09-07" });
  });
});

describe("tallyAvailability", () => {
  it("counts present, absent, late, and visits", () => {
    expect(
      tallyAvailability(
        [
          { status: "present" },
          { status: "late", late_minutes: 12 },
          { status: "absent" },
          { status: "present", late_minutes: 5 },
        ],
        3,
      ),
    ).toEqual({ present: 3, absent: 1, late: 2, visits: 3 });
  });
});

describe("buildAvailabilityTrends", () => {
  it("separates history, current, and upcoming roster", () => {
    const trends = buildAvailabilityTrends({
      historyRows: [{ status: "present" }, { status: "absent" }],
      currentRows: [{ status: "late", late_minutes: 8 }],
      historyVisits: 4,
      currentVisits: 2,
      upcomingRows: [{ is_week_off: false }, { is_week_off: false }, { is_week_off: true }],
    });
    expect(trends.history).toEqual({ present: 1, absent: 1, late: 0, visits: 4 });
    expect(trends.current).toEqual({ present: 1, absent: 0, late: 1, visits: 2 });
    expect(trends.upcoming).toEqual({ rostered: 2, weekOff: 1 });
  });
});
