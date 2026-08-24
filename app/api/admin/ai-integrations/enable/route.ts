import { AI_INTEGRATIONS_AUTH } from "@/lib/ai/types";
import { enableAiProvider } from "@/lib/queries/ai-integrations.core";
import { withAuthRouteRequest } from "@/lib/server/api-route";

export async function PATCH(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => enableAiProvider(context, req),
    request,
    AI_INTEGRATIONS_AUTH,
  );
}
