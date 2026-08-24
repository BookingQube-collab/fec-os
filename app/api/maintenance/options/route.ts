import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchMaintenanceOptions } from "@/lib/queries/maintenance-options.core";
import type { MaintenanceOptionKind } from "@/lib/maintenance/request-options";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const kindParam = params.get("kind");
      const kind: MaintenanceOptionKind =
        kindParam === "issue_type" ? "issue_type" : "category";
      const activeOnly = params.get("activeOnly") === "true";
      return fetchMaintenanceOptions(context, { kind, activeOnly });
    },
    request,
    {
      anyCapability: [
        "maintenance.request_submit",
        "maintenance.view",
        "maintenance.manage",
      ],
    },
  );
}
