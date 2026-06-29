import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchEstateRollup } from "@/lib/queries/occ.core";
import { getRouteCache, routeCacheKey, setRouteCache, ROUTE_CACHE_TTL } from "@/lib/server/route-cache";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => {
      const cacheKey = routeCacheKey(["occ-rollup", context.userId]);
      const cached = getRouteCache(cacheKey);
      if (cached) return cached;
      const payload = await fetchEstateRollup(context);
      setRouteCache(cacheKey, payload, ROUTE_CACHE_TTL.lists);
      return payload;
    },
    request,
    { capability: "occ.view_estate" },
  );
}
