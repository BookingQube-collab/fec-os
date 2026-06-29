import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplianceCoverage } from "@/lib/queries/compliance-register.core";
import { getRouteCache, routeCacheKey, setRouteCache, ROUTE_CACHE_TTL } from "@/lib/server/route-cache";

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters = {
        locationCode: params.get("locationCode") || null,
        domain: params.get("domain") || null,
        vendor: params.get("vendor") || null,
        status: params.get("status") || null,
        risk: params.get("risk") || null,
        year: params.get("year") ? Number(params.get("year")) : undefined,
        month: params.get("month") ? Number(params.get("month")) : undefined,
        locationId: params.get("locationId") || null,
        result: params.get("result") || null,
        dateFrom: params.get("dateFrom") || null,
        dateTo: params.get("dateTo") || null,
      };
      const cacheKey = routeCacheKey(["compliance-coverage", context.userId, JSON.stringify(filters)]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchComplianceCoverage>>>(cacheKey);
      if (cached) return cached;
      const payload = await fetchComplianceCoverage(context, filters as never);
      setRouteCache(cacheKey, payload, ROUTE_CACHE_TTL.lists);
      return payload;
    },
    request,
    { capability: "compliance.view" },
  );
  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  }
  return response;
}
