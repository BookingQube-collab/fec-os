/**
 * Aggregations for People → Event Shifts (Shift Coverage).
 * Uses real schedule slots + attendance — no invented metrics.
 */

import type {
  EventScheduleAttendanceRow,
  EventScheduleSlotRow,
} from "@/lib/events/types";

export type ShiftGroupRow = {
  key: string;
  workDate: string;
  roleLabel: string;
  roleKey: string;
  scheduledIn: string;
  scheduledOut: string;
  isLabour: boolean;
  slots: EventScheduleSlotRow[];
  crewCount: number;
  /** True when every assigned person has an attendance day row. */
  covered: boolean;
};

export type ShiftKpis = {
  totalShifts: number;
  scheduledCrew: number;
  coveredShifts: number;
  uncoveredShifts: number;
  coveredPct: number;
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function shiftAttendanceKey(staffId: string, workDate: string): string {
  return `${staffId}|${workDate}`;
}

/** Group person-slots into date + role + time windows for the coverage table. */
export function groupScheduleShifts(
  slots: EventScheduleSlotRow[],
  attendance: EventScheduleAttendanceRow[],
  options?: {
    roleLabelOf?: (slot: EventScheduleSlotRow) => string;
    roleKeyOf?: (slot: EventScheduleSlotRow) => string;
    isLabourOf?: (slot: EventScheduleSlotRow) => boolean;
  },
): ShiftGroupRow[] {
  const attKeys = new Set(
    attendance.map((a) => shiftAttendanceKey(a.staff_id, a.work_date)),
  );
  const buckets = new Map<string, ShiftGroupRow>();

  for (const slot of slots) {
    const roleLabel =
      options?.roleLabelOf?.(slot) ??
      (slot.role_label?.trim() || "Crew");
    const roleKey = options?.roleKeyOf?.(slot) ?? roleLabel.toLowerCase();
    const isLabour = options?.isLabourOf?.(slot) ?? false;
    const scheduledIn = isLabour ? "" : slot.scheduled_in;
    const scheduledOut = isLabour ? "" : slot.scheduled_out;
    const key = `${slot.work_date}|${roleKey}|${scheduledIn}|${scheduledOut}|${isLabour ? "labour" : "shift"}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.slots.push(slot);
      existing.crewCount += 1;
    } else {
      buckets.set(key, {
        key,
        workDate: slot.work_date,
        roleLabel,
        roleKey,
        scheduledIn: scheduledIn || slot.scheduled_in,
        scheduledOut: scheduledOut || slot.scheduled_out,
        isLabour,
        slots: [slot],
        crewCount: 1,
        covered: false,
      });
    }
  }

  const rows = [...buckets.values()].map((row) => {
    const covered =
      row.crewCount > 0 &&
      row.slots.every((s) => attKeys.has(shiftAttendanceKey(s.staff_id, s.work_date)));
    return { ...row, covered };
  });

  rows.sort((a, b) => {
    if (a.workDate !== b.workDate) return a.workDate.localeCompare(b.workDate);
    if (a.roleLabel !== b.roleLabel) return a.roleLabel.localeCompare(b.roleLabel);
    return a.scheduledIn.localeCompare(b.scheduledIn);
  });

  return rows;
}

export function buildShiftKpis(
  slots: EventScheduleSlotRow[],
  attendance: EventScheduleAttendanceRow[],
  groups?: ShiftGroupRow[],
): ShiftKpis {
  const rows =
    groups ??
    groupScheduleShifts(slots, attendance);
  const totalShifts = rows.length;
  const coveredShifts = rows.filter((r) => r.covered).length;
  const uncoveredShifts = Math.max(0, totalShifts - coveredShifts);
  const scheduledCrew = new Set(slots.map((s) => s.staff_id)).size;

  return {
    totalShifts,
    scheduledCrew,
    coveredShifts,
    uncoveredShifts,
    coveredPct: pct(coveredShifts, totalShifts),
  };
}

export function formatShiftTimeRange(from: string, to: string): string {
  const a = (from ?? "").slice(0, 5);
  const b = (to ?? "").slice(0, 5);
  if (!a && !b) return "—";
  if (!a) return b;
  if (!b) return a;
  return `${a} – ${b}`;
}

export function formatShiftDate(ymd: string, locale = "en"): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return ymd;
  }
}

export function roleBadgeTone(
  roleKey: string,
): "crew" | "cleaner" | "management" | "labour" | "neutral" {
  const v = roleKey.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v.includes("clean")) return "cleaner";
  if (v.includes("manage") || v.includes("head_office") || v === "ho") return "management";
  if (v.includes("labour") || v.includes("labor") || v.includes("maint")) return "labour";
  if (v.includes("crew") || v.includes("attendant")) return "crew";
  return "neutral";
}
