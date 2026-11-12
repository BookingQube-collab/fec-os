import { NextResponse } from "next/server";

import { routeInboundCall } from "@/lib/call-center/routing";
import {
  assertCallCenterWebhook,
  extractInboundLegs,
} from "@/lib/call-center/webhook-auth";

/**
 * LiveKit SIP dispatch / inbound stub.
 * POST /api/public/call-center/livekit-sip
 *
 * When LiveKit SIP trunk + dispatch rule are configured, point the webhook
 * (or a thin worker) here so FEC can create CDR + offer agents + return room name.
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

  const legs = extractInboundLegs(body);
  if (!legs.to && !legs.from) {
    return NextResponse.json(
      { ok: false, error: "Expected from/to on LiveKit SIP inbound payload" },
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
        // Agents join via softphone token; SIP participant should join the same room.
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
    hint: "POST SIP dispatch events. Set LiveKit SIP trunk id in Admin → Call Center.",
  });
}
