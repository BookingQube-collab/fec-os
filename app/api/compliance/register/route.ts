import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplianceRegister, fetchComplianceRegisterKpis } from "@/lib/queries/compliance-register.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const filters = {
        locationCode: params.get("locationCode") || null,
        domain: params.get("domain") || null,
        vendor: params.get("vendor") || null,
        status: params.get("status") || null,
        risk: params.get("risk") || null,
      };
      if (params.get("kpisOnly") === "true") {
        return fetchComplianceRegisterKpis(context, filters);
      }
      return fetchComplianceRegister(context, filters);
    },
    request,
    { capability: "compliance.view" },
  );
}
