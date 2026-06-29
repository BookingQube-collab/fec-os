import { createApiRoute, searchParams } from "@/lib/server/api-route";
import { fetchExecutiveDashboard } from "@/lib/queries/weekly-reports.core";
import { weekStartMonday } from "@/lib/weekly-reports/constants";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      const weekStart = params.get("weekStart") ?? weekStartMonday();
      return fetchExecutiveDashboard(context, weekStart);
    },
    request,
    { capability: "weekly_reports.executive" },
  );
}
