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
export const PERMANENT_SHIFT_MINUTES = 9 * 60;
export const EXTENDED_SHIFT_MINUTES = 10 * 60;
export const DEFAULT_BREAK_MINUTES = 60;
export const URBAN_ARENA_BREAK_MINUTES = 30;

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

export function expectedShiftMinutes(role: AttendanceEmploymentRole | null | undefined): number {
  if (role === "secondment" || role === "joker") return EXTENDED_SHIFT_MINUTES;
  return PERMANENT_SHIFT_MINUTES;
}

/** Urban Arena sites (UA-*) use a 30-minute break; all other locations use 60 minutes. */
export function breakMinutesForLocation(locationCode: string | null | undefined): number {
  const code = String(locationCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "UA" || code.startsWith("UA-") || code.startsWith("UA_")) {
    return URBAN_ARENA_BREAK_MINUTES;
  }
  return DEFAULT_BREAK_MINUTES;
}

/**
 * Override shift template break + OT threshold from employment type and location.
 * Start/end times and grace stay on the template / roster.
 */
export function applyAttendanceShiftPolicy(
  base: ShiftTemplateInput,
  opts: { employmentType?: string | null; locationCode?: string | null },
): ShiftTemplateInput {
  const role = normalizeAttendanceEmploymentRole(opts.employmentType);
  const expected = expectedShiftMinutes(role);
  const breakMin = breakMinutesForLocation(opts.locationCode);
  return {
    ...base,
    breakMinutes: breakMin,
    overtimeAfterMinutes: expected,
    minWorkMinutes: expected,
  };
}
