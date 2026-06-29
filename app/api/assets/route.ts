import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAssets } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchAssets(context, params.get("locationId") || null);
    },
    request,
    { capability: "maintenance.view" },
  );
}
