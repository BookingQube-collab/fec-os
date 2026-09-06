import { logger } from "@/core/logger";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { attendanceRosterPeriod, monthBounds, qatarWeekBounds, type AttendanceRosterPeriodMode } from "@/lib/attendance-hr/roster-period";
import { commitLiveShiftRoster, previewLiveShiftRoster } from "@/lib/attendance-hr/roster-run";
import {
  looksLikeShiftRosterHeaders,
  parseAttendanceRosterFile,
  type AttendanceRosterPreview,
} from "@/lib/attendance-hr/roster-upload";
import { mergeShiftPreviewRows } from "@/lib/staff-roster/batch-preview";
import { guardRosterUpload } from "@/lib/staff-roster/file-guard";
import { persistRosterOriginalFile, rosterFileSha256 } from "@/lib/staff-roster/persist";
import {
  buildPeopleRosterSampleXlsx,
  enumerateRosterSampleDates,
  peopleRosterSampleFilename,
} from "@/lib/staff-roster/period-sample";
import type { RosterImportMode } from "@/lib/staff-roster/types";
import { loadLiveStaffForSample, resolveSampleScope } from "@/lib/staff-sample-load";
import { staffPlacementsForScope } from "@/lib/staff-sample-scope";

export const runtime = "nodejs";
export const maxDuration = 60;

type ShiftBatchSummary = {
  kind: "shift_roster";
  preview: AttendanceRosterPreview;
  periodMode: AttendanceRosterPeriodMode;
  dateFrom: string;
  dateTo: string;
  fileName: string;
  fileType: string;
};

function readPreviewPatch(form: FormData): { rows?: AttendanceRosterPreview["rows"] } | null {
  const raw = form.get("previewPatch");
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const rec = parsed as { rows?: AttendanceRosterPreview["rows"] };
    return rec;
  } catch {
    return null;
  }
}

async function persistOriginalBestEffort(
  context: Parameters<typeof persistRosterOriginalFile>[0],
  fileId: string,
  buffer: Buffer,
) {
  try {
    return await persistRosterOriginalFile(context, fileId, buffer);
  } catch (error) {
    logger.error("api", "Roster original file persist failed; preview is still available", error);
    return null;
  }
}

