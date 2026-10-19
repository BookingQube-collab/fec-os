import { describe, expect, it } from "vitest";

import {
  preferPunchedDailySummaryRows,
  suppressAbsentWhenPunchedSameDay,
  suppressAbsentWithoutOnDutyRoster,
} from "./punch-over-absent";

describe("preferPunchedDailySummaryRows", () => {
  it("keeps Present with punches over a roster Absent filler for the same person-day", () => {
    const merged = preferPunchedDailySummaryRows([
      {
        location_id: "ua",
        staff_id: "agnes",
        work_date: "2026-09-28",
        status: "absent",
        punch_count: 0,
        actual_in: null,
        actual_out: null,
      },
      {
        location_id: "ua",
        staff_id: "agnes",
        work_date: "2026-09-28",
        status: "present",
        punch_count: 2,
        actual_in: "2026-09-28T08:49:31.000Z",
        actual_out: "2026-09-28T18:58:33.000Z",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("present");
    expect(merged[0]?.punch_count).toBe(2);
  });

  it("does not collapse different staff or days", () => {
    const merged = preferPunchedDailySummaryRows([
      {
        location_id: "ua",
        staff_id: "a",
        work_date: "2026-09-28",
        status: "absent",
        punch_count: 0,
      },
      {
        location_id: "ua",
        staff_id: "b",
        work_date: "2026-09-28",
        status: "present",
        punch_count: 2,
        actual_in: "x",
        actual_out: "y",
      },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("suppressAbsentWhenPunchedSameDay", () => {
  it("drops KDS Absent when INF Present exists the same day (Ronald)", () => {
    const filtered = suppressAbsentWhenPunchedSameDay([
      {
        id: "kds-absent",
        staff_id: "ronald",
        work_date: "2026-10-13",
        location_id: "kds",
        status: "absent",
        punch_count: 0,
        actual_in: null,
        actual_out: null,
      },
      {
        id: "inf-present",
        staff_id: "ronald",
        work_date: "2026-10-13",
        location_id: "inf",
        status: "overtime",
        punch_count: 2,
        actual_in: "2026-10-13T09:33:00.000Z",
        actual_out: "2026-10-13T18:53:00.000Z",
      },
    ]);
    expect(filtered.map((r) => r.id)).toEqual(["inf-present"]);
  });

  it("keeps true Absent when no punches exist that day", () => {
    const rows = [
      {
        id: "true-absent",
        staff_id: "angie",
        work_date: "2026-10-05",
        location_id: "inf",
        status: "absent",
        punch_count: 0,
        actual_in: null,
        actual_out: null,
      },
    ];
    expect(suppressAbsentWhenPunchedSameDay(rows)).toEqual(rows);
  });
});

describe("suppressAbsentWithoutOnDutyRoster", () => {
  it("drops Ruben-style ABSENT INF-CC when staff has no roster that day", () => {
    const filtered = suppressAbsentWithoutOnDutyRoster({
      rows: [
        {
          id: "ruben-sep28",
          staff_id: "ruben",
          work_date: "2026-09-28",
          location_id: "inf",
          status: "absent",
          punch_count: 0,
          actual_in: null,
          actual_out: null,
        },
        {
          id: "agnes-present",
          staff_id: "agnes",
          work_date: "2026-09-28",
          location_id: "inf",
          status: "present",
          punch_count: 2,
          actual_in: "x",
          actual_out: "y",
        },
        {
          id: "agnes-true-absent",
          staff_id: "agnes",
          work_date: "2026-10-05",
          location_id: "inf",
          status: "absent",
          punch_count: 0,
          actual_in: null,
          actual_out: null,
        },
      ],
      roster: [
        { staff_id: "agnes", work_date: "2026-09-28", is_week_off: false },
        { staff_id: "agnes", work_date: "2026-10-05", is_week_off: false },
      ],
    });
    expect(filtered.map((r) => r.id)).toEqual(["agnes-present", "agnes-true-absent"]);
  });

  it("converts week-off-only punch-less Absent to weekly_off", () => {
    const filtered = suppressAbsentWithoutOnDutyRoster({
      rows: [
        {
          id: "off-day",
          staff_id: "lester",
          work_date: "2026-10-03",
          location_id: "inf",
          status: "absent",
          punch_count: 0,
        },
      ],
      roster: [{ staff_id: "lester", work_date: "2026-10-03", is_week_off: true }],
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.status).toBe("weekly_off");
  });
});
