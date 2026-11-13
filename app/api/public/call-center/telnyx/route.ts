import { NextResponse } from "next/server";

import { handleTelnyxEvent } from "@/lib/call-center/carrier";
import { applyIvrDigit, routeInboundCall } from "@/lib/call-center/routing";
import { parseTelnyxEvent } from "@/lib/call-center/telnyx";
import {
  assertCallCenterWebhook,
  extractInboundLegs,
} from "@/lib/call-center/webhook-auth";

/**
 * Telnyx Call Control webhook.
 * POST /api/public/call-center/telnyx
 *
 * Set this URL as the webhook of your Telnyx Call Control Application.
 *
 * Auth (any one):
 *  - Telnyx ed25519 signature (telnyx-signature-ed25519 + telnyx-timestamp) when
 *    TELNYX_PUBLIC_KEY (or the public key pasted into the webhook secret field) is set.
 *  - Shared secret: Authorization: Bearer / X-Call-Center-Secret / `?secret=` query.
 *  - Local demo without a secret: ?demo=1 (or non-production).
 *
 * Real events ({ data: { event_type, payload } }) drive answer / IVR gather / hold /
 * hangup sync. Flat demo bodies still work:
 *   { from, to, callId }  → routeInboundCall (CDR + agent offer only, no carrier commands)
 *   { digit, callId }     → applyIvrDigit
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) return authError;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const demo =
    new URL(request.url).searchParams.get("demo") === "1" || process.env.NODE_ENV !== "production";

  const event = parseTelnyxEvent(body);
  if (event) {
    try {
      const result = await handleTelnyxEvent(event, { demo });
      return NextResponse.json({ ok: true, event: event.eventType, ...result });
    } catch (e) {
      // 200 so Telnyx does not retry (and re-route) the event; the error is logged and returned.
      console.error("[call-center/telnyx] event failed:", event.eventType, e);
      return NextResponse.json({
        ok: false,
        event: event.eventType,
        error: e instanceof Error ? e.message : "Event handling failed",
      });
    }
  }

  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof root.digit === "string" && typeof root.callId === "string") {
    try {
      const result = await applyIvrDigit(root.callId, root.digit);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "IVR failed" },
        { status: 400 },
      );
    }
  }

  const legs = extractInboundLegs(body);
  if (!legs.to && !legs.from) {
    return NextResponse.json(
      { ok: false, error: "Expected a Telnyx Call Control event or from/to on the inbound webhook" },
      { status: 400 },
    );
  }

  try {
    const result = await routeInboundCall({
      fromE164: legs.from || "+00000000000",
      toE164: legs.to,
      provider: "telnyx",
      providerCallId: legs.callId,
    });
    return NextResponse.json({
      ok: true,
      demo: true,
      phase: result.phase,
      message: result.message,
      callId: result.call.id,
      livekitRoom: result.call.livekitRoom,
      offeredUserIds: result.offeredUserIds,
      status: result.call.status,
      next:
        result.phase === "ivr"
          ? { action: "play_ivr", greeting: result.message }
          : { action: "bridge_livekit", room: result.call.livekitRoom },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Routing failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "fec-call-center-telnyx",
    hint: "POST Telnyx Call Control events. Configure the Call Control Application webhook URL to this path.",
  });
}
