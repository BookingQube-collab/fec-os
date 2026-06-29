import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchFacilityDashboard, fetchFacilityTasks } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters = {
        locationId: params.get("locationId") || null,
        category: params.get("category") || null,
        status: params.get("status") || null,
      };
      if (params.get("summary") === "true") {
        return fetchFacilityDashboard(context, filters);
      }
      return fetchFacilityTasks(context, filters);
    },
    request,
    { capability: "facility.view" },
  );
}
