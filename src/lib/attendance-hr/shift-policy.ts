import type { ShiftTemplateInput } from "./constants";

/** Staff employment categories that drive expected daily shift length. */
export type AttendanceEmploymentRole = "permanent" | "secondment" | "joker";

export const ATTENDANCE_EMPLOYMENT_TYPES = [
  "permanent",
  "temporary",
  "secondment",
  "joker",
] as const;

export type AttendanceEmploymentType = (typeof ATTENDANCE_EMPLOYMENT_TYPES)[number];

/** Permanent = 9h; secondment / joker (and legacy temporary) = 10h. */
export const PERMANENT_SHIFT_HOURS = 9;
export const EXTENDED_SHIFT_HOURS = 10;
export const PERMANENT_SHIFT_MINUTES = PERMANENT_SHIFT_HOURS * 60;
export const EXTENDED_SHIFT_MINUTES = EXTENDED_SHIFT_HOURS * 60;
/** Fallback short-day floor when expected minutes cannot be resolved. */
export const FLEXIBLE_MIN_WORK_HOURS = 8;
export const FLEXIBLE_MIN_WORK_MINUTES = FLEXIBLE_MIN_WORK_HOURS * 60;
export const DEFAULT_BREAK_MINUTES = 60;
export const URBAN_ARENA_BREAK_MINUTES = 30;
/** Default reporting lead (minutes before roster start) when site has no explicit value. */
export const DEFAULT_REPORTING_TIME_MINUTES = 0;
/** Default late buffer when site has no explicit buffer_minutes. */
export const DEFAULT_BUFFER_MINUTES = 0;

/** Optional per-site overrides from attendance_site_settings. */
export type SiteShiftPolicyOverrides = {
  breakMinutes?: number | null;
  /** Minutes before roster start for the reporting clock (display + late baseline). */
  reportingTimeMinutes?: number | null;
  /** Extra grace after the reporting clock before late punch. */
  bufferMinutes?: number | null;
  permanentHours?: number | null;
  secondmentHours?: number | null;
  jokerHours?: number | null;
};

function finiteHours(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  const n = Number(value);
  if (n < 1 || n > 16) return fallback;
  return n;
}

/**
 * Map staff.employment_type onto the attendance shift role.
 * Legacy `temporary` is treated as Joker (10h). Missing/unknown → null (callers default to permanent hours).
 */
export function normalizeAttendanceEmploymentRole(
  employmentType: string | null | undefined,
): AttendanceEmploymentRole | null {
  const s = String(employmentType ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!s) return null;
  if (s === "permanent") return "permanent";
  if (s === "secondment" || s === "seconded") return "secondment";
  if (s === "joker") return "joker";
  if (s === "temporary" || s === "temp") return "joker";
  return null;
}

/** Resolve expected daily hours for a role, preferring site overrides when set. */
export function expectedShiftHours(
  role: AttendanceEmploymentRole | null | undefined,
  overrides?: Pick<SiteShiftPolicyOverrides, "permanentHours" | "secondmentHours" | "jokerHours"> | null,
): number {
  const permanent = finiteHours(overrides?.permanentHours, PERMANENT_SHIFT_HOURS);
  const secondment = finiteHours(overrides?.secondmentHours, EXTENDED_SHIFT_HOURS);
  const joker = finiteHours(overrides?.jokerHours, EXTENDED_SHIFT_HOURS);
  if (role === "secondment") return secondment;
  if (role === "joker") return joker;
  return permanent;
}

export function expectedShiftMinutes(
  role: AttendanceEmploymentRole | null | undefined,
  overrides?: Pick<SiteShiftPolicyOverrides, "permanentHours" | "secondmentHours" | "jokerHours"> | null,
): number {
  return Math.round(expectedShiftHours(role, overrides) * 60);
}

/** True when location code is Urban Arena (UA / UA-* / UA_*). */
export function isUrbanArenaLocationCode(locationCode: string | null | undefined): boolean {
  const code = String(locationCode ?? "")
    .trim()
    .toUpperCase();
  return code === "UA" || code.startsWith("UA-") || code.startsWith("UA_");
}

/**
 * Break minutes for a site.
 * Prefer an explicit override (from attendance_site_settings.break_minutes).
 * Otherwise Urban Arena sites use 30 minutes; all other locations use 60.
 */
export function breakMinutesForLocation(
  locationCode: string | null | undefined,
  overrideMinutes?: number | null,
): number {
  if (overrideMinutes != null && Number.isFinite(Number(overrideMinutes))) {
    const n = Math.round(Number(overrideMinutes));
    if (n >= 0 && n <= 240) return n;
  }
  if (isUrbanArenaLocationCode(locationCode)) return URBAN_ARENA_BREAK_MINUTES;
  return DEFAULT_BREAK_MINUTES;
}

/**
 * Reporting lead minutes before roster start (scheduled_in).
 * Prefer an explicit override from attendance_site_settings.reporting_time_minutes.
 * reporting_clock = roster_start − reporting_time_minutes.
 */
