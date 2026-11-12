import "server-only";

import { loadSettingsRow } from "./db";

/**
 * Accept inbound SIP / Telnyx webhooks when a shared secret is configured.
 * Header: Authorization: Bearer <secret> or X-Call-Center-Secret / X-Telnyx-Signature (stub).
 * Env fallbacks: CALL_CENTER_WEBHOOK_SECRET, TELNYX_WEBHOOK_SECRET.
 */
export async function assertCallCenterWebhook(request: Request): Promise<Response | null> {
  const settings = await loadSettingsRow();
  const expected =
    settings?.webhook_shared_secret?.trim() ||
    settings?.telnyx_webhook_secret?.trim() ||
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
    "";

  if (bearer === expected || headerSecret === expected) return null;

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
