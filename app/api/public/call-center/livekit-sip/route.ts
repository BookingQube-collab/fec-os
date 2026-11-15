import { NextResponse } from "next/server";

import { handleLiveKitSipEvent } from "@/lib/call-center/carrier";
import { verifyLiveKitWebhook } from "@/lib/call-center/livekit-sip";
import { applyIvrDigit, routeInboundCall } from "@/lib/call-center/routing";
import {
  assertCallCenterWebhook,
  extractInboundLegs,
} from "@/lib/call-center/webhook-auth";

/**
 * LiveKit SIP webhook + manual dispatch endpoint.
 * POST /api/public/call-center/livekit-sip
 *
 * 1. LiveKit server webhook (project Settings → Webhooks): signed JWT in `Authorization`.
 *    Events used: participant_joined / participant_left (SIP) and room_finished keep the CDR
 *    in sync, and calls that arrive straight on a LiveKit SIP trunk (Telnyx SIP Trunking)
 *    are routed (IVR / queue) into FEC.
 * 2. IVR digit ingest (shared secret): { digit, callId } — for LiveKit Agents or tools that
 *    forward RFC 2833 SipDTMF into FEC routing.
 * 3. Manual / demo: { from, to, callId } with the shared secret (or ?demo=1) creates a CDR +
 *    agent offer, as before.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const root = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  // LiveKit server webhook: has `event` and a signed Authorization JWT.
  if (typeof root.event === "string" && request.headers.get("authorization")) {
    const verdict = await verifyLiveKitWebhook(rawBody, request.headers.get("authorization"));
    if (!verdict.ok) {
      return NextResponse.json({ ok: false, error: verdict.reason }, { status: 401 });
    }
    try {
      const result = await handleLiveKitSipEvent(verdict.event);
      return NextResponse.json({ ok: true, event: verdict.event.event, ...result });
    } catch (e) {
      console.error("[call-center/livekit-sip] event failed:", e);
      return NextResponse.json({
        ok: false,
        event: root.event,
        error: e instanceof Error ? e.message : "Event handling failed",
      });
    }
  }

  const authError = await assertCallCenterWebhook(request);
  if (authError) return authError;

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
      {
        ok: false,
        error: "Expected a LiveKit webhook, {digit,callId}, or from/to on the SIP inbound payload",
      },
      { status: 400 },
    );
  }

  try {
    const result = await routeInboundCall({
      fromE164: legs.from || "+00000000000",
      toE164: legs.to,
      provider: "livekit_sip",
      providerCallId: legs.callId,
    });
    return NextResponse.json({
      ok: true,
      phase: result.phase,
      message: result.message,
      callId: result.call.id,
      roomName: result.call.livekitRoom,
      offeredUserIds: result.offeredUserIds,
      status: result.call.status,
      dispatch: {
        room: result.call.livekitRoom,
        // Agents join via softphone token; the SIP participant should join the same room.
        participantIdentity: `sip-${result.call.id.slice(0, 8)}`,
      },
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
    service: "fec-call-center-livekit-sip",
    hint: "Point the LiveKit project webhook here (participant_joined / participant_left / room_finished).",
  });
}
