import "server-only";

import type { AuthContext } from "@/lib/server/auth";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";

import { rematchPreviewShiftTemplates } from "./roster-amend";
import { assertAttendanceRosterLocation, replaceAttendanceRosterPeriod } from "./roster-apply";
import {
  buildAttendanceRosterPreview,
  groupMatchedRosterRowsByLocation,
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
  const [{ data: staffRows, error: staffErr }, { data: locationRows, error: locErr }, { data: shiftRows }, { data: mapRows, error: mapErr }] =
    await Promise.all([
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code, qid, location_id, status")
        .is("deleted_at", null)
        .limit(5000),
      context.supabase.from("locations").select("id, code, name, region, status").in("code", [...CANONICAL_LOCATION_CODES]),
      context.supabase.from("attendance_shift_templates").select("id, location_id, start_time, end_time").eq("active", true),
      context.supabase
        .from("attendance_biometric_users")
        .select("location_id, device_name, staff_id")
        .not("staff_id", "is", null)
        .not("device_name", "is", null)
        .limit(5000),
    ]);
  if (staffErr) throw staffErr;
  if (locErr) throw locErr;
  if (mapErr) throw mapErr;

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
    status: row.status,
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
  const nameMaps = (mapRows ?? [])
    .filter((row) => row.location_id && row.device_name && row.staff_id)
    .map((row) => ({
      locationId: String(row.location_id),
      deviceName: String(row.device_name),
      staffId: String(row.staff_id),
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
    nameMaps,
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
    const first = input.preview.errors[0];
    throw new Error(
      typeof first === "string" && first.trim()
        ? first
        : "No matched roster rows to save.",
    );
  }

  // Re-resolve templates after preview edits (times / week-off) so saved rows match what the user confirmed.
  const preview = await rematchPreviewShiftTemplates(context, input.preview);
  const byLocation = groupMatchedRosterRowsByLocation(preview);
  if (!byLocation.size) {
    throw new Error(
      "Matched rows are missing a site. Use single-location mode and pick a site, or add a LOCATION column (e.g. UA-DM).",
    );
  }

  const results = [];
  for (const [locId, rows] of byLocation) {
    await assertAttendanceRosterLocation(context, locId);
    results.push(
      await replaceAttendanceRosterPeriod(context, {
        locationId: locId,
        dateFrom: preview.dateFrom,
        dateTo: preview.dateTo,
        fileName: input.fileName,
        fileType: input.fileType,
        rows,
      }),
    );
  }

  const imported = results.reduce((n, r) => n + r.imported, 0);
  return {
    imported,
    processed: results.reduce((n, r) => n + r.processed, 0),
    dateFrom: preview.dateFrom,
    dateTo: preview.dateTo,
    matched: preview.matched,
    unmatched: preview.unmatched,
    skipped: preview.skipped,
    notSaved: Math.max(0, preview.rows.length - imported),
  };
}
