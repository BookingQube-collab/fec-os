import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchSnag } from "@/lib/queries/snags.core";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthRouteRequest(async (context) => fetchSnag(context, id), request, { capability: "snags.view" });
}
