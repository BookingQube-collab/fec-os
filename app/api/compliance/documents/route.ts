import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchComplianceDocuments } from "@/lib/queries/compliance-documents.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      return fetchComplianceDocuments(context, {
        locationId: params.get("locationId") || null,
        status: params.get("status") || null,
        documentType: params.get("documentType") || null,
        renewalStatus: params.get("renewalStatus") || null,
        paymentStatus: params.get("paymentStatus") || null,
        contractId: params.get("contractId") || null,
        search: params.get("search") || null,
        page: params.get("page") ? Number(params.get("page")) : 1,
        pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : 50,
      });
    },
    request,
    { capability: "compliance.view" },
  );
}
