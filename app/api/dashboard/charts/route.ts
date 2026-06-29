import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const CHARTS_CACHE_TTL_MS = 45_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const { fetchDashboardCharts } = await import("@/lib/queries/dashboard-kpis.core");
      const params = searchParams(req);
      const locationId = params.get("locationId");
      const year = params.get("year");
      const utilityBase = params.get("utilityBase");

      const cacheKey = routeCacheKey([
        "dashboard-charts",
        context.userId,
        locationId,
        year,
        utilityBase,
      ]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchDashboardCharts>>>(cacheKey);
      if (cached) return cached;

      const payload = await fetchDashboardCharts(context, {
        locationId: locationId || null,
        year: year ? Number(year) : undefined,
        utilityBase: utilityBase ? Number(utilityBase) : undefined,
      });
      setRouteCache(cacheKey, payload, CHARTS_CACHE_TTL_MS);
      return payload;
    },
    request,
    { capability: "dashboard.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=45, stale-while-revalidate=90");
  }
  return response;
}
