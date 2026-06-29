import { withAuthRouteRequest } from "@/lib/server/api-route";
import { fetchBranchPnL } from "@/lib/queries/revenue.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchBranchPnL(context), request, { capability: "revenue.view" });
}
