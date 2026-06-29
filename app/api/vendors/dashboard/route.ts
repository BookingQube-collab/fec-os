import { createApiRoute, searchParams } from "@/lib/server/api-route";
import { fetchVendorDashboard } from "@/lib/queries/vendors-api.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      return fetchVendorDashboard(context, params.get("locationId") || null);
    },
    request,
    { capability: "vendors.view" },
  );
}
