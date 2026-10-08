import { describe, expect, it } from "vitest";

import { chatReminderDateIssue, plannedReminderRecipient, reminderScheduledFor } from "./reminder-rules";

describe("personal chat reminder", () => {
  it("notifies the person who created the row, not whoever runs the job", () => {
    const creator = "11111111-1111-4111-8111-111111111111";
    const runner = "22222222-2222-4222-8222-222222222222";
    expect(plannedReminderRecipient(creator, runner)).toBe(creator);
    expect(plannedReminderRecipient("  ", runner)).toBe(runner);
    expect(plannedReminderRecipient(null, runner)).toBe(runner);
  });

  it("rejects a past or unusable date and schedules a future morning in Qatar", () => {
    expect(chatReminderDateIssue("2026-10-01", "2026-10-02")).toBe("past");
    expect(chatReminderDateIssue("tomorrow", "2026-10-02")).toBe("invalid");
    expect(chatReminderDateIssue("2026-10-02", "2026-10-02")).toBeNull();
    const future = reminderScheduledFor("2026-10-10", new Date("2026-10-02T12:00:00+03:00"));
    expect(future).toBe(new Date("2026-10-10T08:00:00+03:00").toISOString());
    const now = new Date("2026-10-02T15:00:00+03:00");
    expect(reminderScheduledFor("2026-10-02", now)).toBe(now.toISOString());
  });
});
