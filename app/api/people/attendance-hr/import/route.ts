import { withAuthRouteRequest } from "@/lib/server/api-route";
import { DEFAULT_RULES, DEFAULT_SHIFT } from "@/lib/attendance-hr/constants";
import { guardAttendanceUpload } from "@/lib/attendance-hr/file-guard";
import { fileSha256 } from "@/lib/attendance-hr/hash";
import { parseAttlogBuffer } from "@/lib/attendance-hr/parse-attlog";
import { parseDelimitedAttendance, parseWorkbookAttendance } from "@/lib/attendance-hr/parse-spreadsheet";
import { parseUserDat } from "@/lib/attendance-hr/parse-user-dat";
import { previewAttendanceFile } from "@/lib/attendance-hr/preview";
import {
  persistOriginalFile,
  buildPunchRows,
  recalculateAttendanceRange,
  mergeBiometricUsersById,
  persistMergedBiometricUsers,
  staffByBiometricFromMappings,
  type ExistingBiometricUser,
  type IncomingBiometricUser,
} from "@/lib/attendance-hr/process";

export const runtime = "nodejs";
export const maxDuration = 60;

function asUploadFile(value: FormDataEntryValue): File | null {
  if (typeof value !== "object" || value == null) return null;
  const maybe = value as File;
  if (typeof maybe.arrayBuffer !== "function") return null;
  if (typeof maybe.name !== "string" || !maybe.name) return null;
  return maybe;
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const form = await req.formData();
      const mode = String(form.get("mode") ?? "preview");
      const companyId = String(form.get("companyId") ?? "");
      const locationId = String(form.get("locationId") ?? "");
      const deviceId = String(form.get("deviceId") ?? "");
      if (!companyId || !locationId || !deviceId) {
        throw new Error("Company, site and device are required.");
      }

      const uploads = form.getAll("files").map(asUploadFile).filter((f): f is File => f != null);
      if (!uploads.length) throw new Error("Upload at least one file.");

      const buffers = await Promise.all(
        uploads.map(async (file) => ({ file, buffer: Buffer.from(await file.arrayBuffer()) })),
      );

      const staffByBiometric = staffByBiometricFromMappings(
        await loadExistingBiometricUsers(context.supabase, companyId, locationId, deviceId),
      );

      const previews = [];
      for (const { file, buffer } of buffers) {
        try {
          const raw = await previewAttendanceFile({
            filename: file.name,
            buffer,
            locationId,
            deviceId,
            companyId,
          });
          const ids = raw.uniqueUserIds ?? [];
          let matchedStaff = 0;
          for (const id of ids) {
            if (staffByBiometric.has(id)) matchedStaff += 1;
          }
          previews.push({
            ...raw,
            punches: (raw.punches ?? []).map((row) => ({
              ...row,
              matched: staffByBiometric.has(row.biometricUserId),
            })),
            matchedStaff,
            unmatched: Math.max(0, (raw.uniqueUserCount ?? ids.length) - matchedStaff),
          });
        } catch (e) {
          previews.push({
            ok: false,
            filename: file.name,
            message: e instanceof Error ? e.message : "Could not read this file.",
            users: [],
            userCount: 0,
            punches: [],
            punchCount: 0,
            uniqueUserIds: [],
            uniqueUserCount: 0,
            dateFrom: null,
            dateTo: null,
            matchedStaff: 0,
            unmatched: 0,
            errors: [{ message: e instanceof Error ? e.message : "Could not read this file." }],
          });
        }
      }

      const summary = {
        fileCount: previews.length,
        okFiles: previews.filter((p) => p.ok).length,
        punchCount: previews.reduce((n, p) => n + (p.punchCount ?? 0), 0),
        userCount: previews.reduce((n, p) => n + (p.uniqueUserCount ?? p.userCount ?? 0), 0),
        matchedStaff: previews.reduce((n, p) => n + (p.matchedStaff ?? 0), 0),
        unmatched: previews.reduce((n, p) => n + (p.unmatched ?? 0), 0),
        errorCount: previews.reduce((n, p) => n + (p.ok ? 0 : 1) + (p.errors?.length ?? 0), 0),
        dateFrom: previews.map((p) => p.dateFrom).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
        dateTo: previews.map((p) => p.dateTo).filter((d): d is string => Boolean(d)).sort().at(-1) ?? null,
      };

      if (mode !== "commit") return { mode: "preview" as const, previews, summary };

      const { data: batch, error: bErr } = await context.supabase
        .from("attendance_imports")
        .insert({
          company_id: companyId,
          status: "queued",
          uploaded_by: context.userId,
          file_count: buffers.length,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw bErr ?? new Error("Could not create import batch");

      const saved: Array<{ id: string; buffer: Buffer; filename: string; fileType: string }> = [];
      for (const { file, buffer } of buffers) {
        const guard = guardAttendanceUpload(file.name, buffer.length);
        const stored = await persistOriginalFile(context, crypto.randomUUID(), buffer);
        const { data: fileRow, error } = await context.supabase
          .from("attendance_import_files")
          .insert({
            import_id: batch.id,
            location_id: locationId,
            device_id: deviceId,
            original_filename: file.name,
            file_type: guard.ok ? guard.fileType : "unknown",
            file_hash: fileSha256(buffer),
            byte_size: buffer.length,
            storage_path: stored.path,
            encrypted: stored.encrypted,
            status: "queued",
          })
          .select("id")
          .single();
        if (error || !fileRow) throw error ?? new Error("Could not save file row");
        saved.push({
          id: fileRow.id,
          buffer,
          filename: file.name,
          fileType: guard.ok ? guard.fileType : "unknown",
        });
      }

      const result = await processBatch(context, batch.id, companyId, locationId, deviceId, saved);
      const dateFrom = result.dateFrom ?? summary.dateFrom;
      const dateTo = result.dateTo ?? summary.dateTo;

      return {
        mode: "commit" as const,
        importId: batch.id,
        status: "completed",
        fileIds: saved.map((s) => s.id),
        previews,
        summary: { ...summary, dateFrom, dateTo },
        dateFrom,
        dateTo,
        imported: result.imported,
        processed: result.processed,
      };
    },
    request,
    { capability: "attendance.import" },
  );
}

