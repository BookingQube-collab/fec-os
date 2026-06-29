import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchTaskInstances, fetchTaskTemplates } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const type = params.get("type") ?? "instances";
      const locationId = params.get("locationId") || null;
      const status = params.get("status") || null;

      if (type === "templates") {
        return fetchTaskTemplates(context, locationId);
      }
      return fetchTaskInstances(context, { locationId, status });
    },
    request,
    { capability: "tasks.view" },
  );
}
