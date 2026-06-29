import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchRiskRegister, fetchRiskSummary } from "@/lib/queries/risk.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters = {
        locationId: params.get("locationId") || null,
        minScore: params.get("minScore") ? Number(params.get("minScore")) : undefined,
        status: params.get("status") || null,
      };
      if (params.get("summary") === "true") return fetchRiskSummary(context, filters);
      return fetchRiskRegister(context, filters);
    },
    request,
    { capability: "risk.view" },
  );
}
