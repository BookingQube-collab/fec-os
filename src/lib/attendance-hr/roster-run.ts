import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
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

export type TeamRosterUploadScope = { staffIds: string[]; locationIds: string[] };

export async function previewLiveShiftRoster(
  context: AuthContext,
  input: {
    records: Record<string, string>[];
    periodMode: AttendanceRosterPeriodMode;
    dateFrom: string;
    dateTo: string;
    selectedLocationId: string | null;
  },
  team?: TeamRosterUploadScope,
): Promise<AttendanceRosterPreview> {
  const db = team ? supabaseAdmin : context.supabase;
  let staffQuery = db
    .from("staff")
    .select("id, full_name, employee_code, qid, location_id, status")
    .is("deleted_at", null);
  staffQuery = team ? staffQuery.in("id", team.staffIds) : staffQuery.limit(5000);
  let locationQuery = db.from("locations").select("id, code, name, region, status").eq("status", "active");
  locationQuery = team
    ? locationQuery.in("id", team.locationIds.length ? team.locationIds : ["00000000-0000-0000-0000-000000000000"])
    : locationQuery.in("code", [...CANONICAL_LOCATION_CODES]);
  let shiftQuery = db.from("attendance_shift_templates").select("id, location_id, start_time, end_time").eq("active", true);
  if (team && team.locationIds.length) shiftQuery = shiftQuery.or(`location_id.is.null,location_id.in.(${team.locationIds.join(",")})`);
  let mapQuery = db
    .from("attendance_biometric_users")
    .select("location_id, device_name, staff_id")
    .not("staff_id", "is", null)
    .not("device_name", "is", null)
    .limit(5000);
  if (team) mapQuery = team.locationIds.length ? mapQuery.in("location_id", team.locationIds) : mapQuery.limit(0);

  const [{ data: staffRows, error: staffErr }, { data: locationRows, error: locErr }, { data: shiftRows }, { data: mapRows, error: mapErr }] =
    await Promise.all([
      staffQuery,
      locationQuery,
      shiftQuery,
      mapQuery,
    ]);
  if (staffErr) throw staffErr;
  if (locErr) throw locErr;
  if (mapErr) throw mapErr;

  const workByStaff = await fetchWorkLocationsByStaffId(
    db,
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
  team?: TeamRosterUploadScope,
) {
  if (!input.preview.matched) {
    const first = input.preview.errors[0];
    throw new Error(
      typeof first === "string" && first.trim()
        ? first
        : "No matched roster rows to save.",
    );
  }

  const allowStaff = team ? new Set(team.staffIds) : null;
  const allowLocations = team ? new Set(team.locationIds) : null;
  const sourcePreview = team
    ? {
        ...input.preview,
        rows: input.preview.rows.filter(
          (row) =>
            row.status !== "matched" ||
            (Boolean(row.staffId && allowStaff?.has(row.staffId)) &&
              Boolean(row.locationId && allowLocations?.has(row.locationId))),
        ),
      }
    : input.preview;
  if (team && !sourcePreview.rows.some((row) => row.status === "matched")) {
    throw new Error("No matched roster rows for people who report to you.");
  }
  // Re-resolve templates after preview edits (times / week-off) so saved rows match what the user confirmed.
  const preview = await rematchPreviewShiftTemplates(
    team ? { ...context, supabase: supabaseAdmin } : context,
    sourcePreview,
  );
  const byLocation = groupMatchedRosterRowsByLocation(preview);
  if (!byLocation.size) {
    throw new Error(
      "Matched rows are missing a site. Use single-location mode and pick a site, or add a LOCATION column (e.g. UA-DM).",
    );
  }

  const results = [];
  for (const [locId, rows] of byLocation) {
    if (allowLocations && !allowLocations.has(locId)) continue;
    const scopedRows = allowStaff ? rows.filter((row) => row.staffId && allowStaff.has(row.staffId)) : rows;
    if (!scopedRows.length) continue;
    if (!team) await assertAttendanceRosterLocation(context, locId);
    results.push(
      await replaceAttendanceRosterPeriod(
        context,
        {
          locationId: locId,
          dateFrom: preview.dateFrom,
          dateTo: preview.dateTo,
          fileName: input.fileName,
          fileType: input.fileType,
          rows: scopedRows,
        },
        team ? supabaseAdmin : context.supabase,
        team ? { trustedLocation: true } : undefined,
      ),
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
