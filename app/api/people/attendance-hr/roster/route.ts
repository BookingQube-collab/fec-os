import { withAuthRouteRequest } from "@/lib/server/api-route";
import { listAttendanceRosterUploads } from "@/lib/attendance-hr.functions";
import {
  assertAttendanceRosterLocation,
  assertCanUploadAttendanceRoster,
  replaceAttendanceRosterPeriod,
} from "@/lib/attendance-hr/roster-apply";
import {
  attendanceRosterPeriod,
  buildAttendanceRosterPreview,
  guardAttendanceRosterUpload,
  parseAttendanceRosterFile,
  type AttendanceRosterPeriodMode,
  type AttendanceRosterShift,
  type AttendanceRosterStaff,
} from "@/lib/attendance-hr/roster-upload";
import { buildAttendanceRosterSampleCsv, enumerateRosterSampleDates, rosterSampleFilename } from "@/lib/attendance-hr/roster-sample";
import { fetchWorkLocationsByStaffId } from "@/lib/staff-work-locations";
import { loadLiveStaffForSample, resolveSampleScope } from "@/lib/staff-sample-load";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";
import { CANONICAL_LOCATION_CODES } from "@/lib/locations/normalize";

export const runtime = "nodejs";
export const maxDuration = 60;

function asUploadFile(value: FormDataEntryValue): File | null {
  if (typeof value !== "object" || value == null) return null;
  const maybe = value as File;
  if (typeof maybe.arrayBuffer !== "function") return null;
  if (typeof maybe.name !== "string" || !maybe.name) return null;
  return maybe;
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const url = new URL(req.url);
      if (url.searchParams.get("download") === "sample") {
        const periodMode = url.searchParams.get("periodMode") === "month" ? "month" : "week";
        const period = attendanceRosterPeriod({
          mode: periodMode,
          weekStart: url.searchParams.get("weekStart"),
          dateFrom: url.searchParams.get("dateFrom"),
          dateTo: url.searchParams.get("dateTo"),
          month: url.searchParams.get("month"),
        });
        const { staff, locations } = await loadLiveStaffForSample(context);
        const scope = await resolveSampleScope(context, locations, url.searchParams.get("locationId"));
        const placements = staffPlacementsForScope(staff, locations, {
          scopeLocationId: scope.scopeLocationId,
          accessibleLocationIds: scope.accessibleLocationIds,
        });
        const { csv, truncated, rowCount } = buildAttendanceRosterSampleCsv(
          enumerateRosterSampleDates(period.dateFrom, period.dateTo),
          placements,
        );
        if (truncated) {
          throw new Error("Sample is too large. Download one location or a week instead of the full month.");
        }
        return {
          filename: rosterSampleFilename(period.dateFrom, period.dateTo, scope.locationCode),
          mime: "text/csv",
          csv,
          rowCount,
        };
      }
      const locationId = url.searchParams.get("locationId") || null;
      return listAttendanceRosterUploads({ locationId });
    },
    request,
    { capability: "attendance.view" },
  );
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      assertCanUploadAttendanceRoster(context);
      const form = await req.formData();
      const mode = String(form.get("mode") ?? "preview") === "commit" ? "commit" : "preview";
      const periodMode = String(form.get("periodMode") ?? "week") === "month" ? "month" : "week";
      const locationId = String(form.get("locationId") ?? "").trim() || null;
      const weekStart = String(form.get("weekStart") ?? "").trim() || null;
      const dateFromIn = String(form.get("dateFrom") ?? "").trim() || null;
      const dateToIn = String(form.get("dateTo") ?? "").trim() || null;
      const month = String(form.get("month") ?? "").trim() || null;
      const file = asUploadFile(form.get("file") ?? form.getAll("files")[0]);
      if (!file) throw new Error("Upload a roster file.");

      const buffer = Buffer.from(await file.arrayBuffer());
      const guard = guardAttendanceRosterUpload(file.name, buffer.length);
      if (!guard.ok) throw new Error(guard.message);

      if (locationId) await assertAttendanceRosterLocation(context, locationId);

      const period = attendanceRosterPeriod({
        mode: periodMode as AttendanceRosterPeriodMode,
        weekStart,
        dateFrom: dateFromIn,
        dateTo: dateToIn,
        month,
      });

      const parsed = await parseAttendanceRosterFile(file.name, buffer);
      if (parsed.error) {
        return {
          mode: "preview" as const,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
          periodMode,
          matched: 0,
          unmatched: 0,
          skipped: 0,
          warnings: [] as string[],
          errors: [parsed.error],
          rows: [],
        };
      }

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

      const preview = buildAttendanceRosterPreview({
        records: parsed.records,
        periodMode: periodMode as AttendanceRosterPeriodMode,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        selectedLocationId: locationId,
        staff,
        locations,
        shifts,
      });

      if (mode !== "commit") {
        return { mode: "preview" as const, ...preview };
      }
      if (!preview.matched) {
        throw new Error(preview.errors[0] ?? "No matched roster rows to save.");
      }

      const byLocation = new Map<string, typeof preview.rows>();
      for (const row of preview.rows) {
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
            dateFrom: period.dateFrom,
            dateTo: period.dateTo,
            fileName: file.name,
            fileType: file.name.split(".").pop()?.toLowerCase() ?? "csv",
            rows,
          }),
        );
      }

      const imported = results.reduce((n, r) => n + r.imported, 0);
      const processed = results.reduce((n, r) => n + r.processed, 0);
      return {
        mode: "commit" as const,
        ...preview,
        imported,
        processed,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      };
    },
    request,
    { anyCapability: ["people.edit_roster", "daily_ops.roster.upload"] },
  );
}
