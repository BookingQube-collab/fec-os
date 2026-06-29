import { createApiRoute, searchParams } from "@/lib/server/api-route";
import {
  fetchMaintenanceExecutiveReportDetail,
  fetchMaintenanceExecutiveReports,
} from "@/lib/queries/maintenance-weekly-reports.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      const id = params.get("id");
      if (id) return fetchMaintenanceExecutiveReportDetail(context, id);
      return fetchMaintenanceExecutiveReports(context, params.get("weekStart"));
    },
    request,
    { capability: "maintenance.weekly_report.executive" },
  );
}
