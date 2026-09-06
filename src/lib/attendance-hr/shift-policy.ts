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
export const DEFAULT_BREAK_MINUTES = 60;
export const URBAN_ARENA_BREAK_MINUTES = 30;

/** Optional per-site overrides from attendance_site_settings. */
export type SiteShiftPolicyOverrides = {
  breakMinutes?: number | null;
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
 * Override shift template break + OT threshold from employment type and location.
 * Start/end times and grace stay on the template / roster.
 */
export function applyAttendanceShiftPolicy(
  base: ShiftTemplateInput,
  opts: {
    employmentType?: string | null;
    locationCode?: string | null;
    breakMinutesOverride?: number | null;
    permanentHours?: number | null;
    secondmentHours?: number | null;
    jokerHours?: number | null;
  },
): ShiftTemplateInput {
  const role = normalizeAttendanceEmploymentRole(opts.employmentType);
  const expected = expectedShiftMinutes(role, opts);
  const breakMin = breakMinutesForLocation(opts.locationCode, opts.breakMinutesOverride);
  return {
    ...base,
    breakMinutes: breakMin,
    overtimeAfterMinutes: expected,
    minWorkMinutes: expected,
  };
}

/** Built-in defaults used when seeding / “apply to all locations”. */
export function defaultSiteShiftPolicy(locationCode: string | null | undefined): {
  breakMinutes: number;
  permanentHours: number;
  secondmentHours: number;
  jokerHours: number;
} {
  return {
    breakMinutes: breakMinutesForLocation(locationCode, null),
    permanentHours: PERMANENT_SHIFT_HOURS,
    secondmentHours: EXTENDED_SHIFT_HOURS,
    jokerHours: EXTENDED_SHIFT_HOURS,
  };
}
