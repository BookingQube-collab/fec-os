/**
 * Verify a WebAuthn assertion and mint a Supabase session for that user.
 * POST /api/auth/webauthn/authenticate/verify
 */
import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { logger } from "@/core/logger";
import { verifyAuthenticationAndMintSession } from "@/lib/webauthn/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      response?: AuthenticationResponseJSON;
    } | null;
    if (!body?.response?.id || !body.response.response) {
      return NextResponse.json({ error: "Passkey assertion is required." }, { status: 400 });
    }
    const session = await verifyAuthenticationAndMintSession({
      request,
      response: body.response,
    });
    return NextResponse.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Device sign-in failed.";
    logger.warn("auth", "WebAuthn authenticate verify failed", error);
    const status = /not enabled/i.test(message) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
