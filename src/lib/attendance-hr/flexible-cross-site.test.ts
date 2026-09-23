import { describe, expect, it } from "vitest";

import { calculateDailyAttendance } from "./calculate";
import { DEFAULT_SHIFT } from "./constants";
import { applyAttendanceShiftPolicy, resolveReportingAndBuffer } from "./shift-policy";
import {
  flexibleDayAnchorLocationId,
  flexibleDayHasQualifyingPunches,
  flexibleDayNonAnchorPunchLocations,
  flexibleDayRecalcAction,
} from "./flexible-cross-site";

describe("flexible cross-site attendance", () => {
  const inf = "loc-inf";
  const ua = "loc-ua";

  it("anchors the day at the location of the earliest punch", () => {
    expect(
      flexibleDayAnchorLocationId([
        { locationId: ua, punchAt: "2026-09-20T14:00:00.000Z" },
        { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z" },
      ]),
    ).toBe(inf);
  });

  it("write_merged at first-punch site; suppress at roster-only / out-only site", () => {
    const punches = [
      { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z" },
      { locationId: ua, punchAt: "2026-09-20T14:00:00.000Z" },
    ];
    expect(flexibleDayRecalcAction({ locationId: inf, punchesAcrossSites: punches })).toBe(
      "write_merged",
    );
    expect(flexibleDayRecalcAction({ locationId: ua, punchesAcrossSites: punches })).toBe(
      "suppress",
    );
  });

  it("suppresses false ABSENT when rostered at UA but punched only at INF", () => {
    const punches = [
      { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z" },
      { locationId: inf, punchAt: "2026-09-20T14:00:00.000Z" },
    ];
    expect(flexibleDayHasQualifyingPunches(punches)).toBe(true);
    expect(flexibleDayRecalcAction({ locationId: ua, punchesAcrossSites: punches })).toBe(
      "suppress",
    );
    expect(flexibleDayRecalcAction({ locationId: inf, punchesAcrossSites: punches })).toBe(
      "write_merged",
    );
    expect(flexibleDayNonAnchorPunchLocations(punches, inf)).toEqual([]);
  });

  it("returns no_punches when there are zero usable punches anywhere", () => {
    expect(flexibleDayRecalcAction({ locationId: ua, punchesAcrossSites: [] })).toBe("no_punches");
    expect(
      flexibleDayRecalcAction({
        locationId: ua,
        punchesAcrossSites: [
          { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z", excludedFromCalc: true },
        ],
      }),
    ).toBe("no_punches");
  });

  it("merges cross-site in/out into one present day with hours", () => {
    const timing = resolveReportingAndBuffer({
      siteReporting: 0,
      siteBuffer: 0,
      staff: { flexibleAttendance: true, reportingTimeMinutes: 30, bufferMinutes: 5 },
    });
    expect(timing).toEqual({ reportingTimeMinutes: 30, bufferMinutes: 5 });

    const shift = applyAttendanceShiftPolicy(
      { ...DEFAULT_SHIFT, startTime: "08:00", endTime: "17:00", minWorkMinutes: 540 },
      {
        employmentType: "permanent",
        locationCode: "INF-CC",
        breakMinutesOverride: 60,
        reportingTimeMinutesOverride: timing.reportingTimeMinutes,
        bufferMinutesOverride: timing.bufferMinutes,
      },
    );

    // In at INF-CC 08:00 Qatar (05:00Z), out at UA-DM 17:00 Qatar (14:00Z) → 9h present
    const calc = calculateDailyAttendance(
      [
        { punchAt: "2026-09-20T05:00:00.000Z" },
        { punchAt: "2026-09-20T14:00:00.000Z" },
      ],
      {
        workDate: "2026-09-20",
        scheduled: true,
        shift: { ...shift, startTime: "08:00", endTime: "17:00" },
      },
    );

    expect(calc.status).toBe("present");
    expect(calc.workedMinutes).toBe(540);
    expect(calc.actualIn).toBe("2026-09-20T05:00:00.000Z");
    expect(calc.actualOut).toBe("2026-09-20T14:00:00.000Z");
    expect(flexibleDayNonAnchorPunchLocations(
      [
        { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z" },
        { locationId: ua, punchAt: "2026-09-20T14:00:00.000Z" },
      ],
      inf,
    )).toEqual([ua]);
  });
});
