import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchStaff } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchStaff(context, params.get("locationId") || null);
    },
    request,
    { capability: "people.view_roster" },
  );
}
