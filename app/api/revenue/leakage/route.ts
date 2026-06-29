import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchLeakageCases } from "@/lib/queries/revenue.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const locationId = searchParams(req).get("locationId") || null;
      return fetchLeakageCases(context, locationId);
    },
    request,
    { capability: "revenue.view" },
  );
}
