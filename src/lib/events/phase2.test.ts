import { describe, expect, it } from "vitest";

import {
  addDaysYmd,
  buildTaskHistoryDiffs,
  classifyTaskReminder,
  eventTaskAttachmentObjectPath,
  matchesPlanFilters,
  nextRecurrenceDueDate,
  normalizeAssigneeIds,
  parseSavedFilters,
  shouldSpawnRecurrence,
} from "@/lib/events/phase2-tasks";

const EVENT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TASK = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ATT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("event pm phase 2", () => {
  it("scopes task attachment paths under event id", () => {
    const path = eventTaskAttachmentObjectPath(EVENT, TASK, ATT, "Spec Sheet.pdf", 42);
    expect(path.startsWith(`${EVENT}/tasks/${TASK}/${ATT}/`)).toBe(true);
    expect(path).toContain("Spec_Sheet.pdf");
  });

  it("advances recurrence due dates", () => {
    expect(nextRecurrenceDueDate("2026-10-29", "daily", 1)).toBe("2026-10-30");
    expect(nextRecurrenceDueDate("2026-10-29", "weekly", 2)).toBe("2026-11-12");
    expect(nextRecurrenceDueDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
  });

  it("spawns recurrence only on fresh completion within bounds", () => {
    expect(
      shouldSpawnRecurrence({
        status: "completed",
        prevStatus: "in_progress",
        recurrenceFreq: "weekly",
        nextDue: "2026-11-05",
      }),
    ).toBe(true);
    expect(
      shouldSpawnRecurrence({
        status: "completed",
        prevStatus: "completed",
        recurrenceFreq: "weekly",
        nextDue: "2026-11-05",
      }),
    ).toBe(false);
    expect(
      shouldSpawnRecurrence({
        status: "completed",
        prevStatus: "in_progress",
        recurrenceFreq: "weekly",
        nextDue: "2026-12-01",
        recurrenceUntil: "2026-11-15",
      }),
    ).toBe(false);
  });

  it("records status/assignee/percent history diffs", () => {
    const diffs = buildTaskHistoryDiffs(
      { status: "not_started", assignee_staff_id: null, percent_complete: 0, priority: "normal" },
      { status: "in_progress", assignee_staff_id: "s1", percent_complete: 40, priority: "normal" },
    );
    expect(diffs.map((d) => d.change_type).sort()).toEqual(["assignee", "percent", "status"]);
  });

  it("classifies due-soon and overdue reminders", () => {
    expect(
      classifyTaskReminder({ status: "in_progress", dueDate: "2026-10-28", today: "2026-10-29" }),
    ).toBe("overdue");
    expect(
      classifyTaskReminder({
        status: "in_progress",
        dueDate: "2026-10-31",
        today: "2026-10-29",
        reminderDaysBefore: 3,
      }),
    ).toBe("due_soon");
    expect(
      classifyTaskReminder({ status: "completed", dueDate: "2026-10-28", today: "2026-10-29" }),
    ).toBeNull();
    expect(addDaysYmd("2026-10-29", 3)).toBe("2026-11-01");
  });

  it("normalizes primary + additional assignees", () => {
    expect(normalizeAssigneeIds(null, ["a", "b"])).toEqual({ primary: "a", all: ["a", "b"] });
    expect(normalizeAssigneeIds("p", ["p", "x"])).toEqual({ primary: "p", all: ["p", "x"] });
  });

  it("matches saved plan filters including multi-assignees", () => {
    const filters = parseSavedFilters({ status: "blocked", owner: "s2" });
    expect(filters.status).toBe("blocked");
    expect(
      matchesPlanFilters(
        { status: "blocked", owner_staff_id: null, assignee_staff_id: null, assignee_ids: ["s2"] },
        filters,
      ),
    ).toBe(true);
    expect(
      matchesPlanFilters(
        { status: "blocked", owner_staff_id: "s1", assignee_staff_id: null, assignee_ids: [] },
        filters,
      ),
    ).toBe(false);
  });
});
