import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError, assertLocationAccess } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { recalculateAttendanceRange } from "./process";
import { enumerateYmd } from "./dashboard";
import {
  ATTENDANCE_TALLY_UPLOAD_NOTE,
  assignmentsFromPreview,
  canUploadAttendanceRoster,
  type MatchedRosterRow,
} from "./roster-upload";

export function assertCanUploadAttendanceRoster(context: AuthContext) {
  if (!canUploadAttendanceRoster(context.roles ?? [])) {
    throw new ForbiddenError("Forbidden: missing capability to upload a shift roster.");
  }
}

export async function assertAttendanceRosterLocation(context: AuthContext, locationId: string) {
  if (canUserDo(context.roles ?? [], "attendance.view_all") || canUserDo(context.roles ?? [], "daily_ops.view_all")) {
    return;
  }
  await assertLocationAccess(context, locationId);
}

async function cleanupStaleAbsents(
  supabase: AuthContext["supabase"],
  locationId: string,
  dateFrom: string,
  dateTo: string,
  rows: MatchedRosterRow[],
) {
  const byDate = new Map<string, string[]>();
  for (const row of rows) {
    if (row.status !== "matched" || !row.staffId || row.locationId !== locationId) continue;
    const list = byDate.get(row.workDate) ?? [];
    list.push(row.staffId);
    byDate.set(row.workDate, list);
  }
  for (const workDate of enumerateYmd(dateFrom, dateTo)) {
    const keep = new Set(byDate.get(workDate) ?? []);
    let q = supabase
      .from("attendance_daily_summary")
      .delete()
      .eq("location_id", locationId)
      .eq("work_date", workDate)
      .eq("punch_count", 0)
      .not("staff_id", "is", null);
    if (keep.size) {
      q = q.not("staff_id", "in", `(${[...keep].join(",")})`);
    }
    const { error } = await q;
    if (error) throw error;
  }
}

export async function replaceAttendanceRosterPeriod(
  context: AuthContext,
  input: {
    locationId: string;
    dateFrom: string;
    dateTo: string;
    fileName: string;
    fileType: string;
    rows: MatchedRosterRow[];
  },
) {
  await assertAttendanceRosterLocation(context, input.locationId);
  const { error: delErr } = await context.supabase
    .from("attendance_roster_assignments")
    .delete()
    .eq("location_id", input.locationId)
    .gte("work_date", input.dateFrom)
    .lte("work_date", input.dateTo);
  if (delErr) throw delErr;

  const unique = [...assignmentsFromPreview(input.rows).values()].filter((row) => row.locationId === input.locationId);
  const payload = unique.map((row) => ({
    location_id: input.locationId,
    staff_id: row.staffId,
    work_date: row.workDate,
    shift_template_id: row.shiftTemplateId,
    is_week_off: row.isWeekOff,
    source: "upload",
    created_by: context.userId,
  }));

  for (let i = 0; i < payload.length; i += 400) {
    const chunk = payload.slice(i, i + 400);
    const { error } = await context.supabase
      .from("attendance_roster_assignments")
      .upsert(chunk, { onConflict: "staff_id,work_date" });
    if (error) throw error;
  }

  const { data: uploadRow, error: upErr } = await context.supabase
    .from("daily_ops_roster_uploads")
    .insert({
      location_id: input.locationId,
      file_name: input.fileName,
      file_type: input.fileType,
      period_start: input.dateFrom,
      period_end: input.dateTo,
      rows_imported: payload.length,
      uploaded_by: context.userId,
      notes: ATTENDANCE_TALLY_UPLOAD_NOTE,
    })
    .select("id")
    .single();
  if (upErr) throw upErr;

  const recalc = await recalculateAttendanceRange(context.supabase, input.locationId, input.dateFrom, input.dateTo);
  await cleanupStaleAbsents(context.supabase, input.locationId, input.dateFrom, input.dateTo, unique);
  return { imported: payload.length, uploadId: uploadRow.id as string, processed: recalc.processed };
}
