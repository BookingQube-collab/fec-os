import { withAuthRouteRequest } from "@/lib/server/api-route";
import { rollbackRosterBatch } from "@/lib/staff-roster/apply";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return withAuthRouteRequest(
    async (context) => {
      const { data: batch, error } = await context.supabase
        .from("staff_import_batches")
        .select("id, status")
        .eq("id", id)
        .single();
      if (error) throw error;
      if (batch.status !== "applied") throw new Error("Only applied imports can be rolled back");
      return rollbackRosterBatch(context, id);
    },
    request,
    { capability: "people.import_roster" },
  );
}
