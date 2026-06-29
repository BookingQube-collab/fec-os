import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchInventoryItems, fetchInventoryStock, fetchInventoryAlerts } from "@/lib/queries/inventory.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId") || null;
      const view = params.get("view");
      if (view === "alerts") return fetchInventoryAlerts(context, locationId);
      if (view === "stock") {
        return fetchInventoryStock(context, locationId, {
          size: params.get("size") || null,
          status: params.get("status") || "all",
        });
      }
      return fetchInventoryItems(context, params.get("activeOnly") !== "false");
    },
    request,
    { capability: "inventory.view" },
  );
}
