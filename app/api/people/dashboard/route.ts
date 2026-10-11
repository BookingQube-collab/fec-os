import { loadLinkedStaffJobTitle } from "@/lib/linked-staff-job-title.server";
import { peopleDirectoryShowsSalary } from "@/lib/people-directory-access";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchPeopleDashboard,
  stripPeopleDashboardSalary,
  type PeopleDashboardFilters,
} from "@/lib/queries/people-dashboard.core";

function parseFilters(params: URLSearchParams): PeopleDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const payload = await fetchPeopleDashboard(context, parseFilters(searchParams(req)));
      const jobTitle = await loadLinkedStaffJobTitle(context.userId);
      if (!peopleDirectoryShowsSalary(context.roles ?? [], jobTitle)) {
        return stripPeopleDashboardSalary(payload);
      }
      return payload;
    },
    request,
    { capability: "people.view_roster" },
  );
}
