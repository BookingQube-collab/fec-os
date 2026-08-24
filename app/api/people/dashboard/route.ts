import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchPeopleDashboard,
  stripPeopleDashboardSalary,
  type PeopleDashboardFilters,
} from "@/lib/queries/people-dashboard.core";
import { canUserDo } from "@/lib/rbac";

function parseFilters(params: URLSearchParams): PeopleDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const payload = await fetchPeopleDashboard(context, parseFilters(searchParams(req)));
      if (!canUserDo(context.roles ?? [], "people.view_salary")) {
        return stripPeopleDashboardSalary(payload);
      }
      return payload;
    },
    request,
    { capability: "people.view_roster" },
  );
}
