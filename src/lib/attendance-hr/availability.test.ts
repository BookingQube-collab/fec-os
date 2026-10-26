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
  it("counts present, absent, late, and visits with listing status rules", () => {
    expect(
      tallyAvailability(
        [
          {
            status: "present",
            actual_in: "2024-05-01T05:00:00.000Z",
            actual_out: "2024-05-01T14:00:00.000Z",
            worked_minutes: 480,
            expected_minutes: 480,
            work_date: "2024-05-01",
          },
          {
            status: "late",
            late_minutes: 12,
            actual_in: "2024-05-01T07:00:00.000Z",
            actual_out: "2024-05-01T16:00:00.000Z",
            worked_minutes: 480,
            expected_minutes: 480,
            work_date: "2024-05-01",
          },
          { status: "absent", actual_in: null, actual_out: null, work_date: "2024-05-01" },
          {
            status: "present",
            late_minutes: 5,
            actual_in: "2024-05-01T05:10:00.000Z",
            actual_out: "2024-05-01T14:10:00.000Z",
            worked_minutes: 480,
            expected_minutes: 480,
            work_date: "2024-05-01",
          },
        ],
        3,
      ),
    ).toEqual({ present: 3, absent: 1, late: 2, visits: 3 });
  });
});

describe("buildAvailabilityTrends", () => {
  it("separates history, current, and upcoming roster", () => {
    const trends = buildAvailabilityTrends({
      historyRows: [
        {
          status: "present",
          actual_in: "2024-05-01T05:00:00.000Z",
          actual_out: "2024-05-01T14:00:00.000Z",
          worked_minutes: 480,
          expected_minutes: 480,
          work_date: "2024-05-01",
        },
        { status: "absent", actual_in: null, actual_out: null, work_date: "2024-05-01" },
      ],
      currentRows: [
        {
          status: "late",
          late_minutes: 8,
          actual_in: "2024-05-02T07:00:00.000Z",
          actual_out: "2024-05-02T16:00:00.000Z",
          worked_minutes: 480,
          expected_minutes: 480,
          work_date: "2024-05-02",
        },
      ],
      historyVisits: 4,
      currentVisits: 2,
      upcomingRows: [{ is_week_off: false }, { is_week_off: false }, { is_week_off: true }],
    });
    expect(trends.history).toEqual({ present: 1, absent: 1, late: 0, visits: 4 });
    expect(trends.current).toEqual({ present: 1, absent: 0, late: 1, visits: 2 });
    expect(trends.upcoming).toEqual({ rostered: 2, weekOff: 1 });
  });
});
