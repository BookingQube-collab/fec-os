import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchCeoOverview } from "@/lib/queries/ceo.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchCeoOverview(context), request, { capability: "ceo.view_dashboard" });
}
