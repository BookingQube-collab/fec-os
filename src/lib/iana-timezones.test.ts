import { describe, expect, it } from "vitest";

import { isIanaTimezone, listIanaTimezones } from "./iana-timezones";

describe("iana-timezones", () => {
  it("caches a non-empty IANA list in-process", () => {
    const first = listIanaTimezones();
    const second = listIanaTimezones();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it("accepts Asia/Qatar and rejects garbage", () => {
    expect(isIanaTimezone("Asia/Qatar")).toBe(true);
    expect(isIanaTimezone("Not/AZone")).toBe(false);
    expect(isIanaTimezone("")).toBe(false);
  });
});
