import { withAuthRouteRequest, searchParams } from "@/lib/server/api-route";
import { fetchEscalations, fetchNotifications } from "@/lib/queries/module-queries.core";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => {
      const params = searchParams(req);
      const kind = params.get("kind") ?? "escalations";
      if (kind === "escalations") return fetchEscalations(context);
      return fetchNotifications(context, {
        unreadOnly: params.get("unreadOnly") === "true",
        limit: params.get("limit") ? Number(params.get("limit")) : 30,
      });
    },
    request,
    { anyCapability: ["issues.view", "notifications.view"] },
  );
}
