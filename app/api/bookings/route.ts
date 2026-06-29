import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchBookings } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchBookings(context, {
        locationId: params.get("locationId") || null,
        status: params.get("status") || null,
        kind: params.get("kind") || null,
        page: params.get("page") ? Number(params.get("page")) : 1,
        pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 50,
      });
    },
    request,
    { capability: "bookings.view" },
  );
}
