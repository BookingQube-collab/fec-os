import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchCeoIncidents24h } from "@/lib/queries/ceo.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => fetchCeoIncidents24h(context),
    request,
    { capability: "ceo.view_dashboard" },
  );
}
