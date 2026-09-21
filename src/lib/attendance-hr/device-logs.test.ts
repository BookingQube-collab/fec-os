import { describe, expect, it } from "vitest";

import {
  DEVICE_LOG_PUSH_SOURCE,
  deviceLogInOutKey,
  deviceLogKpis,
  deviceLogPunchRange,
  deviceLogPunchSide,
  deviceLogRawDeviceId,
  formatDeviceLogDate,
  deviceLogSearchNeedle,
  deviceLogVerifyKey,
} from "./device-logs";

describe("device log listing", () => {
  it("lists only ADMS device-push punches", () => {
    expect(DEVICE_LOG_PUSH_SOURCE).toBe("adms_push");
  });

  it("formats the punch day in Qatar, not UTC", () => {
    expect(formatDeviceLogDate("2026-09-20T22:30:00.000Z")).toBe("21-09-2026");
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
    expect(deviceLogPunchSide(0)).toBe("in");
    expect(deviceLogPunchSide(3)).toBe("in");
    expect(deviceLogPunchSide(4)).toBe("in");
    expect(deviceLogPunchSide(1)).toBe("out");
    expect(deviceLogPunchSide(2)).toBe("out");
    expect(deviceLogPunchSide(5)).toBe("out");
    expect(deviceLogPunchSide(null)).toBeNull();
    expect(deviceLogPunchSide(99)).toBeNull();
  });

  it("prefers serial_number over device_code for the raw device id", () => {
    expect(deviceLogRawDeviceId({ deviceSerial: " SN001 ", deviceCode: "CODE" })).toBe("SN001");
    expect(deviceLogRawDeviceId({ deviceSerial: "  ", deviceCode: " CODE2 " })).toBe("CODE2");
    expect(deviceLogRawDeviceId({ deviceSerial: null, deviceCode: null })).toBeNull();
  });
});
