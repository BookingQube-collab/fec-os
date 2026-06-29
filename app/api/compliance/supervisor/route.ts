import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchSupervisorConsole } from "@/lib/queries/compliance-register.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const locationId = params.get("locationId");
      if (!locationId) throw new Error("locationId required");
      return fetchSupervisorConsole(context, locationId);
    },
    request,
    { capability: "tasks.complete" },
  );
}
