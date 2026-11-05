/**
 * Per-location attendance mode (Phase 1 — location vs event payroll plan).
 *
 * Defaults (document in migrations / UI copy; do not change lightly):
 * - HO (`code = HO` or Head Office name) → `shift_punch` (punch in/out; no monthly roster)
 * - Other FEC site locations → `roster` (current monthly roster + punches)
 * - Payroll cut-off: keep existing 28–27 for all locations in Phase 1
 * - Staff `can_self_check_in` remains a per-person punch-driven override; site mode
 *   formalizes the same path for whole locations (HO).
 *
 * TODO(Phase 2+): event workforce / event schedule / event payroll — not modeled here.
 */

export const ATTENDANCE_MODES = ["roster", "shift_punch"] as const;

export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const ATTENDANCE_MODE_ROSTER: AttendanceMode = "roster";
export const ATTENDANCE_MODE_SHIFT_PUNCH: AttendanceMode = "shift_punch";

/** True when the stored/raw value is the shift/punch site mode. */
export function siteUsesShiftPunchAttendance(mode: AttendanceMode | string | null | undefined): boolean {
  return normalizeAttendanceMode(mode) === ATTENDANCE_MODE_SHIFT_PUNCH;
}

/** Coerce DB / form values; unknown → roster (safe existing behavior). */
export function normalizeAttendanceMode(value: unknown): AttendanceMode {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "shift_punch" || raw === "shiftpunch" || raw === "punch") {
    return ATTENDANCE_MODE_SHIFT_PUNCH;
  }
  return ATTENDANCE_MODE_ROSTER;
}

/**
 * Built-in default when a settings row is missing.
 * HO → shift_punch; every other code → roster.
 */
export function defaultAttendanceModeForLocationCode(locationCode: string | null | undefined): AttendanceMode {
  const code = String(locationCode ?? "")
    .trim()
    .toUpperCase();
  if (code === "HO") return ATTENDANCE_MODE_SHIFT_PUNCH;
  return ATTENDANCE_MODE_ROSTER;
}

/**
 * Effective punch-driven day (no roster Absent shells for empty punch days):
 * staff self check-in flag **or** location `shift_punch` mode.
 */
export function usesPunchDrivenAttendance(input: {
  canSelfCheckIn?: boolean | null;
  attendanceMode?: AttendanceMode | string | null;
}): boolean {
  return Boolean(input.canSelfCheckIn) || siteUsesShiftPunchAttendance(input.attendanceMode);
}
