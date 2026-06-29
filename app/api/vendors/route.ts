import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchVendorsApi } from "@/lib/queries/vendors-api.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchVendorsApi(context, {
        locationId: params.get("locationId") || null,
        category: params.get("category") || null,
        search: params.get("search") || null,
        page: params.get("page") ? Number(params.get("page")) : 1,
        pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 50,
      });
    },
    request,
    { capability: "vendors.view" },
  );
}
