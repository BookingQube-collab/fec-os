import "server-only";

import { loadSettingsRow } from "./db";
import { resolveTelnyxPublicKey, safeEqual, verifyTelnyxSignature } from "./telnyx";

/**
 * Accept inbound SIP / Telnyx webhooks when a shared secret is configured.
 * Header: Authorization: Bearer <secret> or X-Call-Center-Secret, or `?secret=` on the URL
 * (Telnyx / LiveKit webhook URLs cannot add custom headers).
 * Telnyx Call Control events may instead be verified with the ed25519 signature
 * (`telnyx-signature-ed25519` + `telnyx-timestamp`) when TELNYX_PUBLIC_KEY (or the webhook
 * secret field holding the public key) is set. Pass `rawBody` for that check.
 * Env fallbacks: CALL_CENTER_WEBHOOK_SECRET, TELNYX_WEBHOOK_SECRET.
 */
export async function assertCallCenterWebhook(
  request: Request,
  options: { rawBody?: string } = {},
): Promise<Response | null> {
  const settings = await loadSettingsRow();

  const signature = request.headers.get("telnyx-signature-ed25519")?.trim() ?? "";
  const timestamp = request.headers.get("telnyx-timestamp")?.trim() ?? "";
  const publicKey = resolveTelnyxPublicKey(settings);
  if (signature && timestamp && publicKey && options.rawBody !== undefined) {
    const valid = verifyTelnyxSignature({
      rawBody: options.rawBody,
      signature,
      timestamp,
      publicKey,
    });
    if (valid) return null;
    return Response.json({ ok: false, error: "Invalid Telnyx signature" }, { status: 401 });
  }

  const storedWebhookSecret = settings?.telnyx_webhook_secret?.trim() ?? "";
  const expected =
    settings?.webhook_shared_secret?.trim() ||
    (storedWebhookSecret && storedWebhookSecret !== publicKey ? storedWebhookSecret : "") ||
    process.env.CALL_CENTER_WEBHOOK_SECRET?.trim() ||
    process.env.TELNYX_WEBHOOK_SECRET?.trim() ||
    "";

  if (!expected) {
    // Allow local demos when nothing is configured, but refuse production unknowns softly
    // by requiring ?demo=1 so accidental open relays are less likely.
    const url = new URL(request.url);
    if (url.searchParams.get("demo") === "1" || process.env.NODE_ENV !== "production") {
      return null;
    }
    return Response.json(
      {
        ok: false,
        error:
          "Call Center webhook secret not configured. Set Admin → Call Center webhook secret or CALL_CENTER_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerSecret =
    request.headers.get("x-call-center-secret")?.trim() ||
    request.headers.get("x-telnyx-signature")?.trim() ||
    new URL(request.url).searchParams.get("secret")?.trim() ||
    "";

  if ((bearer && safeEqual(bearer, expected)) || (headerSecret && safeEqual(headerSecret, expected))) {
    return null;
  }

  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export function pickE164(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Best-effort extract from Telnyx or LiveKit SIP JSON shapes. */
export function extractInboundLegs(body: unknown): { from: string; to: string; callId: string } {
  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const data = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const payload =
    data.payload && typeof data.payload === "object"
      ? (data.payload as Record<string, unknown>)
      : data;

  const from =
    pickE164(payload.from) ||
    pickE164(payload.caller_id_number) ||
    pickE164(payload.from_number) ||
    pickE164(root.from) ||
    "";
  const to =
    pickE164(payload.to) ||
    pickE164(payload.called_number) ||
    pickE164(payload.to_number) ||
    pickE164(root.to) ||
    "";
  const callId =
    pickE164(payload.call_control_id) ||
    pickE164(payload.call_session_id) ||
    pickE164(payload.sipCallId) ||
    pickE164(root.callId) ||
    pickE164(root.id) ||
    "";

  return { from, to, callId };
}
