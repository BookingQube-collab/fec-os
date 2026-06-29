import {
  complianceKpisQuerySchema,
  parseWithSchema,
  searchParamsToObject,
} from "@/core/api/validation";
import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const COMPLIANCE_KPI_CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const { fetchExecutiveComplianceKpis } = await import("@/lib/queries/compliance-kpis.core");
      const { locationId } = parseWithSchema(
        complianceKpisQuerySchema,
        searchParamsToObject(searchParams(req)),
      );
      const cacheKey = routeCacheKey(["compliance-kpis", context.userId, locationId ?? "all"]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchExecutiveComplianceKpis>>>(cacheKey);
      if (cached) return cached;
      const payload = await fetchExecutiveComplianceKpis(context, locationId);
      setRouteCache(cacheKey, payload, COMPLIANCE_KPI_CACHE_TTL_MS);
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
