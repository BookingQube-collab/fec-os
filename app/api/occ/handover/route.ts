import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchHandoverDigest, fetchHandovers } from "@/lib/queries/occ.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      if (!locationId) throw new Error("locationId required");
      if (params.get("list") === "true") return fetchHandovers(context, locationId);
      return fetchHandoverDigest(context, locationId);
    },
    request,
    { capability: "occ.view_branch" },
  );
}
