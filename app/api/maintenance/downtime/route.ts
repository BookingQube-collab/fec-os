import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchDowntimeEvents } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchDowntimeEvents(context, {
        locationId: params.get("locationId") || null,
        openOnly: params.get("openOnly") === "true",
      });
    },
    request,
    { capability: "maintenance.view" },
  );
}
