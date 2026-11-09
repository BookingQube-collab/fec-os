import { describe, expect, it } from "vitest";

import {
  defaultOverviewRange,
  rangeForSelectedEvent,
} from "@/lib/people-event-attendance-overview";

describe("rangeForSelectedEvent", () => {
  const fallback = { from: "2026-11-02", to: "2026-11-08" };

  it("returns fallback when event has no dates", () => {
    expect(rangeForSelectedEvent(null, fallback)).toEqual(fallback);
    expect(
      rangeForSelectedEvent({ dateFrom: null, dateTo: null }, fallback),
    ).toEqual(fallback);
  });

  it("uses event dates when within max days", () => {
    expect(
      rangeForSelectedEvent(
        { dateFrom: "2026-11-01", dateTo: "2026-11-10" },
        fallback,
        14,
      ),
    ).toEqual({ from: "2026-11-01", to: "2026-11-10" });
  });

  it("clamps long events to the first N days when not ongoing", () => {
    expect(
      rangeForSelectedEvent(
        { dateFrom: "2026-01-01", dateTo: "2026-03-31" },
        fallback,
        14,
        new Date("2025-12-01T12:00:00Z"),
      ),
    ).toEqual({ from: "2026-01-01", to: "2026-01-14" });
  });

  it("clamps long ongoing events to a window ending today", () => {
    expect(
      rangeForSelectedEvent(
        { dateFrom: "2026-01-01", dateTo: "2026-12-31" },
        fallback,
        14,
        new Date("2026-11-09T12:00:00Z"),
      ),
    ).toEqual({ from: "2026-10-27", to: "2026-11-09" });
  });
});

describe("defaultOverviewRange", () => {
  it("returns prior 7 complete days ending yesterday", () => {
    expect(defaultOverviewRange(new Date("2026-11-09T15:00:00Z"))).toEqual({
      from: "2026-11-02",
      to: "2026-11-08",
    });
  });
});