async function loadExistingBiometricUsers(
  supabase: import("@/lib/server/auth").AuthContext["supabase"],
  companyId: string,
  locationId: string,
  deviceId: string,
): Promise<ExistingBiometricUser[]> {
  const { data, error } = await supabase
    .from("attendance_biometric_users")
    .select("biometric_user_id, device_name, staff_id, previous_device_name")
    .eq("company_id", companyId)
    .eq("location_id", locationId)
    .eq("device_id", deviceId);
  if (error) {
    const fallback = await supabase
      .from("attendance_biometric_users")
      .select("biometric_user_id, device_name, staff_id")
      .eq("company_id", companyId)
      .eq("location_id", locationId)
      .eq("device_id", deviceId);
    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map((row) => ({
      biometricUserId: String(row.biometric_user_id),
      deviceName: row.device_name == null ? null : String(row.device_name),
      staffId: row.staff_id == null ? null : String(row.staff_id),
      previousDeviceName: null,
    }));
  }
  return (data ?? []).map((row) => ({
    biometricUserId: String(row.biometric_user_id),
    deviceName: row.device_name == null ? null : String(row.device_name),
    staffId: row.staff_id == null ? null : String(row.staff_id),
    previousDeviceName: row.previous_device_name == null ? null : String(row.previous_device_name),
  }));
}

async function collectIncomingUsers(
  files: Array<{ buffer: Buffer; fileType: string }>,
): Promise<IncomingBiometricUser[]> {
  const incoming: IncomingBiometricUser[] = [];
  for (const file of files) {
    if (file.fileType === "user_dat") {
      incoming.push(...parseUserDat(file.buffer).users);
      continue;
    }
    if (file.fileType === "xlsx" || file.fileType === "xls") {
      incoming.push(...(await parseWorkbookAttendance(file.buffer)).users);
      continue;
    }
    if (file.fileType === "csv" || file.fileType === "tsv") {
      incoming.push(
        ...parseDelimitedAttendance(file.buffer.toString("utf8"), file.fileType === "tsv" ? "\t" : ",").users,
      );
    }
  }
  return incoming;
}

