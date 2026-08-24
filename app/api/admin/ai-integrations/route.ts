import { AI_INTEGRATIONS_AUTH } from "@/lib/ai/types";
import { fetchAiIntegrations, upsertAiProvider } from "@/lib/queries/ai-integrations.core";
import { withAuthRouteRequest } from "@/lib/server/api-route";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => fetchAiIntegrations(context), request, AI_INTEGRATIONS_AUTH);
}

export async function POST(request: Request) {
  return withAuthRouteRequest(
    async (context, req) => upsertAiProvider(context, req),
    request,
    AI_INTEGRATIONS_AUTH,
  );
}
