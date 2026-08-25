import { withAuthRouteRequest } from "@/lib/server/api-route";
import { listAttendanceRosterUploads } from "@/lib/attendance-hr.functions";
import { assertAttendanceRosterLocation, assertCanUploadAttendanceRoster } from "@/lib/attendance-hr/roster-apply";
import { commitLiveShiftRoster, previewLiveShiftRoster } from "@/lib/attendance-hr/roster-run";
import {
  attendanceRosterPeriod,
  guardAttendanceRosterUpload,
  parseAttendanceRosterFile,
  type AttendanceRosterPeriodMode,
} from "@/lib/attendance-hr/roster-upload";
import { buildAttendanceRosterSampleCsv, enumerateRosterSampleDates, rosterSampleFilename } from "@/lib/attendance-hr/roster-sample";
import { loadLiveStaffForSample, resolveSampleScope } from "@/lib/staff-sample-load";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";

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

      const preview = await previewLiveShiftRoster(context, {
        records: parsed.records,
        periodMode: periodMode as AttendanceRosterPeriodMode,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        selectedLocationId: locationId,
      });

      if (mode !== "commit") {
        return { mode: "preview" as const, ...preview };
      }
      const committed = await commitLiveShiftRoster(context, {
        preview,
        fileName: file.name,
        fileType: file.name.split(".").pop()?.toLowerCase() ?? "csv",
      });
      return {
        mode: "commit" as const,
        ...preview,
        ...committed,
      };
    },
    request,
    { anyCapability: ["people.edit_roster", "daily_ops.roster.upload"] },
  );
}
