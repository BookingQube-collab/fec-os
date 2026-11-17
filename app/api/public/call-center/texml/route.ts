import { NextResponse } from "next/server";

import {
  findCallByProviderCallId,
  loadSettingsRow,
  updateCall,
} from "@/lib/call-center/db";
import { routeInboundCall } from "@/lib/call-center/routing";
import {
  parseTexmlForm,
  publicTexmlUrl,
  texmlCallIds,
  texmlDialSip,
  texmlGatherMenu,
  texmlHangup,
  texmlQueueWait,
} from "@/lib/call-center/texml";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

export const maxDuration = 30;

function xml(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * Telnyx TeXML voice webhook — inbound IVR without Call Control Answer.
 * POST /api/public/call-center/texml
 *
 * When an agent Answers, carrier sets `texmlDialSipUri` and (optionally) Updates this
 * call so the next instruction set is `<Dial><Sip>…LiveKit…</Sip></Dial>` on the
 * *same* PSTN leg — no hangup + connect-back dial (which got 486 User Busy).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) return authError;

  const form = parseTexmlForm(rawBody, request.headers.get("content-type"));
  const ids = texmlCallIds(form);
  const settings = await loadSettingsRow();
  const voice = settings?.tts_voice?.trim() || "Polly.Joanna";
  const gatherUrl = publicTexmlUrl("/api/public/call-center/texml/gather", request.url);
  const selfUrl = publicTexmlUrl("/api/public/call-center/texml", request.url);

  if (!ids.from && !ids.to) {
    return xml(texmlHangup("We are unable to take your call right now.", voice));
  }

  try {
    let call =
      (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
      (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

    if (!call) {
      const result = await routeInboundCall({
        fromE164: ids.from || "+00000000000",
        toE164: ids.to || "+18704772102",
        provider: "telnyx",
        providerCallId: ids.callControlId || ids.callSid,
      });
      call = result.call;
    }

    const prev = (call.metadata as Record<string, unknown> | null) ?? {};
    const dialUri =
      typeof prev.texmlDialSipUri === "string" ? prev.texmlDialSipUri.trim() : "";
    const meta: Record<string, unknown> = {
      ...prev,
      carrierAnswered: true,
      carrierAnsweredAt:
        typeof prev.carrierAnsweredAt === "string"
          ? prev.carrierAnsweredAt
          : new Date().toISOString(),
      texml: true,
      texmlCallSid: ids.callSid || prev.texmlCallSid,
      texmlCallControlId: ids.callControlId || prev.texmlCallControlId,
      ...(ids.accountSid ? { texmlAccountSid: ids.accountSid } : {}),
    };
    if (!dialUri) {
      meta.bridgeMode = prev.bridgeMode === "texml_dial_sip" ? "texml_dial_sip" : "texml_hold";
    }
    call = (await updateCall(call.id, { metadata: meta })) ?? call;

    if (call.status === "failed" || ["ended", "missed", "declined", "voicemail"].includes(call.status)) {
      return xml(texmlHangup(call.hangupReason || "Goodbye.", voice));
    }

    // Agent Answer requested a LiveKit SIP bridge — Dial on the live inbound leg.
    if (dialUri && (call.status === "answered" || call.status === "held" || prev.bridgePendingSip)) {
      const callerId =
        settings?.outbound_caller_id_e164?.trim() ||
        (call.toE164?.startsWith("+") ? call.toE164 : "") ||
        ids.to ||
        "";
      return xml(
        texmlDialSip({
          sipUri: dialUri,
          callerId,
          voice,
          timeoutSeconds: 35,
          failureRedirectUrl: selfUrl,
        }),
      );
    }

    if (call.status === "ivr") {
      const greeting =
        (typeof meta.ivrGreeting === "string" && meta.ivrGreeting) ||
        settings?.tts_greeting_text ||
        "Please choose an option.";
      return xml(
        texmlGatherMenu({
          actionUrl: gatherUrl,
          timeoutRedirectUrl: selfUrl,
          prompt: greeting,
          voice,
        }),
      );
    }

    // queued / ringing / offered / connecting — hold until agent Answers.
    return xml(
      texmlQueueWait({
        holdMusicUrl: settings?.hold_music_url,
        voice,
        redirectUrl: selfUrl,
        pauseSeconds: call.status === "answered" || call.status === "held" ? 2 : 3,
      }),
    );
  } catch (e) {
    console.error("[call-center/texml] inbound failed:", e);
    return xml(texmlHangup("We are unable to take your call right now.", voice));
  }
}

export async function GET(request: Request) {
  // Telnyx may probe with GET when voice_method is get; keep POST as primary.
  return POST(request);
}
