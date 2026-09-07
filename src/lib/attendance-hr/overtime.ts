/**
 * Overtime minutes from roster end (when a shift exists) or site working hours (fallback).
 * Does not invent OT from a hard-coded 9h day, and does not count early check-in
 * as overtime when the person left at or before roster end.
 */
export function computeAttendanceOvertimeMinutes(input: {
  workedMinutes: number;
  actualOut?: string | null;
  scheduledIn?: string | null;
  scheduledOut?: string | null;
  siteExpectedMinutes?: number | null;
}): number {
  const worked = Math.max(0, Math.round(Number(input.workedMinutes) || 0));
  if (worked <= 0) return 0;

  const outMs = input.actualOut ? new Date(input.actualOut).getTime() : Number.NaN;
  const startMs = input.scheduledIn ? new Date(input.scheduledIn).getTime() : Number.NaN;
  let endMs = input.scheduledOut ? new Date(input.scheduledOut).getTime() : Number.NaN;

  if (Number.isFinite(endMs) && Number.isFinite(outMs)) {
    if (Number.isFinite(startMs) && endMs <= startMs) {
      endMs += 24 * 3600_000;
    }
    const pastMs = outMs - endMs;
    // Same 1-minute epsilon as early-leave: on-time / slightly early is not OT.
    if (pastMs > 60_000) return Math.round(pastMs / 60_000);
    return 0;
  }

  const site = Number(input.siteExpectedMinutes);
  if (Number.isFinite(site) && site > 0) {
    return Math.max(0, worked - Math.round(site));
  }
  return 0;
}
