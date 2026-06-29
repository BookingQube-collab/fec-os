import { createApiRoute, searchParams } from "@/lib/server/api-route";
import {
  fetchExecutiveDashboard,
  fetchExecutiveReportDetail,
  fetchExecutiveReports,
  fetchWeeklyReportById,
  fetchWeeklyReports,
} from "@/lib/queries/weekly-reports.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      return fetchWeeklyReports(context, {
        weekStart: params.get("weekStart"),
        locationId: params.get("locationId"),
        status: params.get("status"),
      });
    },
    request,
    { capability: "weekly_reports.view" },
  );
}
