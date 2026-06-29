import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const RENEWALS_CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const { fetchComplianceRenewals } = await import("@/lib/queries/amc-queries.core");
      const params = searchParams(req);
      const locationCode = params.get("locationCode") || null;
      const alertTier = params.get("alertTier") || null;
      const limit = params.get("limit") ? Number(params.get("limit")) : 50;

      const cacheKey = routeCacheKey([
        "compliance-renewals",
        context.userId,
        locationCode,
        alertTier,
        String(limit),
      ]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchComplianceRenewals>>>(cacheKey);
      if (cached) return cached;

      const payload = await fetchComplianceRenewals(context, {
        locationCode,
        alertTier,
        limit,
      });
      setRouteCache(cacheKey, payload, RENEWALS_CACHE_TTL_MS);
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
