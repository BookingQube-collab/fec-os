import { withAuthRouteRequest } from "@/lib/server/api-route";
import { canUserDo } from "@/lib/rbac";
import { applyRosterPreview, buildRosterPreview } from "@/lib/staff-roster/apply";
import type { RosterColumnKey, RosterPreview } from "@/lib/staff-roster/types";
import { guardRosterUpload } from "@/lib/staff-roster/file-guard";
import { persistRosterOriginalFile, rosterFileSha256 } from "@/lib/staff-roster/persist";
import { mapRosterColumns, parseRosterWorkbook, ROSTER_COLUMN_KEYS } from "@/lib/staff-roster/parse-workbook";
import type { RosterImportMode } from "@/lib/staff-roster/types";

export const runtime = "nodejs";

function readColumnMap(form: FormData): Partial<Record<RosterColumnKey, string>> | null {
  const raw = form.get("columnMap");
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const mapping: Partial<Record<RosterColumnKey, string>> = {};
    for (const key of ROSTER_COLUMN_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) mapping[key] = value.trim();
    }
    return Object.keys(mapping).length ? mapping : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => {
      const { data, error } = await context.supabase
        .from("staff_import_batches")
        .select(
          "id, status, mode, uploaded_by, file_count, row_count, create_count, update_count, unchanged_count, archive_count, delete_count, review_count, error_message, created_at, completed_at, rolled_back_at, staff_import_files(filename, file_type, worksheet_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return { batches: data ?? [] };
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
      const confirmHardDelete = String(form.get("confirmHardDelete") ?? "") === "true";
      const batchId = String(form.get("batchId") ?? "");
      const columnMap = readColumnMap(form);
      const preferHint = String(form.get("columnMapOverride") ?? "") === "true";

      if (mode === "commit") {
        if (!batchId) throw new Error("batchId is required to confirm an import");
        const { data: batch, error } = await context.supabase
          .from("staff_import_batches")
          .select("id, status, summary")
          .eq("id", batchId)
          .single();
        if (error || !batch) throw error ?? new Error("Import batch not found");
        if (batch.status !== "preview") throw new Error("This batch is no longer awaiting confirmation");
        const preview = (batch.summary as { preview?: RosterPreview } | null)?.preview;
        if (!preview) throw new Error("Preview payload is missing; upload again.");
        const result = await applyRosterPreview(context, batchId, {
          ...preview,
          canHardDelete: preview.canHardDelete && confirmHardDelete,
        });
        return { mode: "commit" as const, batchId, ...result };
      }

      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Upload an Employee Roster workbook.");
      const buffer = Buffer.from(await file.arrayBuffer());
      const guard = guardRosterUpload(file.name, buffer.length);
      if (!guard.ok) throw new Error(guard.message);

      const parsed = await parseRosterWorkbook(guard.filename, buffer, { columnMap, preferHint });
      if (parsed.errors.length && !parsed.rows.length) {
        const missingHeaders = parsed.errors.some((e) => e.code === "missing_headers");
        if (missingHeaders && parsed.headers.length > 0) {
          return {
            mode: "preview" as const,
            needsMapping: true,
            headers: parsed.headers,
            mapping: mapRosterColumns(parsed.headers, columnMap, preferHint),
            worksheetName: parsed.worksheetName,
            errors: parsed.errors,
          };
        }
        throw new Error(parsed.errors[0]?.message ?? "Could not read Employee Roster.");
      }
      const preview = await buildRosterPreview(context, parsed.rows, {
        mode: importMode,
        confirmHardDelete,
        skippedEmpty: parsed.skippedEmpty,
        mapping: parsed.mapping as Record<string, string>,
        worksheetName: parsed.worksheetName,
        errors: parsed.errors,
      });

      const { data: batch, error: bErr } = await context.supabase
        .from("staff_import_batches")
        .insert({
          status: "preview",
          mode: importMode,
          confirm_hard_delete: confirmHardDelete,
          uploaded_by: context.userId,
          file_count: 1,
          row_count: preview.rows.length + preview.missing.length,
          create_count: preview.counts.create,
          update_count: preview.counts.update,
          unchanged_count: preview.counts.unchanged,
          archive_count: preview.counts.archive,
          delete_count: preview.counts.delete,
          review_count: preview.counts.review,
          summary: { preview, mapping: parsed.mapping, worksheetName: parsed.worksheetName } as unknown as import("@/integrations/supabase/types").Json,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw bErr ?? new Error("Could not create import batch");

      const fileId = crypto.randomUUID();
      const stored = await persistRosterOriginalFile(context, fileId, buffer);
      const { error: fErr } = await context.supabase.from("staff_import_files").insert({
        id: fileId,
        batch_id: batch.id,
        filename: guard.filename,
        file_type: guard.fileType,
        file_hash: rosterFileSha256(buffer),
        storage_path: stored.path,
        worksheet_name: parsed.worksheetName,
        byte_size: stored.byteSize,
        encrypted: stored.encrypted,
      });
      if (fErr) throw fErr;

      const rowInserts = [...preview.rows, ...preview.missing].map((line) => ({
        batch_id: batch.id,
        row_number: line.rowNumber,
        raw: { fullName: line.fullName, locationCode: line.locationCode } as unknown as import("@/integrations/supabase/types").Json,
        match_staff_id: line.matchStaffId,
        match_rule: line.matchRule,
        action: line.action,
        warnings: line.warnings,
        old_values: line.oldValues as unknown as import("@/integrations/supabase/types").Json,
        new_values: line.newValues as unknown as import("@/integrations/supabase/types").Json,
        field_diffs: line.fieldDiffs as unknown as import("@/integrations/supabase/types").Json,
      }));
      if (rowInserts.length) {
        const { error: rErr } = await context.supabase.from("staff_import_rows").insert(rowInserts);
        if (rErr) throw rErr;
      }

      const includeSalary = canUserDo(context.roles ?? [], "people.view_salary");
      if (!includeSalary) {
        for (const line of preview.rows) {
          delete line.newValues.monthly_salary_qar;
          delete line.oldValues.monthly_salary_qar;
          line.fieldDiffs = line.fieldDiffs.filter((d) => d.field !== "monthly_salary_qar");
        }
      }

      return { mode: "preview" as const, batchId: batch.id, preview };
    },
    request,
    { capability: "people.import_roster" },
  );
}
