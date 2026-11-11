import type { Json } from "@/integrations/supabase/types";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { payrollMonthOf, payrollMonthMatchingBounds } from "@/lib/attendance-hr/roster-period";
import { canUserDo, type AppRole } from "@/lib/rbac";
import type { AuthContext } from "@/lib/server/auth";

export const ROSTER_AUDIT_ACTIONS = [
  "roster.upload",
  "roster.create",
  "roster.update",
  "roster.delete",
  "roster.bulk_delete",
  "roster.pattern_apply",
  "roster.copy_to_next_month",
  "attendance.roster_from_punches",
] as const;

export type RosterAuditAction = (typeof ROSTER_AUDIT_ACTIONS)[number];

export type RosterAuditAssignmentSnap = {
  locationId: string;
  staffId: string;
  workDate: string;
  isWeekOff: boolean;
  shiftStart: string | null;
  shiftEnd: string | null;
  source: string | null;
  dayStatus?: string | null;
};

export type RosterHistoryChangeKind = "first_plan" | "amendment" | "reupload";

export function canViewMonthlyRosterHistory(roles: readonly string[], jobTitle?: string | null): boolean {
  if (isHeadOfOperationsTitle(jobTitle)) return true;
  return canUserDo(roles as AppRole[], "people.roster_history");
}

export function rosterAuditPayrollMonth(after: Json | null, before: Json | null, workDateFallback?: string): string | null {
  const read = (payload: Json | null): string | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const obj = payload as Record<string, unknown>;
    if (typeof obj.payrollMonth === "string") return obj.payrollMonth.slice(0, 7);
    if (typeof obj.targetMonth === "string") return obj.targetMonth.slice(0, 7);
    if (typeof obj.sourceMonth === "string") return obj.sourceMonth.slice(0, 7);
    if (typeof obj.dateTo === "string" && typeof obj.dateFrom === "string") {
      return payrollMonthMatchingBounds(String(obj.dateFrom).slice(0, 10), String(obj.dateTo).slice(0, 10));
    }
    if (typeof obj.workDate === "string") return payrollMonthOf(String(obj.workDate).slice(0, 10));
    return null;
  };
  return read(after) ?? read(before) ?? (workDateFallback ? payrollMonthOf(workDateFallback) : null);
}

export function rosterAuditLocationId(after: Json | null, before: Json | null): string | null {
  const read = (payload: Json | null): string | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const obj = payload as Record<string, unknown>;
    if (typeof obj.locationId === "string") return obj.locationId;
    return null;
  };
  return read(after) ?? read(before);
}

export function summarizeRosterAuditChange(
  action: string,
  before: Json | null,
  after: Json | null,
): string {
  const afterObj = (after && typeof after === "object" && !Array.isArray(after) ? after : {}) as Record<string, unknown>;
  const beforeObj = (before && typeof before === "object" && !Array.isArray(before) ? before : {}) as Record<string, unknown>;

  if (action === "roster.upload") {
    const imported = afterObj.imported ?? afterObj.rowCount;
    const file = afterObj.fileName ? ` · ${String(afterObj.fileName)}` : "";
    return `Uploaded ${imported ?? "—"} roster rows${file}`;
  }
  if (action === "roster.bulk_delete") {
    return `Deleted ${afterObj.deleted ?? "—"} roster rows`;
  }
  if (action === "roster.pattern_apply") {
    return `Pattern apply: ${afterObj.created ?? 0} added, ${afterObj.updated ?? 0} updated`;
  }
  if (action === "roster.copy_to_next_month") {
    return `Copied ${afterObj.copied ?? "—"} rows to ${String(afterObj.targetMonth ?? "next month")}`;
  }
  if (action === "attendance.roster_from_punches") {
    return `Built roster from punches: ${afterObj.inserted ?? 0} inserted, ${afterObj.corrected ?? 0} corrected`;
  }
  if (action === "roster.create") {
    return describeAssignmentSnap(afterObj, "Added");
  }
  if (action === "roster.delete") {
    return describeAssignmentSnap(beforeObj, "Removed");
  }
  if (action === "roster.update") {
    return describeAssignmentChange(beforeObj, afterObj);
  }
  return action;
}

function describeAssignmentSnap(obj: Record<string, unknown>, verb: string): string {
  const workDate = obj.workDate ? String(obj.workDate).slice(0, 10) : "—";
  const status = obj.dayStatus ? String(obj.dayStatus) : obj.isWeekOff ? "weekly_off" : "on_duty";
  const times =
    status === "on_duty" && obj.shiftStart && obj.shiftEnd
      ? ` (${String(obj.shiftStart).slice(0, 5)}–${String(obj.shiftEnd).slice(0, 5)})`
      : "";
  return `${verb} ${status.replace(/_/g, " ")} on ${workDate}${times}`;
}

