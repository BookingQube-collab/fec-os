import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import {
  matchShiftTemplate,
  parseTimeCell,
  type AttendanceRosterPreview,
  type AttendanceRosterShift,
  type MatchedRosterRow,
} from "./roster-upload";

function hm(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseTimeCell(value) ?? String(value).slice(0, 5);
  return /^\d{2}:\d{2}$/.test(parsed) ? parsed : null;
}

function isOvernight(start: string, end: string): boolean {
  return start > end;
}

async function activeCompanyId(supabase: AuthContext["supabase"]): Promise<string> {
  const { data, error } = await supabase.from("hr_companies").select("id").eq("active", true).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("No active HR company is configured for shift templates.");
  return data.id as string;
}

export async function loadActiveShiftTemplates(supabase: AuthContext["supabase"]): Promise<AttendanceRosterShift[]> {
  const { data, error } = await supabase
    .from("attendance_shift_templates")
    .select("id, location_id, start_time, end_time")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    location_id: (row.location_id as string | null) ?? null,
    start_time: String(row.start_time ?? ""),
    end_time: String(row.end_time ?? ""),
  }));
}

/** Find an existing template or create a location-scoped custom one for these times. */
export async function resolveOrCreateShiftTemplate(
  supabase: AuthContext["supabase"],
  input: {
    locationId: string | null;
    shiftStart: string | null;
    shiftEnd: string | null;
    shifts: AttendanceRosterShift[];
  },
): Promise<{ shiftTemplateId: string | null; shifts: AttendanceRosterShift[] }> {
  const start = hm(input.shiftStart);
  const end = hm(input.shiftEnd);
  if (!start || !end) return { shiftTemplateId: null, shifts: input.shifts };

  const matched = matchShiftTemplate(start, end, input.locationId, input.shifts);
  if (matched) return { shiftTemplateId: matched, shifts: input.shifts };

  const companyId = await activeCompanyId(supabase);
  const name = `${start}–${end}`;
  const { data, error } = await supabase
    .from("attendance_shift_templates")
    .insert({
      company_id: companyId,
      location_id: input.locationId,
      name,
      start_time: start,
      end_time: end,
      overnight: isOvernight(start, end),
      active: true,
    })
    .select("id, location_id, start_time, end_time")
    .single();
  if (error) throw error;

  const created: AttendanceRosterShift = {
    id: String(data.id),
    location_id: (data.location_id as string | null) ?? null,
    start_time: String(data.start_time ?? start),
    end_time: String(data.end_time ?? end),
  };
  return { shiftTemplateId: created.id, shifts: [...input.shifts, created] };
}

export async function rematchPreviewShiftTemplates(
  context: AuthContext,
  preview: AttendanceRosterPreview,
): Promise<AttendanceRosterPreview> {
  let shifts = await loadActiveShiftTemplates(context.supabase);
  const rows: MatchedRosterRow[] = [];
  for (const row of preview.rows) {
    if (row.status !== "matched" || row.isWeekOff) {
      rows.push({ ...row, shiftTemplateId: null, shiftStart: row.isWeekOff ? null : row.shiftStart, shiftEnd: row.isWeekOff ? null : row.shiftEnd });
      continue;
    }
    const resolved = await resolveOrCreateShiftTemplate(context.supabase, {
      locationId: row.locationId,
      shiftStart: row.shiftStart,
      shiftEnd: row.shiftEnd,
      shifts,
    });
    shifts = resolved.shifts;
    rows.push({ ...row, shiftTemplateId: resolved.shiftTemplateId });
  }
  return { ...preview, rows };
}
