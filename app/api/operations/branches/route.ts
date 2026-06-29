import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchOperationsBranches } from "@/lib/queries/operations-dashboard.core";
import type { DashboardPeriod } from "@/lib/dashboard.functions";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const BRANCHES_CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const period = (params.get("period") ?? "today") as DashboardPeriod;
      const locationId = params.get("locationId");

      const cacheKey = routeCacheKey([
        "operations-branches",
        context.userId,
        period,
        locationId,
      ]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchOperationsBranches>>>(cacheKey);
      if (cached) return cached;

      const payload = await fetchOperationsBranches(context, {
        period,
        locationId: locationId || null,
      });
      if (!locationId) setRouteCache(cacheKey, payload, BRANCHES_CACHE_TTL_MS);
      return payload;
    },
    request,
    { capability: "dashboard.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  }
  return response;
}