async function processBatch(
  context: { supabase: import("@/lib/server/auth").AuthContext["supabase"]; userId: string },
  importId: string,
  companyId: string,
  locationId: string,
  deviceId: string,
  files: Array<{ id: string; buffer: Buffer; filename: string; fileType: string }>,
) {
  await context.supabase
    .from("attendance_imports")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", importId);

  const existing = await loadExistingBiometricUsers(context.supabase, companyId, locationId, deviceId);
  const incoming = await collectIncomingUsers(files);
  const merged = mergeBiometricUsersById(existing, incoming);
  if (merged.length) {
    await persistMergedBiometricUsers(context.supabase, { companyId, locationId, deviceId, merged });
  }

  const staffByBiometric = staffByBiometricFromMappings([
    ...existing.map((row) => ({ biometricUserId: row.biometricUserId, staffId: row.staffId })),
    ...merged.map((row) => ({ biometricUserId: row.biometricUserId, staffId: row.staffId })),
  ]);

  let imported = 0;
  let duplicates = 0;
  let unmatched = 0;
  let rejected = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const file of files) {
    try {
      if (file.fileType === "user_dat") {
        const parsed = parseUserDat(file.buffer);
        imported += parsed.users.length;
        rejected += parsed.errors.length;
        await context.supabase
          .from("attendance_import_files")
          .update({ status: "completed", imported_count: parsed.users.length, rejected_count: parsed.errors.length })
          .eq("id", file.id);
        continue;
      }

      let punches = parseAttlogBuffer(file.buffer).punches;
      if (file.fileType === "xlsx" || file.fileType === "xls") {
        punches = (await parseWorkbookAttendance(file.buffer)).punches;
      } else if (file.fileType === "csv" || file.fileType === "tsv") {
        punches = parseDelimitedAttendance(file.buffer.toString("utf8"), file.fileType === "tsv" ? "\t" : ",").punches;
      }

      const rows = buildPunchRows({
        punches,
        companyId,
        locationId,
        deviceId,
        importId,
        windowSeconds: DEFAULT_RULES.duplicateWindowSeconds,
        shift: DEFAULT_SHIFT,
        staffByBiometric,
      });
      for (const row of rows) {
        const day = row.attendance_date;
        if (day && (!minDate || day < minDate)) minDate = day;
        if (day && (!maxDate || day > maxDate)) maxDate = day;
      }

      let fileImported = 0;
      let fileDup = 0;
      for (const row of rows) {
        const { error } = await context.supabase.from("attendance_logs").insert(row);
        if (error) {
          if (error.code === "23505" || /duplicate/i.test(error.message)) fileDup += 1;
          else rejected += 1;
        } else {
          fileImported += 1;
          if (!row.staff_id) unmatched += 1;
          const day = row.attendance_date;
          if (day && (!minDate || day < minDate)) minDate = day;
          if (day && (!maxDate || day > maxDate)) maxDate = day;
        }
      }
      imported += fileImported;
      duplicates += fileDup;
      await context.supabase
        .from("attendance_import_files")
        .update({
          status: "completed",
          imported_count: fileImported,
          duplicate_count: fileDup,
          unmatched_count: unmatched,
          rejected_count: rejected,
          row_count: punches.length,
        })
        .eq("id", file.id);
    } catch (e) {
      await context.supabase
        .from("attendance_import_files")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : "Failed" })
        .eq("id", file.id);
    }
  }

  let processed = 0;
  if (minDate && maxDate) {
    const recalc = await recalculateAttendanceRange(context.supabase, locationId, minDate, maxDate);
    processed = recalc.processed;
  }

  await context.supabase
    .from("attendance_devices")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", deviceId);

  await context.supabase
    .from("attendance_imports")
    .update({
      status: "completed",
      imported_count: imported,
      duplicate_count: duplicates,
      unmatched_count: unmatched,
      rejected_count: rejected,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);

  return { dateFrom: minDate, dateTo: maxDate, imported, processed, unmatched, duplicates, rejected };
}
