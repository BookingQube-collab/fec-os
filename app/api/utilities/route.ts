import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchUtilityConsumption, fetchUtilityDashboard } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId") || null;
      if (params.get("summary") === "true") {
        return fetchUtilityDashboard(context, locationId);
      }
      return fetchUtilityConsumption(context, locationId);
    },
    request,
    { capability: "utilities.view" },
  );
}
