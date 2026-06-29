import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchBranchLeague } from "@/lib/queries/branches.core";
import { getRouteCache, routeCacheKey, setRouteCache, ROUTE_CACHE_TTL } from "@/lib/server/route-cache";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => {
      const cacheKey = routeCacheKey(["branches-league", context.userId]);
      const cached = getRouteCache(cacheKey);
      if (cached) return cached;
      const payload = await fetchBranchLeague(context);
      setRouteCache(cacheKey, payload, ROUTE_CACHE_TTL.lists);
      return payload;
    },
    request,
    { capability: "dashboard.view" },
  );
}
