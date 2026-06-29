import { createApiRoute } from "@/lib/server/api-route";
import { fetchWeeklyReportById } from "@/lib/queries/weekly-reports.core";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return createApiRoute(
    async (context) => fetchWeeklyReportById(context, id),
    request,
    { capability: "weekly_reports.view" },
  );
}
