/**
 * Public WebAuthn authentication challenge (discoverable passkey or known credential ids).
 * POST /api/auth/webauthn/authenticate/options
 */
import { NextResponse } from "next/server";

import { logger } from "@/core/logger";
import { createAuthenticationOptions } from "@/lib/webauthn/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { credentialIds?: unknown } | null;
    const credentialIds = Array.isArray(body?.credentialIds)
      ? body.credentialIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const options = await createAuthenticationOptions({ request, credentialIds });
    return NextResponse.json({ options });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start device sign-in.";
    logger.warn("auth", "WebAuthn authenticate options failed", error);
    const status = /not enabled/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
