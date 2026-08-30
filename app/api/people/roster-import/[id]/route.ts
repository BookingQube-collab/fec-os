import { withAuthRouteRequest } from "@/lib/server/api-route";
import { rosterImportPreviewFromBatch } from "@/lib/staff-roster/batch-preview";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withAuthRouteRequest(
    async (context) => {
      const { data: batch, error } = await context.supabase
        .from("staff_import_batches")
        .select("id, status, mode, summary")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!batch) throw new Error("Import batch not found");
      const payload = rosterImportPreviewFromBatch(batch);
      if (!payload) throw new Error("Preview payload is missing; upload again.");
      return payload;
    },
    request,
    { capability: "people.import_roster" },
  );
}
