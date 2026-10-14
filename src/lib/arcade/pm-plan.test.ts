import { describe, expect, it } from "vitest";

import { DEFAULT_PM_CHECKLIST } from "@/lib/arcade/domain";
import { localIsoDay, pmDueTone, scheduleForMachine, storedChecklistLabels } from "@/lib/arcade/pm-plan";

describe("preventive schedule plan", () => {
  it("keeps a stored checklist and drops blank or repeated lines", () => {
    expect(storedChecklistLabels(["  Track sensor  ", "Track sensor", "", "Safety stop"])).toEqual([
      "Track sensor",
      "Safety stop",
    ]);
  });

  it("uses the standard checklist when nothing usable is stored", () => {
    expect(storedChecklistLabels(null)).toEqual([...DEFAULT_PM_CHECKLIST]);
    expect(storedChecklistLabels(["x"])).toEqual([...DEFAULT_PM_CHECKLIST]);
  });

  it("updates the earliest active schedule for a game and ignores a second copy", () => {
    const rows = [
      { id: "later", machine_id: "m1", next_due_on: "2026-11-01", active: true },
      { id: "sooner", machine_id: "m1", next_due_on: "2026-10-01", active: true },
      { id: "other", machine_id: "m2", next_due_on: "2026-09-01", active: true },
      { id: "retired", machine_id: "m1", next_due_on: "2026-01-01", active: false },
    ];
    expect(scheduleForMachine(rows, "m1")?.id).toBe("sooner");
    expect(scheduleForMachine(rows, "missing")).toBeNull();
  });

  it("marks a visit overdue only when the stored date is before today", () => {
    expect(pmDueTone("2026-10-12", "2026-10-13")).toBe("over");
    expect(pmDueTone("2026-10-13", "2026-10-13")).toBe("today");
    expect(pmDueTone("2026-10-20", "2026-10-13")).toBe("later");
    expect(pmDueTone(null, "2026-10-13")).toBe("none");
    expect(localIsoDay(new Date(2026, 9, 13))).toBe("2026-10-13");
  });
});
