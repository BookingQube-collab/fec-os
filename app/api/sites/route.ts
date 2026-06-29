import { withAuthRoute } from "@/lib/server/api-route";
import { fetchSites } from "@/lib/queries/module-queries.core";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const SITES_CACHE_TTL_MS = 10 * 60_000;

export async function GET() {
  const response = await withAuthRoute(
    async (context) => {
      const cacheKey = routeCacheKey(["sites", context.userId]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchSites>>>(cacheKey);
      if (cached) return cached;
      const sites = await fetchSites(context);
      setRouteCache(cacheKey, sites, SITES_CACHE_TTL_MS);
      return sites;
    },
    { capability: "dashboard.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=600, stale-while-revalidate=1200");
  }
  return response;
}
