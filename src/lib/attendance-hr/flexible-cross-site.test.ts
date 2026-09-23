import { describe, expect, it } from "vitest";

import { calculateDailyAttendance } from "./calculate";
import { DEFAULT_SHIFT } from "./constants";
import { applyAttendanceShiftPolicy, resolveReportingAndBuffer } from "./shift-policy";
import {
  expandFlexibleBiometricPairsByDeviceName,
  flexibleDayAnchorLocationId,
  flexibleDayFirstLastBiometricUserIds,
  flexibleDayFirstLastLocationIds,
  flexibleDayFirstLastPunchAt,
  flexibleDayHasQualifyingPunches,
  flexibleDayNonAnchorPunchLocations,
  flexibleDayRecalcAction,
  formatFlexibleCrossSiteDeviceUserLabel,
  formatFlexibleCrossSiteLocationLabel,
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

  it("resolves first check-in and last check-out locations", () => {
    expect(
      flexibleDayFirstLastLocationIds([
        { locationId: ua, punchAt: "2026-09-20T14:00:00.000Z" },
        { locationId: inf, punchAt: "2026-09-20T05:00:00.000Z" },
      ]),
    ).toEqual({ checkInLocationId: inf, checkOutLocationId: ua });
    expect(formatFlexibleCrossSiteLocationLabel("INF-CC", "UA-DM")).toBe("INF-CC → UA-DM");
    expect(formatFlexibleCrossSiteLocationLabel("INF-CC", "INF-CC")).toBe("INF-CC");
    expect(formatFlexibleCrossSiteDeviceUserLabel("UA-DM", "35", "INF-CC", "24")).toBe(
      "UA-DM 35 → INF-CC 24",
    );
    expect(formatFlexibleCrossSiteDeviceUserLabel("INF-CC", "24", "INF-CC", "24")).toBe("24");
    expect(flexibleDayFirstLastBiometricUserIds([
      { locationId: ua, punchAt: "2026-09-20T14:12:00.000Z", biometricUserId: "35" },
      { locationId: inf, punchAt: "2026-09-20T07:13:00.000Z", biometricUserId: "24" },
    ])).toEqual({ checkInBiometricUserId: "24", checkOutBiometricUserId: "35" });
  });

  it("resolves same-date first check-in and last check-out punch times", () => {
    expect(
      flexibleDayFirstLastPunchAt([
        { locationId: ua, punchAt: "2026-09-20T14:12:00.000Z" },
        { locationId: inf, punchAt: "2026-09-20T07:13:00.000Z" },
        { locationId: inf, punchAt: "2026-09-20T07:13:05.000Z", probableDuplicate: true },
      ]),
    ).toEqual({
      firstPunchAt: "2026-09-20T07:13:00.000Z",
      lastPunchAt: "2026-09-20T14:12:00.000Z",
      usableCount: 2,
    });
    // Single punch → check-in only (never invent an orphan check-out).
    expect(
      flexibleDayFirstLastPunchAt([{ locationId: ua, punchAt: "2026-09-20T14:12:00.000Z" }]),
    ).toEqual({
      firstPunchAt: "2026-09-20T14:12:00.000Z",
      lastPunchAt: null,
      usableCount: 1,
    });
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
        lateFromShiftStart: true,
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
    expect(calc.lateMinutes).toBe(0);
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

  it("expands flexible bio pairs to unmapped same device_name identities", () => {
    const pairs = expandFlexibleBiometricPairsByDeviceName(
      [
        {
          staffId: "staff-r",
          locationId: "loc-inf",
          biometricUserId: "24",
          deviceName: "Russell",
        },
        {
          staffId: "staff-r",
          locationId: "loc-kds",
          biometricUserId: "20",
          deviceName: "Russell",
        },
      ],
      [
        {
          staffId: "staff-r",
          locationId: "loc-inf",
          biometricUserId: "24",
          deviceName: "Russell",
        },
        {
          staffId: null,
          locationId: "loc-ua",
          biometricUserId: "35",
          deviceName: "Russell",
        },
        {
          staffId: "other",
          locationId: "loc-other",
          biometricUserId: "99",
          deviceName: "Russell",
        },
      ],
    );
    expect(pairs).toEqual(
      expect.arrayContaining([
        { staffId: "staff-r", locationId: "loc-inf", biometricUserId: "24" },
        { staffId: "staff-r", locationId: "loc-kds", biometricUserId: "20" },
        { staffId: "staff-r", locationId: "loc-ua", biometricUserId: "35" },
      ]),
    );
    expect(pairs.some((p) => p.biometricUserId === "99")).toBe(false);
  });
});