function describeAssignmentChange(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const workDate = String(after.workDate ?? before.workDate ?? "—").slice(0, 10);
  const parts: string[] = [];
  const beforeLoc = before.locationId ? String(before.locationId) : null;
  const afterLoc = after.locationId ? String(after.locationId) : null;
  if (beforeLoc && afterLoc && beforeLoc !== afterLoc) parts.push("location changed");

  const beforeStatus = before.dayStatus
    ? String(before.dayStatus)
    : before.isWeekOff
      ? "weekly_off"
      : "on_duty";
  const afterStatus = after.dayStatus
    ? String(after.dayStatus)
    : after.isWeekOff
      ? "weekly_off"
      : "on_duty";
  if (beforeStatus !== afterStatus) parts.push(`${beforeStatus.replace(/_/g, " ")} → ${afterStatus.replace(/_/g, " ")}`);

  const bs = before.shiftStart ? String(before.shiftStart).slice(0, 5) : null;
  const be = before.shiftEnd ? String(before.shiftEnd).slice(0, 5) : null;
  const as = after.shiftStart ? String(after.shiftStart).slice(0, 5) : null;
  const ae = after.shiftEnd ? String(after.shiftEnd).slice(0, 5) : null;
  if (bs !== as || be !== ae) {
    const from = bs && be ? `${bs}–${be}` : "—";
    const to = as && ae ? `${as}–${ae}` : "—";
    parts.push(`shift ${from} → ${to}`);
  }

  if (!parts.length) parts.push("row updated");
  return `${workDate}: ${parts.join("; ")}`;
}

export function classifyRosterHistoryChangeKinds<
  T extends { id: string; action: string; locationId: string | null; payrollMonth: string | null; createdAt: string },
>(rows: T[]): Map<string, RosterHistoryChangeKind> {
  const earliestUpload = new Map<string, { id: string; createdAt: string }>();
  for (const row of rows) {
    if (row.action !== "roster.upload" || !row.locationId || !row.payrollMonth) continue;
    const key = `${row.locationId}|${row.payrollMonth}`;
    const prev = earliestUpload.get(key);
    if (!prev || row.createdAt < prev.createdAt) {
      earliestUpload.set(key, { id: row.id, createdAt: row.createdAt });
    }
  }

  const kinds = new Map<string, RosterHistoryChangeKind>();
  for (const row of rows) {
    if (row.action === "roster.upload" && row.locationId && row.payrollMonth) {
      const key = `${row.locationId}|${row.payrollMonth}`;
      kinds.set(row.id, earliestUpload.get(key)?.id === row.id ? "first_plan" : "reupload");
    } else {
      kinds.set(row.id, "amendment");
    }
  }
  return kinds;
}

export async function insertRosterAuditEvent(
  db: AuthContext["supabase"],
  input: {
    actorId: string;
    action: RosterAuditAction | string;
    locationId: string | null;
    entityId?: string | null;
    before?: RosterAuditAssignmentSnap | Record<string, unknown> | null;
    after?: RosterAuditAssignmentSnap | Record<string, unknown> | null;
  },
): Promise<void> {
  const workDate =
    (input.after && "workDate" in input.after ? String(input.after.workDate).slice(0, 10) : null) ??
    (input.before && "workDate" in input.before ? String(input.before.workDate).slice(0, 10) : null);
  const payrollMonth = rosterAuditPayrollMonth(
    (input.after ?? null) as Json,
    (input.before ?? null) as Json,
    workDate ?? undefined,
  );

  const afterPayload = {
    ...(input.after ?? {}),
    ...(payrollMonth ? { payrollMonth } : {}),
  };
  const { error } = await db.from("attendance_audit_events").insert({
    actor_id: input.actorId,
    action: input.action,
    entity_type: "attendance_roster_assignments",
    entity_id: input.entityId ?? null,
    location_id: input.locationId,
    before: input.before ?? null,
    after: afterPayload,
  });
  if (error) console.warn("[roster-audit] insert failed", error.message);
}

export function snapFromRosterRow(row: {
  location_id?: string;
  locationId?: string;
  staff_id?: string;
  staffId?: string;
  work_date?: string;
  workDate?: string;
  is_week_off?: boolean;
  isWeekOff?: boolean;
  shift_start?: string | null;
  shiftStart?: string | null;
  shift_end?: string | null;
  shiftEnd?: string | null;
  source?: string | null;
  dayStatus?: string | null;
}): RosterAuditAssignmentSnap {
  const isWeekOff = Boolean(row.is_week_off ?? row.isWeekOff);
  return {
    locationId: String(row.location_id ?? row.locationId ?? ""),
    staffId: String(row.staff_id ?? row.staffId ?? ""),
    workDate: String(row.work_date ?? row.workDate ?? "").slice(0, 10),
    isWeekOff,
    shiftStart: row.shift_start ?? row.shiftStart ? String(row.shift_start ?? row.shiftStart).slice(0, 5) : null,
    shiftEnd: row.shift_end ?? row.shiftEnd ? String(row.shift_end ?? row.shiftEnd).slice(0, 5) : null,
    source: row.source != null ? String(row.source) : null,
    dayStatus: row.dayStatus ?? (isWeekOff ? "weekly_off" : "on_duty"),
  };
}
