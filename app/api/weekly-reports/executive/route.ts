import { createApiRoute, searchParams } from "@/lib/server/api-route";
import {
  fetchExecutiveReportDetail,
  fetchExecutiveReports,
} from "@/lib/queries/weekly-reports.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      const id = params.get("id");
      if (id) return fetchExecutiveReportDetail(context, id);
      return fetchExecutiveReports(context, params.get("weekStart"));
    },
    request,
    { capability: "weekly_reports.executive" },
  );
}
