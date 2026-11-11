import type { Json } from "@/integrations/supabase/types";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import {
  monthBounds,
  payrollMonthOf,
  payrollMonthMatchingBounds,
} from "@/lib/attendance-hr/roster-period";
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

/** Minimum non-empty reason length after a location-month has been uploaded. */
export const ROSTER_CHANGE_REASON_MIN = 3;
export const ROSTER_CHANGE_REASON_MAX = 500;

export function normalizeRosterChangeReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? "").trim().replace(/\s+/g, " ");
  return trimmed || null;
}

export function assertRosterChangeReason(reason: string | null | undefined): string {
  const normalized = normalizeRosterChangeReason(reason);
  if (!normalized || normalized.length < ROSTER_CHANGE_REASON_MIN) {
    throw new Error(
      `A reason is required when changing a roster after it has been uploaded (at least ${ROSTER_CHANGE_REASON_MIN} characters).`,
    );
  }
  if (normalized.length > ROSTER_CHANGE_REASON_MAX) {
    throw new Error(`Reason must be at most ${ROSTER_CHANGE_REASON_MAX} characters.`);
  }
  return normalized;
}

export function rosterAuditChangeReason(after: Json | null, before: Json | null): string | null {
  const read = (payload: Json | null): string | null => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const value = (payload as Record<string, unknown>).changeReason;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return read(after) ?? read(before);
}

/**
 * Locations that already had a completed upload for the date window.
 * Uses upload-sourced assignments and daily_ops_roster_uploads (survives row deletes).
 */
export async function findLocationsWithCompletedRosterUpload(
  db: AuthContext["supabase"],
  dateFrom: string,
  dateTo: string,
  locationIds?: readonly string[] | null,
): Promise<Set<string>> {
  const result = new Set<string>();
  const scoped = locationIds?.filter(Boolean) ?? null;
  if (scoped && scoped.length === 0) return result;

  let assignQuery = db
    .from("attendance_roster_assignments")
    .select("location_id")
    .eq("source", "upload")
    .gte("work_date", dateFrom)
    .lte("work_date", dateTo)
    .limit(5000);
  if (scoped?.length) assignQuery = assignQuery.in("location_id", [...scoped]);
  const { data: assignRows, error: assignErr } = await assignQuery;
  if (assignErr) throw assignErr;
  for (const row of assignRows ?? []) {
    if (row.location_id) result.add(String(row.location_id));
  }

  let uploadQuery = db
    .from("daily_ops_roster_uploads")
    .select("location_id")
    .lte("period_start", dateTo)
    .gte("period_end", dateFrom)
    .limit(2000);
  if (scoped?.length) uploadQuery = uploadQuery.in("location_id", [...scoped]);
  const { data: uploadRows, error: uploadErr } = await uploadQuery;
  if (uploadErr && !/daily_ops_roster_uploads|schema cache/i.test(uploadErr.message)) throw uploadErr;
  for (const row of uploadRows ?? []) {
    if (row.location_id) result.add(String(row.location_id));
  }

  return result;
}

/** True when this location's FEC month already had a completed roster upload. */
export async function locationMonthHasCompletedRosterUpload(
  db: AuthContext["supabase"],
  locationId: string,
  workDate: string,
): Promise<boolean> {
  const month = payrollMonthOf(workDate.slice(0, 10));
  const { dateFrom, dateTo } = monthBounds(month);
  const uploaded = await findLocationsWithCompletedRosterUpload(db, dateFrom, dateTo, [locationId]);
  return uploaded.has(locationId);
}

export async function resolveRosterPostUploadChangeReason(
  db: AuthContext["supabase"],
  locationId: string,
  workDate: string,
  changeReason: string | null | undefined,
): Promise<string | null> {
  const required = await locationMonthHasCompletedRosterUpload(db, locationId, workDate);
  if (required) return assertRosterChangeReason(changeReason);
  return normalizeRosterChangeReason(changeReason);
}

export async function resolveRosterPostUploadChangeReasonForLocations(
  db: AuthContext["supabase"],
  locationIds: readonly string[],
  dateFrom: string,
  dateTo: string,
  changeReason: string | null | undefined,
): Promise<string | null> {
  const unique = [...new Set(locationIds.filter(Boolean))];
  if (!unique.length) return normalizeRosterChangeReason(changeReason);
  const uploaded = await findLocationsWithCompletedRosterUpload(db, dateFrom, dateTo, unique);
  const required = unique.some((id) => uploaded.has(id));
  if (required) return assertRosterChangeReason(changeReason);
  return normalizeRosterChangeReason(changeReason);
}

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
    /** Why the roster changed after the first completed upload for the location-month. */
    changeReason?: string | null;
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
  const changeReason = normalizeRosterChangeReason(input.changeReason);

  const afterPayload = {
    ...(input.after ?? {}),
    ...(payrollMonth ? { payrollMonth } : {}),
    ...(changeReason ? { changeReason } : {}),
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
