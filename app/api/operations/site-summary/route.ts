import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchSiteSummary } from "@/lib/queries/operations-dashboard.core";
import type { DashboardPeriod } from "@/lib/dashboard.functions";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      if (!locationId) {
        throw new Error("locationId is required");
      }
      return fetchSiteSummary(context, locationId, {
        period: (params.get("period") ?? "today") as DashboardPeriod,
        locationId,
      });
    },
    request,
    { capability: "dashboard.view" },
  );
}
