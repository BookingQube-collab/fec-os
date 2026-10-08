/**
 * A personal reminder belongs to the person who created the planned row.
 * The dispatch job must not retarget that row to whoever happens to run it.
 */

export function plannedReminderRecipient(
  rowUserId: string | null | undefined,
  runnerUserId: string,
): string {
  const owner = typeof rowUserId === "string" ? rowUserId.trim() : "";
  return owner.length > 0 ? owner : runnerUserId;
}

/** Qatar morning, or now when that morning has already passed so a same-day reminder is due. */
export function reminderScheduledFor(dueDate: string, now = new Date()): string {
  const morning = new Date(`${dueDate}T08:00:00+03:00`);
  if (Number.isNaN(morning.getTime())) throw new Error("Choose a reminder date.");
  return (morning.getTime() <= now.getTime() ? now : morning).toISOString();
}

export function chatReminderDateIssue(value: string, today: string): "invalid" | "past" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  if (value < today) return "past";
  return null;
}
