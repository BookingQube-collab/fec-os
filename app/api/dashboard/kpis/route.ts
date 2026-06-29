import { NextResponse } from "next/server";

import {
  dashboardKpisQuerySchema,
  parseWithSchema,
  searchParamsToObject,
} from "@/core/api/validation";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchDashboardKpis } from "@/lib/queries/dashboard-kpis.core";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const KPI_CACHE_TTL_MS = 30_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const query = parseWithSchema(dashboardKpisQuerySchema, searchParamsToObject(searchParams(req)));
      const { period, locationId, view } = query;

      const cacheKey = routeCacheKey([
        "dashboard-kpis",
        context.userId,
        period,
        locationId,
        view,
      ]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchDashboardKpis>>>(cacheKey);
      if (cached) return cached;

      const payload = await fetchDashboardKpis(context, {
        period,
        locationId,
        view: view ?? undefined,
      });
      if (!locationId) setRouteCache(cacheKey, payload, KPI_CACHE_TTL_MS);
      return payload;
    },
    request,
    { capability: "dashboard.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  }
  return response;
}
