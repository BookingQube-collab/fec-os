import { createApiRoute, searchParams } from "@/lib/server/api-route";
import { fetchAmcRenewals } from "@/lib/queries/amc-queries.core";

export async function GET(request: Request) {
  return createApiRoute(
    async (context, req) => {
      const params = searchParams(req);
      const days = params.get("days") ? Number(params.get("days")) : 30;
      return fetchAmcRenewals(context, days);
    },
    request,
    { capability: "amc.view" },
  );
}
