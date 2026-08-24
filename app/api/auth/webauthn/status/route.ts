/**
 * Whether the signed-in user already has a registered passkey.
 * GET /api/auth/webauthn/status
 */
import { withAuthRouteRequest } from "@/lib/server/api-route";
import { listUserCredentials } from "@/lib/webauthn/server";

export async function GET(request: Request) {
  return withAuthRouteRequest(async (context) => {
    const credentials = await listUserCredentials(context.userId);
    return { registered: credentials.length > 0, count: credentials.length };
  }, request);
}
