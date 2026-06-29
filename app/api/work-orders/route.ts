import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchWorkOrders } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      const status = params.get("status");
      const mine = params.get("mine") === "true";
      const page = params.get("page");
      const pageSize = params.get("pageSize");
      return fetchWorkOrders(context, {
        locationId: locationId || null,
        status: status || null,
        mine,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 50,
      });
    },
    request,
    { capability: "maintenance.view" },
  );
}
