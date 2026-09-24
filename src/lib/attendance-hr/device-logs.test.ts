import { describe, expect, it } from "vitest";

import {
  DEVICE_LOG_CAP,
  DEVICE_LOG_PUSH_SOURCE,
  DEVICE_LOG_USERS_PAGE_SIZE,
  buildDeviceLogDaysCsv,
  collectDeviceLogUsers,
  deviceLogDisplayName,
  deviceLogInOutKey,
  deviceLogKpis,
  deviceLogMatchesNeedle,
  deviceLogPunchRange,
  deviceLogPunchSide,
  deviceLogQatarYmd,
  deviceLogRawDeviceId,
  deviceLogSearchOrFilter,
  deviceLogUserOptionKey,
  deviceLogUserOptionLabel,
  deviceLogUserPairsOrFilter,
  formatDeviceLogDate,
  formatDeviceLogYmd,
  deviceLogSearchNeedle,
  deviceLogVerifyKey,
  indexDeviceLogBioNames,
  lookupDeviceLogBioName,
  parseDeviceLogUserOptionKey,
  rollupDeviceLogDays,
  collapseCrossSiteDeviceLogDays,
  deviceLogLocationLabel,
  deviceLogUserIdLabel,
  type AttendanceDeviceLogRow,
} from "./device-logs";

function punch(partial: Partial<AttendanceDeviceLogRow> & Pick<AttendanceDeviceLogRow, "id" | "punchAt">): AttendanceDeviceLogRow {
  return {
    locationId: "loc1",
    locationCode: "JJA",
    locationName: "JJA",
    deviceId: "dev1",
    deviceName: "Gate",
    deviceSerial: "SN1",
    deviceCode: null,
    biometricUserId: "1001",
    deviceUserName: "Ali",
    inOutStatus: null,
    verifyMethod: null,
    workCode: null,
    source: "adms_push",
    ...partial,
  };
}

