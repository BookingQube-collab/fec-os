import { describe, expect, it } from "vitest";

import {
  deriveEventDayStatus,
  enumerateDatesInclusive,
  normalizeTimeHHMM,
  pairPunchTimes,
  qatarClockMinutesFromIso,
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

  it("reads Asia/Qatar wall clock from ISO punches", () => {
    // 06:05Z = 09:05 Qatar
    expect(qatarClockMinutesFromIso("2026-11-01T06:05:00.000Z")).toBe(9 * 60 + 5);
  });

  it("pairs punches and derives status in Asia/Qatar (not UTC HH:MM)", () => {
    expect(pairPunchTimes(["2026-11-01T05:00:00Z", "2026-11-01T14:00:00Z"])).toEqual({
      actualIn: "2026-11-01T05:00:00Z",
      actualOut: "2026-11-01T14:00:00Z",
    });
    // 09:05 Qatar (=06:05Z) vs 09:00 schedule, grace 15 → present
    const present = deriveEventDayStatus({
      actualIn: "2026-11-01T06:05:00.000Z",
      actualOut: "2026-11-01T15:00:00.000Z",
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
      graceMinutes: 15,
    });
    expect(present.status).toBe("present");
    expect(present.lateMinutes).toBe(0);
    // 09:30 Qatar (=06:30Z) → late 15 after grace 15
    const late = deriveEventDayStatus({
      actualIn: "2026-11-01T06:30:00.000Z",
      actualOut: "2026-11-01T15:00:00.000Z",
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
      graceMinutes: 15,
    });
    expect(late.status).toBe("late");
    expect(late.lateMinutes).toBe(15);
    // Stay past 18:00 Qatar (=15:00Z) → OT
    const ot = deriveEventDayStatus({
      actualIn: "2026-11-01T06:00:00.000Z",
      actualOut: "2026-11-01T16:00:00.000Z",
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
      graceMinutes: 15,
    });
    expect(ot.overtimeMinutes).toBe(60);
    expect(ot.status).toBe("overtime");
    const missed = deriveEventDayStatus({
      actualIn: "2026-11-01T06:00:00.000Z",
      actualOut: null,
      workDate: "2026-11-01",
      scheduledIn: "09:00",
      scheduledOut: "18:00",
    });
    expect(missed.status).toBe("missed_punch");
  });
});
