import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchPeopleDashboard,
  type PeopleDashboardFilters,
} from "@/lib/queries/people-dashboard.core";

function parseFilters(params: URLSearchParams): PeopleDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => fetchPeopleDashboard(context, parseFilters(searchParams(req))),
    request,
    { capability: "people.view_roster" },
  );
}
