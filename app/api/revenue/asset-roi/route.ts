import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAssetRoiLeague } from "@/lib/queries/revenue.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const locationId = searchParams(req).get("locationId") || null;
      return fetchAssetRoiLeague(context, locationId);
    },
    request,
    { capability: "revenue.view" },
  );
}
