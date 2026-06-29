import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchPmSchedules } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchPmSchedules(context, params.get("locationId") || null);
    },
    request,
    { capability: "maintenance.view" },
  );
}
