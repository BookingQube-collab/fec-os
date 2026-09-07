import { describe, expect, it } from "vitest";

import { computeLatePunchMinutes, normalizeShiftHm, scheduledIsoFromHm } from "./late-punch";

describe("late punch helpers", () => {
  it("normalizes HH:MM and HH:MM:SS", () => {
    expect(normalizeShiftHm("10:00")).toBe("10:00");
    expect(normalizeShiftHm("10:00:00")).toBe("10:00");
    expect(normalizeShiftHm("9:30")).toBe("09:30");
    expect(normalizeShiftHm(null)).toBeNull();
  });

  it("builds Qatar-local scheduled ISO", () => {
    expect(scheduledIsoFromHm("2026-08-27", "10:00")).toBe("2026-08-27T07:00:00.000Z");
  });

  it("roster 10:00 + reporting 30 + buffer 15 → late after 10:45", () => {
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:26:00.000Z", // 10:26 Qatar
        scheduledIn: "2026-08-27T07:00:00.000Z", // 10:00 Qatar
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);

    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:50:30.000Z", // 10:50:30 → 5.5 past 10:45
        scheduledIn: "2026-08-27T07:00:00.000Z",
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(5.5);
  });

  it("does not use midnight/default baseline without scheduled_in", () => {
    expect(
      computeLatePunchMinutes({
        actualIn: "2026-08-27T07:26:00.000Z",
        scheduledIn: null,
        reportingTimeMinutes: 30,
        bufferMinutes: 15,
      }),
    ).toBe(0);
  });
});
