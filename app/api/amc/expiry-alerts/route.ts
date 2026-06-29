import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAmcExpiryAlerts, type AmcDashboardFilters } from "@/lib/queries/amc-dashboard.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters: AmcDashboardFilters = {
        locationId: params.get("locationId") || null,
        category: params.get("category") || null,
        status: params.get("status") || null,
      };
      return fetchAmcExpiryAlerts(context, filters);
    },
    request,
    { capability: "amc.view" },
  );
}
