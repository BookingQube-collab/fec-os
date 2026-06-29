import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchMonthlyRevenueProgress } from "@/lib/queries/revenue.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const locationId = searchParams(req).get("locationId") || null;
      return fetchMonthlyRevenueProgress(context, locationId);
    },
    request,
    { capability: "revenue.view" },
  );
}
