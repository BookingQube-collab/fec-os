import { NextResponse } from "next/server";

import { applyIvrDigit, routeInboundCall } from "@/lib/call-center/routing";
import {
  assertCallCenterWebhook,
  extractInboundLegs,
} from "@/lib/call-center/webhook-auth";

/**
 * Telnyx inbound webhook stub.
 * POST /api/public/call-center/telnyx
 *
 * Auth: Bearer / X-Call-Center-Secret matching Admin webhook secret,
 * or TELNYX_WEBHOOK_SECRET / CALL_CENTER_WEBHOOK_SECRET.
 * Local demo without secret: ?demo=1
 *
 * Body (flexible): { from, to, callId } or Telnyx call.initiated payload.
 * Optional: { digit, callId } to apply IVR DTMF after an IVR phase.
 */
export async function POST(request: Request) {
  const authError = await assertCallCenterWebhook(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
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
      { ok: false, error: "Expected from/to (or Telnyx payload) on inbound webhook" },
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
      phase: result.phase,
      message: result.message,
      callId: result.call.id,
      livekitRoom: result.call.livekitRoom,
      offeredUserIds: result.offeredUserIds,
      status: result.call.status,
      // Stub instruction for Telnyx Call Control / TeXML when keys arrive.
      next: result.phase === "ivr"
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
    hint: "POST inbound call events. Configure Telnyx webhook URL to this path.",
  });
}
