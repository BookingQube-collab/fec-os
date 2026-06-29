import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplianceCalendarMonth } from "@/lib/queries/compliance-register.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchComplianceCalendarMonth(context, {
        year: Number(params.get("year")),
        month: Number(params.get("month")),
        locationCode: params.get("locationCode") || null,
      });
    },
    request,
    { capability: "compliance.view" },
  );
}
