import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchLocationAreas } from "@/lib/queries/location-areas.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      const activeOnly = params.get("activeOnly") === "true";
      return fetchLocationAreas(context, {
        locationId: locationId || null,
        activeOnly,
      });
    },
    request,
    {
      anyCapability: [
        "maintenance.request_submit",
        "maintenance.view",
        "maintenance.manage",
      ],
    },
  );
}
