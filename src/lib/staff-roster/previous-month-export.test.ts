import { describe, expect, it } from "vitest";

import { PEOPLE_ROSTER_SAMPLE_HEADERS, buildPeopleRosterSheetMatrix } from "./period-sample";
import { previousMonthRosterSheetLines, previousMonthRosterShiftCell } from "./previous-month-export";

describe("previous month roster sheet", () => {
  it("keeps stored shift text and does not invent a duty time", () => {
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: false,
        leaveType: null,
        shiftStart: "09:00:00",
        shiftEnd: "17:00",
      }),
    ).toBe("09:00-17:00");
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: true,
        leaveType: null,
        shiftStart: null,
        shiftEnd: null,
      }),
    ).toBe("DAY OFF");
    expect(
      previousMonthRosterShiftCell({
        isWeekOff: false,
        leaveType: null,
        shiftStart: null,
        shiftEnd: null,
      }),
    ).toBe("");
  });

  it("writes stored rows with the sample columns, and headers only when empty", () => {
    const period = { dateFrom: "2026-08-28", dateTo: "2026-09-27" };
    const filled = buildPeopleRosterSheetMatrix(
      previousMonthRosterSheetLines([
        {
          workDate: "2026-09-01",
          staffName: "Agnes Kirorio",
          employeeCode: "UA-DM-1",
          locationCode: "UA-DM",
          locationName: "Urban Arena",
          shiftStart: "12:00",
          shiftEnd: "21:00",
          isWeekOff: false,
          leaveType: null,
        },
      ]),
      period,
      { periodMode: "month" },
    );
    expect([...filled.headers]).toEqual([...PEOPLE_ROSTER_SAMPLE_HEADERS]);
    expect(filled.title).toBe("DATE WISE MONTHLY ROSTER");
    expect(filled.periodLine).toContain("28-Aug-2026 to 27-Sep-2026");
    expect(filled.rows).toEqual([["1-Sep-2026", "Agnes Kirorio", "Urban Arena - Doha Mall", "12:00-21:00"]]);

    const empty = buildPeopleRosterSheetMatrix([], period, { periodMode: "month" });
    expect(empty.rowCount).toBe(0);
    expect([...empty.headers]).toEqual(["DATE", "EMPLOYEE", "LOCATION", "SHIFT"]);
    expect(empty.rows).toEqual([]);
  });
});
