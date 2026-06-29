import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchOperationsDashboard } from "@/lib/queries/operations-dashboard.core";
import type { DashboardPeriod } from "@/lib/dashboard.functions";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchOperationsDashboard(context, {
        period: (params.get("period") ?? "today") as DashboardPeriod,
        locationId: params.get("locationId") || null,
        view: (params.get("view") as "estate" | "branch" | "maintenance" | "tasks" | "hr" | "customer") || undefined,
      });
    },
    request,
    { capability: "dashboard.view" },
  );
}
