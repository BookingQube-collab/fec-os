import { createApiRouteStatic } from "@/lib/server/api-route";
import { fetchEscalations } from "@/lib/queries/module-queries.core";

export async function GET() {
  return createApiRouteStatic(async (context) => fetchEscalations(context), {
    capability: "issues.view",
  });
}
