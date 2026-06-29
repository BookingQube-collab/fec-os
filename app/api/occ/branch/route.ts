import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchBranchPack } from "@/lib/queries/occ.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const locationId = searchParams(req).get("locationId");
      if (!locationId) throw new Error("locationId required");
      return fetchBranchPack(context, locationId);
    },
    request,
    { capability: "occ.view_branch" },
  );
}