describe("device log listing", () => {
  it("lists only ADMS device-push punches", () => {
    expect(DEVICE_LOG_PUSH_SOURCE).toBe("adms_push");
  });

  it("pages user-dropdown punches separately from the table cap", () => {
    expect(DEVICE_LOG_USERS_PAGE_SIZE).toBe(1000);
    expect(DEVICE_LOG_CAP).toBe(2000);
  });

  it("formats the punch day in Qatar, not UTC", () => {
    expect(formatDeviceLogDate("2026-09-20T22:30:00.000Z")).toBe("21-09-2026");
    expect(deviceLogQatarYmd("2026-09-20T22:30:00.000Z")).toBe("2026-09-21");
    expect(formatDeviceLogYmd("2026-09-21")).toBe("21-09-2026");
  });

  it("bounds a Qatar civil day on punch_at", () => {
    expect(deviceLogPunchRange("2026-09-01", "2026-09-27")).toEqual({
      fromIso: "2026-09-01T00:00:00+03:00",
      toIso: "2026-09-27T23:59:59.999+03:00",
    });
  });

  it("strips filter metacharacters from search", () => {
    expect(deviceLogSearchNeedle("  %10,02_ ")).toBe("1002");
    expect(deviceLogSearchNeedle("Ali (gate)")).toBe("Ali gate");
  });

  it("counts raw rows, device user ids, and devices", () => {
    expect(
      deviceLogKpis([
        { biometricUserId: "1001", deviceId: "a" },
        { biometricUserId: "1001", deviceId: "a" },
        { biometricUserId: " 1002 ", deviceId: "b" },
        { biometricUserId: null, deviceId: null },
      ]),
    ).toEqual({ records: 4, deviceUsers: 2, devices: 2 });
    expect(
      deviceLogKpis([
        { locationId: "loc-a", biometricUserId: "18", deviceId: "d1" },
        { locationId: "loc-b", biometricUserId: "18", deviceId: "d2" },
      ]),
    ).toEqual({ records: 2, deviceUsers: 2, devices: 2 });
  });

  it("labels only the ZKTeco in/out and verify codes we store", () => {
    expect(deviceLogInOutKey(0)).toBe("in");
    expect(deviceLogInOutKey(1)).toBe("out");
    expect(deviceLogInOutKey(255)).toBeNull();
    expect(deviceLogInOutKey(null)).toBeNull();
    expect(deviceLogVerifyKey(1)).toBe("fingerprint");
    expect(deviceLogVerifyKey(15)).toBe("face");
    expect(deviceLogVerifyKey(9)).toBeNull();
  });

  it("puts each punch in the in or out time column", () => {
    // ZKTeco status: 0 check-in, 1 check-out (plus break/OT variants).
    expect(deviceLogPunchSide(0)).toBe("in");
    expect(deviceLogPunchSide(3)).toBe("in");
    expect(deviceLogPunchSide(4)).toBe("in");
    expect(deviceLogPunchSide(1)).toBe("out");
    expect(deviceLogPunchSide(2)).toBe("out");
    expect(deviceLogPunchSide(5)).toBe("out");
    expect(deviceLogPunchSide(null)).toBeNull();
    expect(deviceLogPunchSide(99)).toBeNull();
    // Verify-method codes must not be treated as in/out (old swap bug put 1 here).
    expect(deviceLogInOutKey(15)).toBeNull();
    expect(deviceLogPunchSide(15)).toBeNull();
  });

  it("rolls two ins and two outs on the same day into one row", () => {
    const days = rollupDeviceLogDays([
      punch({ id: "1", punchAt: "2026-09-21T05:00:00.000Z", inOutStatus: 0 }), // 08:00 Qatar in
      punch({ id: "2", punchAt: "2026-09-21T06:00:00.000Z", inOutStatus: 0 }), // late in
      punch({ id: "3", punchAt: "2026-09-21T13:00:00.000Z", inOutStatus: 1 }), // out
      punch({ id: "4", punchAt: "2026-09-21T14:30:00.000Z", inOutStatus: 1 }), // later out
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]?.dateYmd).toBe("2026-09-21");
    expect(days[0]?.punchInAt).toBe("2026-09-21T05:00:00.000Z");
    expect(days[0]?.punchOutAt).toBe("2026-09-21T14:30:00.000Z");
    expect(days[0]?.punchCount).toBe(4);
    expect(days[0]?.biometricUserId).toBe("1001");
  });

  it("handles only-ins, only-outs, and unknown-status days", () => {
    const onlyIns = rollupDeviceLogDays([
      punch({ id: "a", punchAt: "2026-09-21T05:00:00.000Z", inOutStatus: 0 }),
      punch({ id: "b", punchAt: "2026-09-21T06:00:00.000Z", inOutStatus: 0 }),
    ]);
    expect(onlyIns).toHaveLength(1);
    expect(onlyIns[0]?.punchInAt).toBe("2026-09-21T05:00:00.000Z");
    expect(onlyIns[0]?.punchOutAt).toBeNull();

    const onlyOuts = rollupDeviceLogDays([
      punch({ id: "c", punchAt: "2026-09-22T13:00:00.000Z", inOutStatus: 1, biometricUserId: "1002" }),
      punch({ id: "d", punchAt: "2026-09-22T15:00:00.000Z", inOutStatus: 1, biometricUserId: "1002" }),
    ]);
    expect(onlyOuts).toHaveLength(1);
    expect(onlyOuts[0]?.punchInAt).toBeNull();
    expect(onlyOuts[0]?.punchOutAt).toBe("2026-09-22T15:00:00.000Z");

    const unknown = rollupDeviceLogDays([
      punch({ id: "e", punchAt: "2026-09-23T05:00:00.000Z", inOutStatus: null, biometricUserId: "1003" }),
      punch({ id: "f", punchAt: "2026-09-23T14:00:00.000Z", inOutStatus: 99, biometricUserId: "1003" }),
    ]);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.punchInAt).toBe("2026-09-23T05:00:00.000Z");
    expect(unknown[0]?.punchOutAt).toBe("2026-09-23T14:00:00.000Z");
  });

  it("keeps separate rows when the same user punches two devices the same day", () => {
    const days = rollupDeviceLogDays([
      punch({ id: "1", punchAt: "2026-09-21T05:00:00.000Z", inOutStatus: 0, deviceId: "dev1" }),
      punch({ id: "2", punchAt: "2026-09-21T14:00:00.000Z", inOutStatus: 1, deviceId: "dev2", deviceSerial: "SN2" }),
    ]);
    expect(days).toHaveLength(2);
  });

  it("merges same-name cross-site in/out into one day row", () => {
    const days = collapseCrossSiteDeviceLogDays(
      rollupDeviceLogDays([
        punch({
          id: "in",
          locationId: "loc-ua",
          locationCode: "UA-DM",
          biometricUserId: "35",
          deviceUserName: "Russell",
          deviceId: "dev-ua",
          deviceSerial: "JJA1254401368",
          punchAt: "2026-09-20T07:13:41.000Z",
          inOutStatus: 0,
        }),
        punch({
          id: "out",
          locationId: "loc-inf",
          locationCode: "INF-CC",
          biometricUserId: "24",
          deviceUserName: "Russell",
          deviceId: "dev-inf",
          deviceSerial: "JJA1251800498",
          punchAt: "2026-09-20T16:12:22.000Z",
          inOutStatus: 1,
        }),
      ]),
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.punchInAt).toBe("2026-09-20T07:13:41.000Z");
    expect(days[0]?.punchOutAt).toBe("2026-09-20T16:12:22.000Z");
    expect(deviceLogLocationLabel(days[0]!)).toBe("UA-DM → INF-CC");
    expect(deviceLogUserIdLabel(days[0]!)).toBe("UA-DM 35 → INF-CC 24");
    expect(deviceLogRawDeviceId(days[0]!)).toBe("UA-DM JJA1254401368 → INF-CC JJA1251800498");
  });

  it("merges when only one site has staff_id (mapped) and the other is name-only", () => {
    const days = collapseCrossSiteDeviceLogDays(
      rollupDeviceLogDays([
        punch({
          id: "in",
          locationId: "loc-ua",
          locationCode: "UA-DM",
          biometricUserId: "35",
          deviceUserName: "Russell",
          staffId: null,
          deviceId: "dev-ua",
          deviceSerial: "JJA1254401368",
          punchAt: "2026-09-20T07:13:41.000Z",
          inOutStatus: 0,
        }),
        punch({
          id: "out",
          locationId: "loc-inf",
          locationCode: "INF-CC",
          biometricUserId: "24",
          deviceUserName: "Russell",
          staffId: "staff-russell",
          deviceId: "dev-inf",
          deviceSerial: "JJA1251800498",
          punchAt: "2026-09-20T16:12:22.000Z",
          inOutStatus: 1,
        }),
      ]),
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.staffId).toBe("staff-russell");
    expect(deviceLogLocationLabel(days[0]!)).toBe("UA-DM → INF-CC");
    expect(deviceLogUserIdLabel(days[0]!)).toBe("UA-DM 35 → INF-CC 24");
    expect(days[0]?.punchInAt).toBe("2026-09-20T07:13:41.000Z");
    expect(days[0]?.punchOutAt).toBe("2026-09-20T16:12:22.000Z");
  });

  it("prefers serial_number over device_code for the raw device id", () => {
    expect(deviceLogRawDeviceId({ deviceSerial: " SN001 ", deviceCode: "CODE" })).toBe("SN001");
    expect(deviceLogRawDeviceId({ deviceSerial: "  ", deviceCode: " CODE2 " })).toBe("CODE2");
    expect(deviceLogRawDeviceId({ deviceSerial: null, deviceCode: null })).toBeNull();
  });

  it("resolves Name from punch, then biometric device_name, then full_name, then staff", () => {
    expect(deviceLogDisplayName("  Punch Ali  ", { device_name: "Device Ali", full_name: "HR Ali" })).toBe("Punch Ali");
    expect(deviceLogDisplayName("  ", { device_name: " Device Ali ", full_name: "Full" })).toBe("Device Ali");
    expect(deviceLogDisplayName(null, { device_name: null, full_name: " Full Ali " })).toBe("Full Ali");
    expect(deviceLogDisplayName(null, { device_name: "  ", full_name: "  " })).toBeNull();
    expect(deviceLogDisplayName(null, undefined)).toBeNull();
    expect(deviceLogDisplayName(null, { device_name: null, full_name: null }, "  Staff Ali  ")).toBe("Staff Ali");
    expect(deviceLogDisplayName(null, { device_name: null, full_name: "Bio" }, "Staff")).toBe("Bio");
  });

  it("looks up biometric registry by location+user, preferring device_id match", () => {
    const index = indexDeviceLogBioNames([
      {
        location_id: "loc1",
        device_id: null,
        biometric_user_id: "1001",
        device_name: "Loc User",
        full_name: null,
      },
      {
        location_id: "loc1",
        device_id: "dev1",
        biometric_user_id: "1001",
        device_name: "Dev User",
        full_name: null,
      },
    ]);
    expect(lookupDeviceLogBioName(index, "loc1", "1001", "dev1")?.device_name).toBe("Dev User");
    expect(lookupDeviceLogBioName(index, "loc1", "1001", "other")?.device_name).toBe("Loc User");
    expect(lookupDeviceLogBioName(index, "loc1", "1001", null)?.device_name).toBe("Loc User");
    expect(lookupDeviceLogBioName(index, "loc1", "9999", "dev1")).toBeUndefined();
  });

  it("matches search against display name or user id after enrichment", () => {
    expect(deviceLogMatchesNeedle("Louie", { biometricUserId: "42", deviceUserName: "Louie Pathak" })).toBe(true);
    expect(deviceLogMatchesNeedle("42", { biometricUserId: "42", deviceUserName: "Louie" })).toBe(true);
    expect(deviceLogMatchesNeedle("Louie", { biometricUserId: "99", deviceUserName: null })).toBe(false);
  });

  it("builds PostgREST or filter including registry-matched user ids", () => {
    expect(deviceLogSearchOrFilter("Louie", [])).toBe(
      "biometric_user_id.ilike.%Louie%,device_user_name.ilike.%Louie%",
    );
    expect(deviceLogSearchOrFilter("Louie", [" 12 ", "12", "3,4"])).toBe(
      "biometric_user_id.ilike.%Louie%,device_user_name.ilike.%Louie%,biometric_user_id.in.(12,34)",
    );
  });

  it("collects distinct device users per location so cross-site id collisions stay visible", () => {
    const users = collectDeviceLogUsers([
      { locationId: "loc-b", locationCode: "INF-EE", biometricUserId: "18", deviceUserName: "Ali" },
      { locationId: "loc-a", locationCode: "INF-CC", biometricUserId: "18", deviceUserName: "Louie" },
      { locationId: "loc-a", locationCode: "INF-CC", biometricUserId: "18", deviceUserName: null },
      { locationId: "loc-a", locationCode: "INF-CC", biometricUserId: "1", deviceUserName: "Sam" },
      { locationId: null, locationCode: null, biometricUserId: "9", deviceUserName: "Skip" },
      { locationId: "loc-a", locationCode: "INF-CC", biometricUserId: "  ", deviceUserName: "Skip" },
    ]);
    expect(users).toEqual([
      {
        key: "loc-b|18",
        locationId: "loc-b",
        locationCode: "INF-EE",
        biometricUserId: "18",
        name: "Ali",
      },
      {
        key: "loc-a|18",
        locationId: "loc-a",
        locationCode: "INF-CC",
        biometricUserId: "18",
        name: "Louie",
      },
      {
        key: "loc-a|1",
        locationId: "loc-a",
        locationCode: "INF-CC",
        biometricUserId: "1",
        name: "Sam",
      },
    ]);
    expect(deviceLogUserOptionLabel(users[1]!)).toBe("Louie · 18 · INF-CC");
    expect(deviceLogUserOptionKey("loc-a", "18")).toBe("loc-a|18");
    expect(parseDeviceLogUserOptionKey("loc-a|18")).toEqual({
      locationId: "loc-a",
      biometricUserId: "18",
    });
    expect(deviceLogUserPairsOrFilter([
      { locationId: "loc-a", biometricUserId: "18" },
      { locationId: "loc-b", biometricUserId: " 18 " },
    ])).toBe(
      "and(location_id.eq.loc-a,biometric_user_id.eq.18),and(location_id.eq.loc-b,biometric_user_id.eq.18)",
    );
  });

  it("exports rolled-up day rows as CSV", () => {
    const days = rollupDeviceLogDays([
      punch({ id: "1", punchAt: "2026-09-21T05:00:00.000Z", inOutStatus: 0, deviceUserName: "Louie" }),
      punch({ id: "2", punchAt: "2026-09-21T14:00:00.000Z", inOutStatus: 1, deviceUserName: "Louie" }),
    ]);
    const csv = buildDeviceLogDaysCsv(days, (iso) => (iso ? "TIME" : ""));
    expect(csv.split("\r\n")[0]).toBe("Location,Device ID,User ID,Name,Date,Punch in,Punch out");
    expect(csv).toContain("JJA,SN1,1001,Louie,21-09-2026,TIME,TIME");
  });
});
