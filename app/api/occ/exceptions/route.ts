import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchExceptionsFeed } from "@/lib/queries/occ.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchExceptionsFeed(context), request, { capability: "occ.view_estate" });
}