export function reportingTimeMinutesForLocation(overrideMinutes?: number | null): number {
  if (overrideMinutes != null && Number.isFinite(Number(overrideMinutes))) {
    const n = Math.round(Number(overrideMinutes));
    if (n >= 0 && n <= 180) return n;
  }
  return DEFAULT_REPORTING_TIME_MINUTES;
}

/**
 * Late buffer minutes for a site (extra grace after the reporting clock).
 * Prefer an explicit override from attendance_site_settings.buffer_minutes.
 */
export function bufferMinutesForLocation(overrideMinutes?: number | null): number {
  if (overrideMinutes != null && Number.isFinite(Number(overrideMinutes))) {
    const n = Math.round(Number(overrideMinutes));
    if (n >= 0 && n <= 120) return n;
  }
  return DEFAULT_BUFFER_MINUTES;
}

/**
 * Minutes from roster_start to on_time_until (may be negative when reporting > buffer).
 * on_time_until = roster_start − reporting_time_minutes + buffer_minutes.
 */
export function lateGraceMinutesForLocation(
  reportingTimeMinutes?: number | null,
  bufferMinutes?: number | null,
): number {
  return bufferMinutesForLocation(bufferMinutes) - reportingTimeMinutesForLocation(reportingTimeMinutes);
}

/** Optional per-staff hours / break / standing weekly-off (NULL = use site). */
export type StaffHoursPolicy = {
  expectedHours?: number | null;
  breakMinutes?: number | null;
  weeklyOffWeekday?: number | null;
};

/**
 * Prefer staff expected hours / break when set; otherwise site role hours + site break.
 * Documented ladder for payroll/attendance: staff override → site default.
 */
export function resolveStaffHoursAndBreak(opts: {
  locationCode?: string | null;
  employmentType?: string | null;
  siteBreakMinutes?: number | null;
  permanentHours?: number | null;
  secondmentHours?: number | null;
  jokerHours?: number | null;
  staff?: StaffHoursPolicy | null;
}): {
  breakMinutes: number;
  expectedMinutes: number;
  hoursSource: "staff" | "site";
  breakSource: "staff" | "site";
} {
  const role = normalizeAttendanceEmploymentRole(opts.employmentType);
  const siteExpected = expectedShiftMinutes(role, opts);
  const staffHours =
    opts.staff?.expectedHours != null && Number.isFinite(Number(opts.staff.expectedHours))
      ? Number(opts.staff.expectedHours)
      : null;
  const hoursOk = staffHours != null && staffHours >= 1 && staffHours <= 16;
  const expectedMinutes = hoursOk ? Math.round(staffHours * 60) : siteExpected;
  const staffBreak =
    opts.staff?.breakMinutes != null && Number.isFinite(Number(opts.staff.breakMinutes))
      ? Number(opts.staff.breakMinutes)
      : null;
  const breakOk = staffBreak != null && staffBreak >= 0 && staffBreak <= 240;
  return {
    breakMinutes: breakMinutesForLocation(
      opts.locationCode,
      breakOk ? staffBreak : opts.siteBreakMinutes,
    ),
    expectedMinutes,
    hoursSource: hoursOk ? "staff" : "site",
    breakSource: breakOk ? "staff" : "site",
  };
}

/** Standing weekly-off weekday (0=Sun..6=Sat) vs work_date in Qatar (+03). */
export function isStandingWeeklyOff(
  workDate: string,
  weeklyOffWeekday?: number | null,
): boolean {
  if (weeklyOffWeekday == null || !Number.isFinite(Number(weeklyOffWeekday))) return false;
  const day = Math.round(Number(weeklyOffWeekday));
  if (day < 0 || day > 6) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return false;
  const wd = new Date(`${workDate}T12:00:00+03:00`).getUTCDay();
  return wd === day;
}

/**
 * Roster day flag wins when a roster row exists; otherwise standing staff weekday applies.
 * Explicit roster on-duty on a standing-off weekday keeps the person scheduled.
 */
export function resolveWeekOff(opts: {
  hasRosterRow: boolean;
  rosterIsWeekOff?: boolean | null;
  workDate: string;
  weeklyOffWeekday?: number | null;
}): boolean {
  if (opts.hasRosterRow) return Boolean(opts.rosterIsWeekOff);
  return isStandingWeeklyOff(opts.workDate, opts.weeklyOffWeekday);
}

/**
 * Override shift template break + OT threshold from employment type and location.
 * Start/end times stay on the template / roster. When reporting and/or buffer
 * overrides are set, graceMinutes = buffer − reporting (offset from roster start
 * to on_time_until). Flexible (`lateFromShiftStart`): grace = buffer only —
 * reporting lead is display-only.
 */
