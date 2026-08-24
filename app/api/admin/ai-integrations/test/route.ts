import { AI_INTEGRATIONS_AUTH } from "@/lib/ai/types";
import { testAiProvider } from "@/lib/queries/ai-integrations.core";
import { withAuthRouteRequest } from "@/lib/server/api-route";

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => testAiProvider(context, req),
    request,
    AI_INTEGRATIONS_AUTH,
  );
}
