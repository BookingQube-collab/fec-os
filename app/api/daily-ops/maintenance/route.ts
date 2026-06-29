import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchDailyOpsMaintenance } from "@/lib/queries/daily-ops.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      return fetchDailyOpsMaintenance(context, locationId);
    },
    request,
    { capability: "daily_ops.view" },
  );
}
