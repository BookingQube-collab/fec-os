import { NextResponse } from "next/server";

import {
  findCallByProviderCallId,
  loadSettingsRow,
  updateCall,
} from "@/lib/call-center/db";
import { applyIvrDigit, routeCallToFallbackQueue } from "@/lib/call-center/routing";
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
 * TeXML <Gather> action — DTMF digit → FEC IVR routing.
 * POST /api/public/call-center/texml/gather
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
  const holdUrl = publicTexmlUrl("/api/public/call-center/texml", request.url);

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  if (!call) {
    return xml(texmlHangup("We could not find your call. Please try again.", voice));
  }

  const digit = ids.digits.slice(0, 1);
  if (!digit) {
    try {
      const result = await routeCallToFallbackQueue(call.id);
      if (result.phase === "queue") {
        return xml(
          texmlQueueWait({
            holdMusicUrl: settings?.hold_music_url,
            voice,
            redirectUrl: holdUrl,
          }),
        );
      }
    } catch {
      // fall through to repeat
    }
    const meta = (call.metadata as Record<string, unknown> | null) ?? {};
    const greeting =
      (typeof meta.ivrGreeting === "string" && meta.ivrGreeting) || "Please choose an option.";
    return xml(
      texmlGatherMenu({
        actionUrl: gatherUrl,
        timeoutRedirectUrl: holdUrl,
        prompt: greeting,
        voice,
      }),
    );
  }

  try {
    const result = await applyIvrDigit(call.id, digit);
    const next = result.call;
    const prev = (next.metadata as Record<string, unknown> | null) ?? {};
    const dialUri =
      typeof prev.texmlDialSipUri === "string" ? prev.texmlDialSipUri.trim() : "";
    const meta: Record<string, unknown> = {
      ...prev,
      carrierAnswered: true,
      texml: true,
      texmlCallSid: ids.callSid,
      texmlCallControlId: ids.callControlId,
      ...(ids.accountSid ? { texmlAccountSid: ids.accountSid } : {}),
      lastTexmlDigit: digit,
    };
    await updateCall(next.id, { metadata: meta });

    if (dialUri) {
      const callerId =
        settings?.outbound_caller_id_e164?.trim() ||
        (next.toE164?.startsWith("+") ? next.toE164 : "") ||
        ids.to ||
        "";
      return xml(
        texmlDialSip({
          sipUri: dialUri,
          callerId,
          voice,
          timeoutSeconds: 35,
          failureRedirectUrl: holdUrl,
        }),
      );
    }

    if (result.phase === "ivr") {
      const greeting =
        (typeof meta.ivrGreeting === "string" && meta.ivrGreeting) ||
        result.message ||
        "Please choose an option.";
      return xml(
        texmlGatherMenu({
          actionUrl: gatherUrl,
          timeoutRedirectUrl: holdUrl,
          prompt: greeting,
          voice,
        }),
      );
    }

    if (result.phase === "queue") {
      return xml(
        texmlQueueWait({
          holdMusicUrl: settings?.hold_music_url,
          voice,
          redirectUrl: holdUrl,
        }),
      );
    }

    return xml(texmlHangup(result.message || "Goodbye.", voice));
  } catch (e) {
    console.error("[call-center/texml/gather] failed:", e);
    const meta = (call.metadata as Record<string, unknown> | null) ?? {};
    const greeting =
      (typeof meta.ivrGreeting === "string" && meta.ivrGreeting) || "Please choose an option.";
    return xml(
      texmlGatherMenu({
        actionUrl: gatherUrl,
        timeoutRedirectUrl: holdUrl,
        prompt: greeting,
        voice,
      }),
    );
  }
}
