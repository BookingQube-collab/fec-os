import { describe, expect, it } from "vitest";

import {
  buildOverviewKpis,
  defaultOverviewRange,
  eventsInRange,
  rangeCoveringAttendanceRows,
  rangeCoveringEvents,
  rangeForSelectedEvent,
} from "@/lib/people-event-attendance-overview";
import type { PeopleEventOption } from "@/lib/people-event-workforce.functions";

function event(
  partial: Partial<PeopleEventOption> & Pick<PeopleEventOption, "id" | "name">,
): PeopleEventOption {
  return {
    eventNumber: null,
    locationId: null,
    locationName: null,
    dateFrom: null,
    dateTo: null,
    status: "active",
    ...partial,
  };
}

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

describe("rangeCoveringEvents", () => {
  const fallback = { from: "2026-11-03", to: "2026-11-09" };

  it("returns fallback when no dated events", () => {
    expect(rangeCoveringEvents([], fallback)).toEqual(fallback);
    expect(
      rangeCoveringEvents([{ dateFrom: null, dateTo: null }], fallback),
    ).toEqual(fallback);
  });

  it("unions event windows for All events Overview", () => {
    expect(
      rangeCoveringEvents(
        [
          { dateFrom: "2026-11-23", dateTo: "2026-12-02" },
          { dateFrom: "2026-11-20", dateTo: "2026-11-22" },
        ],
        fallback,
        31,
      ),
    ).toEqual({ from: "2026-11-20", to: "2026-12-02" });
  });

  it("clamps long unions to a window ending at the latest end", () => {
    expect(
      rangeCoveringEvents(
        [
          { dateFrom: "2026-01-01", dateTo: "2026-01-10" },
          { dateFrom: "2026-11-01", dateTo: "2026-11-30" },
        ],
        fallback,
        14,
      ),
    ).toEqual({ from: "2026-11-17", to: "2026-11-30" });
  });
});

describe("buildOverviewKpis totalEvents", () => {
  it("counts only events overlapping the range (no all-events fallback)", () => {
    const events = [
      event({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "Late Nov",
        dateFrom: "2026-11-23",
        dateTo: "2026-12-02",
      }),
    ];
    const kpis = buildOverviewKpis({
      events,
      attendanceRows: [],
      previousAttendanceRows: [],
      previousEvents: events,
      dateFrom: "2026-11-03",
      dateTo: "2026-11-09",
    });
    expect(eventsInRange(events, "2026-11-03", "2026-11-09")).toHaveLength(0);
    expect(kpis.totalEvents).toBe(0);
  });

  it("counts overlapping events for All events aggregation", () => {
    const events = [
      event({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "In range",
        dateFrom: "2026-11-05",
        dateTo: "2026-11-08",
      }),
      event({
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        name: "Outside",
        dateFrom: "2026-12-01",
        dateTo: "2026-12-05",
      }),
    ];
    const kpis = buildOverviewKpis({
      events,
      attendanceRows: [],
      previousAttendanceRows: [],
      previousEvents: events,
      dateFrom: "2026-11-03",
      dateTo: "2026-11-09",
    });
    expect(kpis.totalEvents).toBe(1);
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

describe("rangeCoveringAttendanceRows", () => {
  const fallback = { from: "2026-12-16", to: "2026-12-29" };

  it("returns fallback when no work dates", () => {
    expect(rangeCoveringAttendanceRows([], fallback)).toEqual(fallback);
  });

  it("covers seeded attendance outside the event open window", () => {
    expect(
      rangeCoveringAttendanceRows(
        [{ workDate: "2026-11-11" }, { workDate: "2026-11-13" }, { workDate: "2026-11-12" }],
        fallback,
        14,
      ),
    ).toEqual({ from: "2026-11-11", to: "2026-11-13" });
  });

  it("clamps long attendance spans to max days from the first day", () => {
    expect(
      rangeCoveringAttendanceRows(
        [{ workDate: "2026-11-01" }, { workDate: "2026-11-30" }],
        fallback,
        14,
      ),
    ).toEqual({ from: "2026-11-01", to: "2026-11-14" });
  });
});
