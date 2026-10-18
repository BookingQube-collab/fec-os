/**
 * Build shift-roster rows from device punch day rollups (complete in+out only).
 * Used for roaming staff who have not uploaded a roster for those days.
 */

import { isFnbManager } from "@/lib/arcade/access";
import { canOpenShiftRoster, canOpenShiftRosterAsHoOPeer } from "@/lib/site-ops-access";

export const ROSTER_FROM_PUNCH_SOURCE = "device_punch";

/** Inclusive range an admin can save in one action (FEC payroll month is ~30 days). */
export const ROSTER_FROM_PUNCH_MAX_DAYS = 62;

/**
 * Who may self-enter a roster day for an incomplete punch-out.
 * Not every `is_roaming` person — only Russell and Louie (first-name match on staff.full_name).
 * Prefer replacing with a `can_self_upload_roster` staff flag when product wants an admin toggle.
 */
export const SELF_PUNCH_ROSTER_NAME_KEYS = ["russell", "louie"] as const;

export function normalizeStaffNameKey(fullName: string | null | undefined): string {
  return (fullName ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** True when the staff display name’s first token is Russell or Louie. */
export function canSelfUploadPunchRoster(input: { fullName?: string | null }): boolean {
  const name = normalizeStaffNameKey(input.fullName);
  if (!name) return false;
  const first = name.split(" ")[0] ?? "";
  return (SELF_PUNCH_ROSTER_NAME_KEYS as readonly string[]).includes(first);
}

/**
 * Who may save punch-derived monthly rosters for roaming staff (Device logs).
 * Builds on shift-roster openers (supervisors, Sr. Site / Site / F&B Supervisor,
 * venue_supervisor, CEO/GM/HR/duty manager, HoO Operations peers, etc.), plus:
 * - F&B Manager (not on the general shift-roster open list alone)
 * - Operations managers/leads whose reporting manager is Head of Operations
 *   (also covered by canOpenShiftRoster when reportsToHeadOfOperations is set)
 */
export function canUploadPunchDerivedRoster(input: {
  roles?: readonly string[] | null;
  jobTitle?: string | null;
  staffRole?: string | null;
  department?: string | null;
  /** Direct report of a Head of Operations title on the ops chart. */
  reportsToHeadOfOperations?: boolean;
}): boolean {
  if (canOpenShiftRoster(input)) return true;
  if (isFnbManager(input.jobTitle, input.department)) return true;
  if (canOpenShiftRosterAsHoOPeer(input)) return true;
  return false;
}

export type PunchDayForRoster = {
  staffId: string | null | undefined;
  workDate: string;
  /** Check-in / anchor site (earliest punch-in location). */
  locationId: string;
  /** Check-out site when cross-site; same as locationId on single-site days. */
  checkOutLocationId?: string | null;
  punchInAt: string | null;
  punchOutAt: string | null;
};

export type ExistingRosterDay = {
  staffId: string;
  workDate: string;
  /** Present when loaded from DB — used to correct punch-derived locations. */
  id?: string;
  locationId?: string;
  source?: string | null;
};

export type RosterFromPunchRow = {
  staffId: string;
  workDate: string;
  /** Check-in / anchor site stored on attendance_roster_assignments.location_id. */
  locationId: string;
  /** Check-out site (may equal locationId). Used for attendance recalc scope. */
  checkOutLocationId: string;
  shiftStart: string;
  shiftEnd: string;
};

/** Existing device_punch row whose check-in location (or times) should be corrected. */
export type RosterFromPunchLocationFix = {
  id: string;
  staffId: string;
  workDate: string;
  locationId: string;
  checkOutLocationId: string;
  shiftStart: string;
  shiftEnd: string;
};

export type RosterFromPunchPlan = {
  rows: RosterFromPunchRow[];
  /** Punch-derived rows already saved with the wrong check-in site (safe to update). */
  locationFixes: RosterFromPunchLocationFix[];
  /** Complete in+out days that will be inserted. */
  savedEligible: number;
  /** Existing device_punch rows that will have location/times corrected. */
  correctedEligible: number;
  /** Punch-in without punch-out (staff may self-enter). */
  skippedIncomplete: number;
  /** Day already has a non-correctable roster assignment. */
  skippedExisting: number;
  /** Day with no mapped staff_id. */
  skippedUnmapped: number;
  /** Missing location or unreadable punch times. */
  skippedInvalid: number;
};

export type IncompletePunchRosterDay = {
  staffId: string;
  workDate: string;
  locationId: string;
  punchInAt: string;
  suggestedShiftStart: string | null;
};

/** Qatar-local HH:MM from an ISO punch timestamp. */
export function qatarHmFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Qatar",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (hour == null || minute == null) return null;
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function isCompletePunchPair(day: {
  punchInAt: string | null | undefined;
  punchOutAt: string | null | undefined;
}): boolean {
  return Boolean(day.punchInAt?.trim() && day.punchOutAt?.trim());
}

/** Punch-in present, punch-out missing — leave for staff self-entry. */
export function isIncompletePunchOut(day: {
  punchInAt: string | null | undefined;
  punchOutAt: string | null | undefined;
}): boolean {
  return Boolean(day.punchInAt?.trim() && !day.punchOutAt?.trim());
}

export function rosterFromPunchDates(dateFrom: string, dateTo: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error("Choose a from date and a to date.");
  }
  if (dateFrom > dateTo) throw new Error("The from date must be on or before the to date.");
  const fromMs = Date.parse(`${dateFrom}T00:00:00Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error("Choose a from date and a to date.");
  }
  const days = Math.floor((toMs - fromMs) / 86_400_000) + 1;
  if (days < 1 || days > ROSTER_FROM_PUNCH_MAX_DAYS) {
    throw new Error(`Choose a range of ${ROSTER_FROM_PUNCH_MAX_DAYS} days or fewer.`);
  }
}

/**
 * Create-only plan: complete punch pairs → roster rows at the check-in site.
 * Cross-site days keep check-in as location_id and record check-out for recalc.
 * Existing device_punch rows with the wrong check-in site are queued for correction.
 */
export function planRosterFromPunches(input: {
  days: readonly PunchDayForRoster[];
  existing: readonly ExistingRosterDay[];
}): RosterFromPunchPlan {
  const existingByKey = new Map(
    input.existing.map((row) => [`${row.staffId}|${row.workDate.slice(0, 10)}`, row] as const),
  );

  const rows: RosterFromPunchRow[] = [];
  const locationFixes: RosterFromPunchLocationFix[] = [];
  let skippedIncomplete = 0;
  let skippedExisting = 0;
  let skippedUnmapped = 0;
  let skippedInvalid = 0;

  // One row per staff+day (collapsed cross-site days already merge locations).
  const byStaffDay = new Map<string, PunchDayForRoster>();
  for (const day of input.days) {
    const staffId = day.staffId?.trim() || "";
    const workDate = day.workDate.slice(0, 10);
    if (!workDate) continue;
    const key = `${staffId}|${workDate}`;
    const current = byStaffDay.get(key);
    if (!current) {
      byStaffDay.set(key, day);
      continue;
    }
    // Prefer the row that still has a complete pair when duplicates appear.
    if (!isCompletePunchPair(current) && isCompletePunchPair(day)) {
      byStaffDay.set(key, day);
    }
  }

  for (const day of byStaffDay.values()) {
    const staffId = day.staffId?.trim() || "";
    const workDate = day.workDate.slice(0, 10);
    if (!staffId) {
      skippedUnmapped += 1;
      continue;
    }
    if (isIncompletePunchOut(day)) {
      skippedIncomplete += 1;
      continue;
    }
    if (!isCompletePunchPair(day)) {
      skippedInvalid += 1;
      continue;
    }
    const locationId = day.locationId?.trim() || "";
    const checkOutLocationId = day.checkOutLocationId?.trim() || locationId;
    const shiftStart = qatarHmFromIso(day.punchInAt);
    const shiftEnd = qatarHmFromIso(day.punchOutAt);
    if (!locationId || !shiftStart || !shiftEnd) {
      skippedInvalid += 1;
      continue;
    }

    const existing = existingByKey.get(`${staffId}|${workDate}`);
    if (existing) {
      const canCorrect =
        existing.source === ROSTER_FROM_PUNCH_SOURCE &&
        Boolean(existing.id?.trim()) &&
        (existing.locationId?.trim() || "") !== locationId;
      if (canCorrect) {
        locationFixes.push({
          id: existing.id!.trim(),
          staffId,
          workDate,
          locationId,
          checkOutLocationId,
          shiftStart,
          shiftEnd,
        });
        continue;
      }
      skippedExisting += 1;
      continue;
    }

    rows.push({ staffId, workDate, locationId, checkOutLocationId, shiftStart, shiftEnd });
  }

  rows.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.staffId.localeCompare(b.staffId) ||
      a.locationId.localeCompare(b.locationId),
  );
  locationFixes.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.staffId.localeCompare(b.staffId) ||
      a.locationId.localeCompare(b.locationId),
  );

  return {
    rows,
    locationFixes,
    savedEligible: rows.length,
    correctedEligible: locationFixes.length,
    skippedIncomplete,
    skippedExisting,
    skippedUnmapped,
    skippedInvalid,
  };
}

/** Incomplete punch-out days that still need a roster row (create-only). */
export function listIncompletePunchRosterDays(input: {
  days: readonly PunchDayForRoster[];
  existing: readonly ExistingRosterDay[];
}): IncompletePunchRosterDay[] {
  const existing = new Set(
    input.existing.map((row) => `${row.staffId}|${row.workDate.slice(0, 10)}`),
  );
  const out: IncompletePunchRosterDay[] = [];
  const seen = new Set<string>();

  for (const day of input.days) {
    const staffId = day.staffId?.trim() || "";
    const workDate = day.workDate.slice(0, 10);
    const locationId = day.locationId?.trim() || "";
    const punchInAt = day.punchInAt?.trim() || "";
    if (!staffId || !workDate || !locationId || !punchInAt) continue;
    if (!isIncompletePunchOut(day)) continue;
    const key = `${staffId}|${workDate}`;
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    out.push({
      staffId,
      workDate,
      locationId,
      punchInAt,
      suggestedShiftStart: qatarHmFromIso(punchInAt),
    });
  }

  out.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.staffId.localeCompare(b.staffId));
  return out;
}
