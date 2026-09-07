import { lateGraceMinutesForLocation } from "./shift-policy";

/** Qatar-local HH:MM on workDate → ISO (UTC). */
export function scheduledIsoFromHm(workDate: string, time: string, addDays = 0): string {
  const [hRaw, mRaw] = String(time).slice(0, 5).split(":");
  const h = Number.parseInt(hRaw ?? "0", 10) || 0;
  const m = Number.parseInt(mRaw ?? "0", 10) || 0;
  const [y, mo, d] = workDate.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + addDays, h - 3, m, 0)).toISOString();
}

/** Normalize DB time / HH:MM / HH:MM:SS to HH:MM. */
export function normalizeShiftHm(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Lateness past on-time window, one decimal minute (e.g. 11.5 = 11m 30s).
 * on_time_until = scheduled_in + reporting_time_minutes + buffer_minutes.
 */
export function computeLatePunchMinutes(input: {
  actualIn: string | null | undefined;
  scheduledIn: string | null | undefined;
  reportingTimeMinutes?: number | null;
  bufferMinutes?: number | null;
  /** When set, used instead of reporting+buffer (already combined grace). */
  graceMinutes?: number | null;
}): number {
  if (!input.actualIn || !input.scheduledIn) return 0;
  const inMs = new Date(input.actualIn).getTime();
  const startMs = new Date(input.scheduledIn).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(startMs)) return 0;
  const grace =
    input.graceMinutes != null && Number.isFinite(Number(input.graceMinutes))
      ? Math.max(0, Number(input.graceMinutes))
      : lateGraceMinutesForLocation(input.reportingTimeMinutes, input.bufferMinutes);
  const lateMs = inMs - startMs - grace * 60_000;
  if (lateMs <= 0) return 0;
  return Math.round(lateMs / 6_000) / 10;
}
