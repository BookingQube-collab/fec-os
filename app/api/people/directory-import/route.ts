import { logger } from "@/core/logger";
import { withAuthRouteRequest } from "@/lib/server/api-route";
import { applyRosterPreview, assertRosterImportMode, buildRosterPreview } from "@/lib/staff-roster/apply";
import { parseDirectoryWorkbook } from "@/lib/staff-roster/e3-masterfile";
import { bucketE3Issue } from "@/lib/staff-roster/e3-validate";
import { guardRosterUpload } from "@/lib/staff-roster/file-guard";
import { persistRosterOriginalFile, rosterFileSha256 } from "@/lib/staff-roster/persist";
import type { RosterImportMode } from "@/lib/staff-roster/types";
import type { Json } from "@/integrations/supabase/types";

export const runtime = "nodejs";
export const maxDuration = 120;

async function persistOriginalBestEffort(
  context: Parameters<typeof persistRosterOriginalFile>[0],
  fileId: string,
  buffer: Buffer,
) {
  try {
    return await persistRosterOriginalFile(context, fileId, buffer);
  } catch (error) {
    logger.error("api", "Directory import original file persist failed; preview still available", error);
    return null;
  }
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

      if (mode === "commit") {
        if (!batchId) throw new Error("batchId is required to confirm an import");
        const { data: batch, error } = await context.supabase
          .from("staff_import_batches")
          .select("id, status, summary, mode, confirm_hard_delete")
          .eq("id", batchId)
          .single();
        if (error) throw new Error(error.message || "Could not load import batch");
        if (!batch) throw new Error("Import batch not found");
        if (batch.status !== "preview") throw new Error("This batch is no longer awaiting confirmation");
        const summary = batch.summary as {
          kind?: string;
          preview?: import("@/lib/staff-roster/types").RosterPreview;
        } | null;
        if (summary?.kind !== "directory" || !summary.preview) {
          throw new Error("This batch is not a People Directory import. Use People → Import Masterfile.");
        }
        assertRosterImportMode(context.roles ?? [], summary.preview.mode, Boolean(batch.confirm_hard_delete));
        if (summary.preview.counts.review > 0) {
          throw new Error(
            `Resolve ${summary.preview.counts.review} review row(s) before commit — conflicts are not applied silently.`,
          );
        }
        const result = await applyRosterPreview(context, batchId, summary.preview);
        return { mode: "commit" as const, kind: "directory" as const, batchId, ...result };
      }

      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Upload an E3 Employee Masterfile or Employee Roster workbook.");
      const buffer = Buffer.from(await file.arrayBuffer());
      const guard = guardRosterUpload(file.name, buffer.length);
      if (!guard.ok) throw new Error(guard.message);

      const parsed = await parseDirectoryWorkbook(guard.filename, buffer);
      if (parsed.errors.length && !parsed.rows.length) {
        throw new Error(parsed.errors.map((e) => e.message).join("; "));
      }

      // Surface validation conflicts as review — do not silently accept.
      const fatalRowNumbers = new Set(
        parsed.validationIssues
          .filter((i) => {
            const b = bucketE3Issue(i.code);
            return b === "duplicates_conflicts" || b === "invalid" || b === "missing_mandatory";
          })
          .map((i) => i.rowNumber),
      );

      const preview = await buildRosterPreview(context, parsed.rows, {
        mode: importMode,
        confirmHardDelete,
        skippedEmpty: parsed.skippedEmpty,
        mapping: parsed.mapping as Record<string, string>,
        worksheetName: parsed.worksheetName,
        errors: [
          ...parsed.errors,
          ...parsed.validationIssues.map((i) => ({
            rowNumber: i.rowNumber,
            code: i.code,
            message: i.message,
          })),
        ],
      });

      for (const line of preview.rows) {
        if (fatalRowNumbers.has(line.rowNumber) && line.action !== "unchanged") {
          line.action = "review";
          line.warnings = [
            ...line.warnings,
            ...parsed.validationIssues
              .filter((i) => i.rowNumber === line.rowNumber)
              .map((i) => i.message),
          ];
        }
      }
      preview.counts.review = [...preview.rows, ...preview.missing].filter((r) => r.action === "review").length;
      preview.counts.create = [...preview.rows, ...preview.missing].filter((r) => r.action === "create").length;
      preview.counts.update = [...preview.rows, ...preview.missing].filter((r) => r.action === "update").length;
      preview.counts.unchanged = [...preview.rows, ...preview.missing].filter((r) => r.action === "unchanged").length;

      const auditBuckets = {
        created: preview.counts.create,
        updated: preview.counts.update,
        unchanged: preview.counts.unchanged,
        duplicates_conflicts: parsed.validationIssues.filter((i) => bucketE3Issue(i.code) === "duplicates_conflicts")
          .length,
        invalid: parsed.validationIssues.filter((i) => bucketE3Issue(i.code) === "invalid").length,
        missing_mandatory: parsed.validationIssues.filter((i) => bucketE3Issue(i.code) === "missing_mandatory")
          .length,
        review: preview.counts.review,
      };

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
          summary: {
            kind: "directory",
            preview,
            sheetsParsed: parsed.sheetsParsed,
            parseKind: parsed.kind,
            auditBuckets,
          } as unknown as Json,
        })
        .select("id")
        .single();
      if (bErr || !batch) throw new Error(bErr?.message || "Could not create import batch");

      const fileId = crypto.randomUUID();
      const stored = await persistOriginalBestEffort(context, fileId, buffer);
      const { error: fErr } = await context.supabase.from("staff_import_files").insert({
        id: fileId,
        batch_id: batch.id,
        filename: guard.filename,
        file_type: guard.fileType,
        file_hash: rosterFileSha256(buffer),
        storage_path: stored?.path ?? null,
        worksheet_name: parsed.worksheetName,
        byte_size: stored?.byteSize ?? buffer.length,
        encrypted: stored?.encrypted ?? false,
      });
      if (fErr) logger.error("api", "Directory import file row failed; preview still available", fErr);

      await context.supabase.rpc("log_audit", {
        _action: "staff.import_preview",
        _table_name: "staff_import_batches",
        _row_id: batch.id,
        _after: { counts: preview.counts, auditBuckets, sheets: parsed.sheetsParsed } as unknown as Json,
        _metadata: {},
      });

      return {
        ...preview,
        mode: "preview" as const,
        kind: "directory" as const,
        batchId: batch.id,
        parseKind: parsed.kind,
        sheetsParsed: parsed.sheetsParsed,
        auditBuckets,
        validationIssues: parsed.validationIssues,
      };
    },
    request,
    { capability: "people.import_roster" },
  );
}
