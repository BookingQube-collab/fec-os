import { createApiRoute } from "@/lib/server/api-route";
import { fetchMaintenanceWeeklyReportById } from "@/lib/queries/maintenance-weekly-reports.core";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createApiRoute(
    async (context) => fetchMaintenanceWeeklyReportById(context, id),
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
