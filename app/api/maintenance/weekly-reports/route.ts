import { createApiRoute, searchParams } from "@/lib/server/api-route";
import { fetchMaintenanceWeeklyReports } from "@/lib/queries/maintenance-weekly-reports.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      return fetchMaintenanceWeeklyReports(context, {
        weekStart: params.get("weekStart"),
        team: params.get("team"),
        status: params.get("status"),
        locationId: params.get("locationId"),
      });
    },
    request,
    {
      anyCapability: [
        "maintenance.weekly_report",
        "maintenance.weekly_report.submit",
        "maintenance.logistics_submit",
        "maintenance.weekly_report.review",
        "maintenance.weekly_report.executive",
      ],
    },
  );
}
