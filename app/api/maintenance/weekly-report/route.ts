import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import {
  fetchMaintenanceWeeklyReport,
  type MaintenanceWeeklyReportFilters,
} from "@/lib/queries/maintenance-weekly-report.core";

function parseFilters(params: URLSearchParams): MaintenanceWeeklyReportFilters {
  return {
    locationId: params.get("locationId") || null,
    weekStart: params.get("weekStart") || null,
  };
}

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => fetchMaintenanceWeeklyReport(context, parseFilters(searchParams(req))),
    request,
    { capability: "maintenance.weekly_report" },
  );
}
