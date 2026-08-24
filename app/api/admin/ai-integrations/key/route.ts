import { AI_INTEGRATIONS_AUTH } from "@/lib/ai/types";
import { removeAiProviderKey } from "@/lib/queries/ai-integrations.core";
import { withAuthRouteRequest } from "@/lib/server/api-route";

export async function DELETE(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => removeAiProviderKey(context, req),
    request,
    AI_INTEGRATIONS_AUTH,
  );
}
