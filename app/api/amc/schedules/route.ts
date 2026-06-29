import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAmcSchedules } from "@/lib/queries/amc-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchAmcSchedules(context, {
        locationId: params.get("locationId") || null,
        overdueOnly: params.get("overdueOnly") === "true",
        page: params.get("page") ? Number(params.get("page")) : 1,
        pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 100,
      });
    },
    request,
    { capability: "amc.view" },
  );
}
