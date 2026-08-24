/**
 * Create WebAuthn registration options for the signed-in user.
 * POST /api/auth/webauthn/register/options
 */
import { withAuthRouteRequest } from "@/lib/server/api-route";
import { createRegistrationOptions } from "@/lib/webauthn/server";

export async function POST(request: Request) {
  return withAuthRouteRequest(async (context, req) => {
    const { data, error } = await context.supabase.auth.getUser();
    const email = data.user?.email;
    if (error || !email) {
      throw new Error("Your session does not include an email address.");
    }
    const options = await createRegistrationOptions({
      request: req,
      userId: context.userId,
      email,
      displayName: typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : email,
    });
    return { options };
  }, request);
}
