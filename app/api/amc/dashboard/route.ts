import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchAmcDashboard, type AmcDashboardFilters } from "@/lib/queries/amc-dashboard.core";

function parseFilters(params: URLSearchParams): AmcDashboardFilters {
  return {
    locationId: params.get("locationId") || null,
    region: params.get("region") || null,
    category: params.get("category") || null,
    vendor: params.get("vendor") || null,
    status: params.get("status") || null,
    paymentStatus: params.get("paymentStatus") || null,
    search: params.get("search") || undefined,
    activeOnly: params.get("activeOnly") === "true",
    overdueOnly: params.get("overdueOnly") === "true",
    dueThisWeek: params.get("dueThisWeek") === "true",
    dueThisMonth: params.get("dueThisMonth") === "true",
    expiringSoon: params.get("expiringSoon") === "true",
  };
}

/** @deprecated Prefer /api/amc/dashboard/summary + /contracts */
export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => fetchAmcDashboard(context, parseFilters(searchParams(req))),
    request,
    { capability: "amc.view" },
  );
}
