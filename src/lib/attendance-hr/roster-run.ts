import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";

import { assertAttendanceRosterLocation, replaceAttendanceRosterPeriod } from "./roster-apply";
import {
  buildAttendanceRosterPreview,
  type AttendanceRosterPeriodMode,
  type AttendanceRosterPreview,
  type AttendanceRosterShift,
  type AttendanceRosterStaff,
} from "./roster-upload";

export async function previewLiveShiftRoster(
  context: AuthContext,
  input: {
    records: Record<string, string>[];
    periodMode: AttendanceRosterPeriodMode;
    dateFrom: string;
    dateTo: string;
    selectedLocationId: string | null;
  },
): Promise<AttendanceRosterPreview> {
  const [{ data: staffRows, error: staffErr }, { data: locationRows, error: locErr }, { data: shiftRows }] = await Promise.all([
    context.supabase
      .from("staff")
      .select("id, full_name, employee_code, qid, location_id, status")
      .is("deleted_at", null)
      .limit(5000),
    context.supabase.from("locations").select("id, code, name, region, status").in("code", [...CANONICAL_LOCATION_CODES]),
    context.supabase.from("attendance_shift_templates").select("id, location_id, start_time, end_time").eq("active", true),
  ]);
  if (staffErr) throw staffErr;
  if (locErr) throw locErr;

  const workByStaff = await fetchWorkLocationsByStaffId(
    context.supabase,
    (staffRows ?? []).map((row) => row.id),
  );
  const staff: AttendanceRosterStaff[] = (staffRows ?? []).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    employee_code: row.employee_code,
    qid: row.qid,
    location_id: row.location_id,
    work_location_ids: (workByStaff.get(row.id) ?? []).map((loc) => loc.id),
  }));
  const locations = (locationRows ?? []).map((loc) => ({
    id: loc.id,
    code: loc.code,
    name: loc.name,
    region: loc.region ?? null,
  }));
  const shifts: AttendanceRosterShift[] = (shiftRows ?? []).map((s) => ({
    id: String(s.id),
    location_id: (s.location_id as string | null) ?? null,
    start_time: String(s.start_time ?? ""),
    end_time: String(s.end_time ?? ""),
  }));

  return buildAttendanceRosterPreview({
    records: input.records,
    periodMode: input.periodMode,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    selectedLocationId: input.selectedLocationId,
    staff,
    locations,
    shifts,
  });
}

export async function commitLiveShiftRoster(
  context: AuthContext,
  input: {
    preview: AttendanceRosterPreview;
    fileName: string;
    fileType: string;
  },
) {
  if (!input.preview.matched) {
    throw new Error(input.preview.errors[0] ?? "No matched roster rows to save.");
  }

  const byLocation = new Map<string, typeof input.preview.rows>();
  for (const row of input.preview.rows) {
    if (row.status !== "matched" || !row.locationId) continue;
    const list = byLocation.get(row.locationId) ?? [];
    list.push(row);
    byLocation.set(row.locationId, list);
  }

  const results = [];
  for (const [locId, rows] of byLocation) {
    await assertAttendanceRosterLocation(context, locId);
    results.push(
      await replaceAttendanceRosterPeriod(context, {
        locationId: locId,
        dateFrom: input.preview.dateFrom,
        dateTo: input.preview.dateTo,
        fileName: input.fileName,
        fileType: input.fileType,
        rows,
      }),
    );
  }

  return {
    imported: results.reduce((n, r) => n + r.imported, 0),
    processed: results.reduce((n, r) => n + r.processed, 0),
    dateFrom: input.preview.dateFrom,
    dateTo: input.preview.dateTo,
  };
}
