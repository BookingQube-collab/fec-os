import { logger } from "@/core/logger";
import type { AuthContext } from "@/lib/server/create-action";
import type { Json } from "@/integrations/supabase/types";

import { STAFF_ROSTER_BUCKET } from "./file-guard";

export async function deleteRosterImportBatch(context: AuthContext, batchId: string) {
  const { data: batch, error } = await context.supabase
    .from("staff_import_batches")
    .select("id")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch) throw new Error("Import batch not found");

  const { data: files, error: filesErr } = await context.supabase
    .from("staff_import_files")
    .select("storage_path")
    .eq("batch_id", batchId);
  if (filesErr) throw filesErr;

  const paths = (files ?? [])
    .map((file) => file.storage_path)
    .filter((path): path is string => Boolean(path));

  if (paths.length) {
    const { error: storageErr } = await context.supabase.storage.from(STAFF_ROSTER_BUCKET).remove(paths);
    if (storageErr) {
      logger.error("api", "Roster import storage delete failed; continuing with batch delete", storageErr);
    }
  }

  const { error: delErr } = await context.supabase
    .from("staff_import_batches")
    .delete()
    .eq("id", batchId);
  if (delErr) throw delErr;

  try {
    await context.supabase.rpc("log_audit", {
      _action: "staff.import_deleted",
      _table_name: "staff_import_batches",
      _row_id: batchId,
      _after: { deleted: true } as unknown as Json,
      _metadata: {},
    });
  } catch (auditError) {
    logger.error("api", "Roster import delete audit failed", auditError);
  }

  return { ok: true as const, id: batchId };
}
