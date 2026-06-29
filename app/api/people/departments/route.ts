import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchMasterDepartments } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => fetchMasterDepartments(context),
    request,
    { capability: "people.view_roster" },
  );
}