export function applyAttendanceShiftPolicy(
  base: ShiftTemplateInput,
  opts: {
    employmentType?: string | null;
    locationCode?: string | null;
    breakMinutesOverride?: number | null;
    /** When set, overrides site role hours for OT + min-work (staff.expected_hours). */
    expectedHoursOverride?: number | null;
    reportingTimeMinutesOverride?: number | null;
    bufferMinutesOverride?: number | null;
    permanentHours?: number | null;
    secondmentHours?: number | null;
    jokerHours?: number | null;
    /** Flexible staff: late after roster start + buffer (not reporting clock). */
    lateFromShiftStart?: boolean;
  },
): ShiftTemplateInput {
  const role = normalizeAttendanceEmploymentRole(opts.employmentType);
  const staffHours =
    opts.expectedHoursOverride != null && Number.isFinite(Number(opts.expectedHoursOverride))
      ? Number(opts.expectedHoursOverride)
      : null;
  const hoursOk = staffHours != null && staffHours >= 1 && staffHours <= 16;
  const expected = hoursOk ? Math.round(staffHours * 60) : expectedShiftMinutes(role, opts);
  const breakMin = breakMinutesForLocation(opts.locationCode, opts.breakMinutesOverride);
  const next: ShiftTemplateInput = {
    ...base,
    breakMinutes: breakMin,
    overtimeAfterMinutes: expected,
    minWorkMinutes: expected,
  };
  const hasReporting =
    opts.reportingTimeMinutesOverride != null &&
    Number.isFinite(Number(opts.reportingTimeMinutesOverride));
  const hasBuffer =
    opts.bufferMinutesOverride != null && Number.isFinite(Number(opts.bufferMinutesOverride));
  if (opts.lateFromShiftStart) {
    next.graceMinutes = bufferMinutesForLocation(opts.bufferMinutesOverride);
    // Flexible: staff expected_hours → else site role hours (same ladder as non-flex).
    next.minWorkMinutes = expected > 0 ? expected : FLEXIBLE_MIN_WORK_MINUTES;
    next.latePunchAffectsStatus = true;
  } else if (hasReporting || hasBuffer) {
    next.graceMinutes = lateGraceMinutesForLocation(
      opts.reportingTimeMinutesOverride,
      opts.bufferMinutesOverride,
    );
  }
  return next;
}

/** Built-in defaults used when seeding a new site with no saved policy. */
export function defaultSiteShiftPolicy(locationCode: string | null | undefined): {
  breakMinutes: number;
  reportingTimeMinutes: number;
  bufferMinutes: number;
  permanentHours: number;
  secondmentHours: number;
  jokerHours: number;
} {
  return {
    breakMinutes: breakMinutesForLocation(locationCode, null),
    reportingTimeMinutes: DEFAULT_REPORTING_TIME_MINUTES,
    bufferMinutes: DEFAULT_BUFFER_MINUTES,
    permanentHours: PERMANENT_SHIFT_HOURS,
    secondmentHours: EXTENDED_SHIFT_HOURS,
    jokerHours: EXTENDED_SHIFT_HOURS,
  };
}

/** Optional per-staff overrides when staff.flexible_attendance is true.
 * Shift start/end always come from the roster upload — not from the staff profile.
 */
export type StaffFlexibleTiming = {
  flexibleAttendance?: boolean | null;
  reportingTimeMinutes?: number | null;
  bufferMinutes?: number | null;
};

/**
 * Prefer staff flexible reporting/buffer when enabled; otherwise site values.
 *
 * Flexible + blank reporting lead → 0 (Reporting time = roster shift start),
 * never inherit site lead. Flexible + blank late buffer → site buffer.
 */
export function resolveReportingAndBuffer(opts: {
  siteReporting?: number | null;
  siteBuffer?: number | null;
  staff?: StaffFlexibleTiming | null;
}): { reportingTimeMinutes: number | null; bufferMinutes: number | null } {
  const siteReporting =
    opts.siteReporting != null && Number.isFinite(Number(opts.siteReporting))
      ? Number(opts.siteReporting)
      : null;
  const siteBuffer =
    opts.siteBuffer != null && Number.isFinite(Number(opts.siteBuffer))
      ? Number(opts.siteBuffer)
      : null;
  if (!opts.staff?.flexibleAttendance) {
    return { reportingTimeMinutes: siteReporting, bufferMinutes: siteBuffer };
  }
  const staffReporting =
    opts.staff.reportingTimeMinutes != null && Number.isFinite(Number(opts.staff.reportingTimeMinutes))
      ? Number(opts.staff.reportingTimeMinutes)
      : null;
  const staffBuffer =
    opts.staff.bufferMinutes != null && Number.isFinite(Number(opts.staff.bufferMinutes))
      ? Number(opts.staff.bufferMinutes)
      : null;
  return {
    // Blank flexible lead = roster start as reporting clock (not site lead).
    reportingTimeMinutes: staffReporting ?? 0,
    bufferMinutes: staffBuffer ?? siteBuffer,
  };
}
