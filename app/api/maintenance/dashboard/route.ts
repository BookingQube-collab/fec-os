import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchMaintenanceDashboard,
  type MaintenanceDashboardFilters,
} from "@/lib/queries/maintenance-dashboard.core";

function parseFilters(params: URLSearchParams): MaintenanceDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => fetchMaintenanceDashboard(context, parseFilters(searchParams(req))),
    request,
    { capability: "maintenance.view" },
  );
}
