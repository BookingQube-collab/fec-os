import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchCeoUrgentTickets } from "@/lib/queries/ceo.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => fetchCeoUrgentTickets(context),
    request,
    { capability: "ceo.view_dashboard" },
  );
}
