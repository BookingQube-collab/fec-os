import { describe, expect, it } from "vitest";

import {
  deriveEventDayStatus,
  enumerateDatesInclusive,
  normalizeTimeHHMM,
  pairPunchTimes,
  seedSlotsFromAssignments,
  validateScheduleSlotTimes,
} from "@/lib/events/event-schedule";

describe("event schedule helpers", () => {
  it("normalizes and validates times", () => {
    expect(normalizeTimeHHMM("9:00")).toBe("09:00");
    expect(validateScheduleSlotTimes("09:00", "18:00")).toBeNull();
    expect(validateScheduleSlotTimes("09:00", "09:00")).toMatch(/differ/);
  });

  it("enumerates inclusive dates", () => {
    expect(enumerateDatesInclusive("2026-11-01", "2026-11-03")).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
  });

  it("seeds one slot per assignment day", () => {
    const rows = seedSlotsFromAssignments("e1", [
      {
        id: "a1",
        staff_id: "s1",
        date_from: "2026-11-01",
        date_to: "2026-11-02",
        role_label: "Crew",
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].scheduled_in).toBe("09:00");
    expect(rows[1].work_date).toBe("2026-11-02");
  });

  it("pairs punches and derives status", () => {
    expect(pairPunchTimes(["2026-11-01T08:00:00Z", "2026-11-01T17:00:00Z"])).toEqual({
      actualIn: "2026-11-01T08:00:00Z",
      actualOut: "2026-11-01T17:00:00Z",
    });
    const present = deriveEventDayStatus({
      actualIn: "2026-11-01T09:05:00.000Z",
      actualOut: "2026-11-01T18:00:00.000Z",
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
      graceMinutes: 15,
    });
    expect(present.status).toBe("present");
    const late = deriveEventDayStatus({
      actualIn: "2026-11-01T09:30:00.000Z",
      actualOut: "2026-11-01T18:00:00.000Z",
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
      graceMinutes: 15,
    });
    expect(late.status).toBe("late");
    expect(late.lateMinutes).toBe(15);
    const missed = deriveEventDayStatus({
      actualIn: "2026-11-01T09:00:00.000Z",
      actualOut: null,
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
    });
    expect(missed.status).toBe("missed_punch");
  });
});
