/**
 * Verify a WebAuthn registration and store the public key for the signed-in user.
 * POST /api/auth/webauthn/register/verify
 */
import { ApiValidationError } from "@/core/api/validation";
import { withAuthRouteRequest } from "@/lib/server/api-route";
import { deviceNameFromRequest, verifyAndStoreRegistration } from "@/lib/webauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

export async function POST(request: Request) {
  return withAuthRouteRequest(async (context, req) => {
    const body = (await req.json().catch(() => null)) as { response?: RegistrationResponseJSON } | null;
    if (!body?.response?.id || !body.response.response) {
      throw new ApiValidationError("Passkey registration response is required.");
    }
    const { data } = await context.supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) {
      throw new ApiValidationError("Your session does not include an email address.");
    }
    const stored = await verifyAndStoreRegistration({
      request: req,
      userId: context.userId,
      email,
      response: body.response,
      deviceName: deviceNameFromRequest(req),
    });
    return {
      credential_id: stored.credential_id,
      user_id: context.userId,
      email,
    };
  }, request);
}
