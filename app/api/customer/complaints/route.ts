import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplaints } from "@/lib/queries/customer.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchComplaints(context, {
        locationId: params.get("locationId") || null,
        status: params.get("status") || null,
      });
    },
    request,
    { capability: "customer.view_complaints" },
  );
}