function readPeriod(source: { get: (key: string) => string | null }) {
  const periodMode: AttendanceRosterPeriodMode = source.get("periodMode") === "month" ? "month" : "week";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
  try {
    return {
      periodMode,
      period: attendanceRosterPeriod({
        mode: periodMode,
        weekStart: source.get("weekStart") || qatarWeekBounds(today).dateFrom,
        month: source.get("month") || today.slice(0, 7),
        dateFrom: source.get("dateFrom"),
        dateTo: source.get("dateTo"),
      }),
    };
  } catch {
    return {
      periodMode,
      period: periodMode === "month" ? monthBounds(today.slice(0, 7)) : qatarWeekBounds(today),
    };
  }
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      if (params.get("download") === "sample") {
        const { period, periodMode } = readPeriod(params);
        const { staff, locations } = await loadLiveStaffForSample(context);
        const scope = await resolveSampleScope(context, locations, params.get("locationId"));
        const placements = staffPlacementsForScope(staff, locations, {
          scopeLocationId: scope.scopeLocationId,
          accessibleLocationIds: scope.accessibleLocationIds,
        });
        const { buffer, truncated, rowCount } = await buildPeopleRosterSampleXlsx(
          enumerateRosterSampleDates(period.dateFrom, period.dateTo),
          placements,
          { periodMode },
        );
        if (truncated) {
          throw new Error("Sample is too large. Download one location or a week instead of the full month.");
        }
        return {
          filename: peopleRosterSampleFilename(period.dateFrom, period.dateTo, scope.locationCode),
          mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          base64: buffer.toString("base64"),
          rowCount,
        };
      }

      const { data, error } = await context.supabase
        .from("staff_import_batches")
        .select(
          "id, status, mode, uploaded_by, file_count, row_count, create_count, update_count, unchanged_count, archive_count, delete_count, review_count, error_message, created_at, completed_at, rolled_back_at, summary, staff_import_files(filename, file_type, worksheet_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return {
        batches: (data ?? []).map((row) => {
          const summary = row.summary as { kind?: string } | null;
          const { summary: _summary, ...rest } = row;
          return { ...rest, kind: summary?.kind === "shift_roster" ? "shift_roster" : "directory" };
        }),
      };
    },
    request,
    { capability: "people.import_roster" },
  );
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const form = await req.formData();
      const mode = String(form.get("mode") ?? "preview");
      const importMode = (String(form.get("importMode") ?? "safe_sync") === "authoritative_replace"
        ? "authoritative_replace"
        : "safe_sync") as RosterImportMode;
      const batchId = String(form.get("batchId") ?? "");
      const { periodMode, period } = readPeriod({
        get: (key) => {
          const value = form.get(key);
          return typeof value === "string" && value.trim() ? value.trim() : null;
        },
      });

      if (mode === "commit") {
        if (!batchId) throw new Error("batchId is required to confirm an import");
        const { data: batch, error } = await context.supabase
          .from("staff_import_batches")
          .select("id, status, summary")
          .eq("id", batchId)
          .single();
        if (error || !batch) throw error ?? new Error("Import batch not found");
        if (batch.status !== "preview") throw new Error("This batch is no longer awaiting confirmation");
        const summary = batch.summary as ShiftBatchSummary | null;
        const previewPatch = readPreviewPatch(form);
        if (summary?.kind !== "shift_roster") {
          throw new Error(
            "This page confirms shift rosters only. Use People for staff directory imports.",
          );
        }
        const storedShift = summary.preview;
        if (!storedShift) throw new Error("Preview payload is missing; upload again.");
        const shiftPreview = mergeShiftPreviewRows(storedShift, previewPatch?.rows);
        if (previewPatch?.rows?.length) {
          const { error: patchErr } = await context.supabase
            .from("staff_import_batches")
            .update({
              summary: { ...summary, preview: shiftPreview } as unknown as import("@/integrations/supabase/types").Json,
              update_count: shiftPreview.matched,
              review_count: shiftPreview.unmatched,
              row_count: shiftPreview.rows.length,
            })
            .eq("id", batchId);
          if (patchErr) throw patchErr;
        }
        const committed = await commitLiveShiftRoster(context, {
          preview: shiftPreview,
          fileName: summary.fileName,
          fileType: summary.fileType,
        });
        const { error: uErr } = await context.supabase
          .from("staff_import_batches")
          .update({
            status: "applied",
            completed_at: new Date().toISOString(),
            update_count: committed.imported,
            row_count: shiftPreview.rows.length,
          })
          .eq("id", batchId);
        if (uErr) throw uErr;
        return {
          ...shiftPreview,
          ...committed,
          mode: "commit" as const,
          kind: "shift_roster" as const,
          batchId,
        };
      }

      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Upload a shift roster workbook (DATE, EMPLOYEE, LOCATION, SHIFT).");
      const buffer = Buffer.from(await file.arrayBuffer());
      const guard = guardRosterUpload(file.name, buffer.length);
      if (!guard.ok) throw new Error(guard.message);

      const attParsed = await parseAttendanceRosterFile(guard.filename, buffer);
      if (attParsed.error) throw new Error(attParsed.error);
      const attHeaders = attParsed.records[0] ? Object.keys(attParsed.records[0]) : [];
      if (!looksLikeShiftRosterHeaders(attHeaders)) {
        throw new Error(
          "This page imports shift rosters only (DATE, EMPLOYEE, LOCATION, SHIFT). Use People → staff CSV import for the employee directory.",
        );
      }

      const shiftPreview = await previewLiveShiftRoster(context, {
        records: attParsed.records,
        periodMode,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        selectedLocationId: null,
      });
      const shiftSummary: ShiftBatchSummary = {
        kind: "shift_roster",
        preview: shiftPreview,
        periodMode,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
        fileName: guard.filename,
        fileType: guard.fileType,
      };
      const { data: batch, error: bErr } = await context.supabase
        .from("staff_import_batches")
        .insert({
          status: "preview",
          mode: importMode,
          confirm_hard_delete: false,
          uploaded_by: context.userId,
          file_count: 1,
          row_count: shiftPreview.rows.length,
          create_count: 0,
          update_count: shiftPreview.matched,
          unchanged_count: 0,
          archive_count: 0,
          delete_count: 0,
          review_count: shiftPreview.unmatched,
          summary: shiftSummary as unknown as import("@/integrations/supabase/types").Json,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw bErr ?? new Error("Could not create import batch");

      const fileId = crypto.randomUUID();
      const stored = await persistOriginalBestEffort(context, fileId, buffer);
      const { error: fErr } = await context.supabase.from("staff_import_files").insert({
        id: fileId,
        batch_id: batch.id,
        filename: guard.filename,
        file_type: guard.fileType,
        file_hash: rosterFileSha256(buffer),
        storage_path: stored?.path ?? null,
        worksheet_name: attParsed.sheetName ?? "Date Wise Roster",
        byte_size: stored?.byteSize ?? buffer.length,
        encrypted: stored?.encrypted ?? false,
      });
      if (fErr) logger.error("api", "Roster import file row failed; preview is still available", fErr);

      return {
        ...shiftPreview,
        mode: "preview" as const,
        kind: "shift_roster" as const,
        batchId: batch.id,
        periodMode,
      };
    },
    request,
    { capability: "people.import_roster" },
  );
}
