import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchDailyOpsRoster,
  fetchDailyOpsRosterUploads,
  fetchDailyOpsShiftRoster,
} from "@/lib/queries/daily-ops.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      const view = params.get("view") ?? "staff";

      if (view === "shifts") {
        return fetchDailyOpsShiftRoster(
          context,
          locationId,
          params.get("from"),
          params.get("to"),
        );
      }
      if (view === "uploads") {
        return fetchDailyOpsRosterUploads(context, locationId);
      }
      return fetchDailyOpsRoster(context, locationId);
    },
    request,
    { capability: "daily_ops.view" },
  );
}
