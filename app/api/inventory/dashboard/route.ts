import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchInventoryDashboard,
  type InventoryDashboardFilters,
} from "@/lib/queries/inventory-dashboard.core";

function parseFilters(params: URLSearchParams): InventoryDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => fetchInventoryDashboard(context, parseFilters(searchParams(req))),
    request,
    { capability: "inventory.view" },
  );
}
