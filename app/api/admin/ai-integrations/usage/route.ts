import { AI_INTEGRATIONS_AUTH } from "@/lib/ai/types";
import { fetchAiIntegrations } from "@/lib/queries/ai-integrations.core";
import { withAuthRouteRequest } from "@/lib/server/api-route";

export async function GET(request: Request) {
  return withAuthRouteRequest(
    async (context) => {
      const snapshot = await fetchAiIntegrations(context);
      return { usage: snapshot.usage, cost_is_estimate: true };
    },
    request,
    AI_INTEGRATIONS_AUTH,
  );
}
