import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchDocumentExpiryKpis, fetchExpiryAlerts } from "@/lib/queries/expiry-alerts.core";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const EXPIRY_KPI_CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId") || null;

      if (params.get("kpisOnly") === "true") {
        const cacheKey = routeCacheKey(["expiry-kpis", context.userId, locationId ?? "all"]);
        const cached = getRouteCache<Awaited<ReturnType<typeof fetchDocumentExpiryKpis>>>(cacheKey);
        if (cached) return cached;
        const payload = await fetchDocumentExpiryKpis(context, locationId);
        setRouteCache(cacheKey, payload, EXPIRY_KPI_CACHE_TTL_MS);
        return payload;
      }

      return fetchExpiryAlerts(context, {
        locationId,
        limit: params.get("limit") ? Number(params.get("limit")) : 100,
      });
    },
    request,
    { capability: "compliance.view" },
  );

  if (response.status === 200) {
    response.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  }
  return response;
}
