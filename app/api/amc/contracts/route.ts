import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAmcContracts } from "@/lib/queries/amc-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchAmcContracts(context, {
        locationId: params.get("locationId") || null,
        category: params.get("category") || null,
        status: params.get("status") || null,
        page: params.get("page") ? Number(params.get("page")) : 1,
        pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 50,
      });
    },
    request,
    { capability: "amc.view" },
  );
}
