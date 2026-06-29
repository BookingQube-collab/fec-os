import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplianceExpiryNotifications } from "@/lib/queries/compliance-expiry-notifications.core";
import { getRouteCache, routeCacheKey, setRouteCache } from "@/lib/server/route-cache";

const CACHE_TTL_MS = 60_000;

export async function GET(request: Request) {
  const response = await withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId") || null;
      const summaryOnly = params.get("summaryOnly") === "true";
      const limit = params.get("limit") ? Number(params.get("limit")) : 25;

      const cacheKey = routeCacheKey([
        "compliance-expiry-notifications",
        context.userId,
        locationId ?? "all",
        summaryOnly ? "summary" : "full",
        String(limit),
      ]);
      const cached = getRouteCache<Awaited<ReturnType<typeof fetchComplianceExpiryNotifications>>>(cacheKey);
      if (cached) return cached;

      const payload = await fetchComplianceExpiryNotifications(context, {
        locationId,
        limit,
        summaryOnly,
      });
      setRouteCache(cacheKey, payload, CACHE_TTL_MS);
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
