import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchSnags, fetchSnagDashboard } from "@/lib/queries/snags.core";
import { getRouteCache, routeCacheKey, setRouteCache, ROUTE_CACHE_TTL } from "@/lib/server/route-cache";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters = {
        locationId: params.get("locationId") || null,
        status: params.get("status") || null,
        category: params.get("category") || null,
      };
      if (params.get("dashboard") === "true") {
        const cacheKey = routeCacheKey(["snags-dashboard", context.userId, filters.locationId]);
        const cached = getRouteCache(cacheKey);
        if (cached) return cached;
        const payload = await fetchSnagDashboard(context, filters);
        setRouteCache(cacheKey, payload, ROUTE_CACHE_TTL.lists);
        return payload;
      }
      return fetchSnags(context, filters);
    },
    request,
    { capability: "snags.view" },
  );
}
