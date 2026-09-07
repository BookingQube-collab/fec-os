import { lateGraceMinutesForLocation, reportingTimeMinutesForLocation } from "./shift-policy";

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
 * Reporting clock shown on Attendance = roster_start − reporting_time_minutes.
 * Example: roster 10:30 − 30 min → 10:00. Never hardcode 10:00.
 */
export function reportingClockIso(
  rosterScheduledIn: string | null | undefined,
  reportingTimeMinutes?: number | null,
): string | null {
  if (!rosterScheduledIn) return null;
  const startMs = new Date(rosterScheduledIn).getTime();
  if (!Number.isFinite(startMs)) return null;
  const lead = reportingTimeMinutesForLocation(reportingTimeMinutes);
  return new Date(startMs - lead * 60_000).toISOString();
}

/**
 * Lateness past on-time window, one decimal minute (e.g. 11.5 = 11m 30s).
 * reporting_clock = scheduled_in − reporting_time_minutes
 * on_time_until = reporting_clock + buffer_minutes
 * (= roster_start − reporting + buffer)
 */
export function computeLatePunchMinutes(input: {
  actualIn: string | null | undefined;
  scheduledIn: string | null | undefined;
  reportingTimeMinutes?: number | null;
  bufferMinutes?: number | null;
  /** When set, used as minutes from roster_start to on_time_until (may be negative). */
  graceMinutes?: number | null;
}): number {
  if (!input.actualIn || !input.scheduledIn) return 0;
  const inMs = new Date(input.actualIn).getTime();
  const startMs = new Date(input.scheduledIn).getTime();
  if (!Number.isFinite(inMs) || !Number.isFinite(startMs)) return 0;
  const grace =
    input.graceMinutes != null && Number.isFinite(Number(input.graceMinutes))
      ? Number(input.graceMinutes)
      : lateGraceMinutesForLocation(input.reportingTimeMinutes, input.bufferMinutes);
  const onTimeUntilMs = startMs + grace * 60_000;
  const lateMs = inMs - onTimeUntilMs;
  if (lateMs <= 0) return 0;
  return Math.round(lateMs / 6_000) / 10;
}

/**
 * Reports listing late punch: recompute from roster start on read.
 * Never trust stored late_minutes when there is no roster shift start — those
 * values are often stale DEFAULT 08:00 baselines (e.g. 137).
 */
export function resolveListingLateMinutes(input: {
  actualIn: string | null | undefined;
  /** Roster-derived scheduled_in only; null when shift start is unknown. */
  rosterScheduledIn: string | null | undefined;
  reportingTimeMinutes?: number | null;
  bufferMinutes?: number | null;
}): number {
  if (!input.rosterScheduledIn) return 0;
  return computeLatePunchMinutes({
    actualIn: input.actualIn,
    scheduledIn: input.rosterScheduledIn,
    reportingTimeMinutes: input.reportingTimeMinutes,
    bufferMinutes: input.bufferMinutes,
  });
}

export type RosterShiftLookup = {
  shift_template_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  is_week_off: boolean;
};

function startHmFromRoster(
  roster: RosterShiftLookup,
  shiftStartByTemplateId: Map<string, { start: string | null; end: string | null }>,
): string | null {
  return (
    normalizeShiftHm(roster.shift_start) ??
    (roster.shift_template_id
      ? shiftStartByTemplateId.get(String(roster.shift_template_id))?.start ?? null
      : null)
  );
}

/**
 * Resolve roster shift-start ISO from roster assignment (+ optional template map).
 * Prefers location-scoped row, then staff+date, then staff typical shift when the
 * working-day assignment has null times (duty-only reuploads). Never invents 08:00.
 */
export function resolveRosterScheduledIn(input: {
  staffId: string | null | undefined;
  locationId: string | null | undefined;
  workDate: string;
  rosterByStaffLocationDate: Map<string, RosterShiftLookup>;
  rosterByStaffDate: Map<string, RosterShiftLookup>;
  shiftStartByTemplateId: Map<string, { start: string | null; end: string | null }>;
  /** Most recent known shift for staff when the day's row has no clock times. */
  fallbackByStaffId?: Map<string, RosterShiftLookup>;
}): string | null {
  const staffId = input.staffId?.trim() || "";
  const workDate = String(input.workDate ?? "").slice(0, 10);
  if (!staffId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;

  const locationId = input.locationId?.trim() || "";
  const candidates: Array<RosterShiftLookup | undefined> = [];
  if (locationId) {
    candidates.push(input.rosterByStaffLocationDate.get(`${staffId}|${locationId}|${workDate}`));
  }
  candidates.push(input.rosterByStaffDate.get(`${staffId}|${workDate}`));

  let sawWorkingDay = false;
  for (const roster of candidates) {
    if (!roster) continue;
    if (roster.is_week_off) continue;
    sawWorkingDay = true;
    const startHm = startHmFromRoster(roster, input.shiftStartByTemplateId);
    if (startHm) return scheduledIsoFromHm(workDate, startHm);
  }

  if (sawWorkingDay) {
    const fallback = input.fallbackByStaffId?.get(staffId);
    if (fallback && !fallback.is_week_off) {
      const startHm = startHmFromRoster(fallback, input.shiftStartByTemplateId);
      if (startHm) return scheduledIsoFromHm(workDate, startHm);
    }
  }
  return null;
}
