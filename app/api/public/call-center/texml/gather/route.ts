import { NextResponse } from "next/server";

import {
  findCallByProviderCallId,
  loadSettingsRow,
  updateCall,
} from "@/lib/call-center/db";
import { DEFAULT_TTS_VOICE, pickSpeakVoice } from "@/lib/call-center/ivr-tts-voice";
import { applyIvrDigit, routeCallToFallbackQueue } from "@/lib/call-center/routing";
import {
  parseTexmlForm,
  publicTexmlUrl,
  texmlCallIds,
  texmlConference,
  texmlGatherMenu,
  texmlHangup,
  texmlQueueWait,
} from "@/lib/call-center/texml";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

function speakVoice(prompt: string, configured?: string | null): string {
  return pickSpeakVoice(prompt, configured ?? undefined).voice;
}

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
  // TeXML voice must always get XML — JSON 401 triggers Telnyx "application error" TTS.
  if (authError) return xml(texmlHangup(""));

  const form = parseTexmlForm(rawBody, request.headers.get("content-type"));
  const ids = texmlCallIds(form);
  const settings = await loadSettingsRow();
  const configuredVoice = settings?.tts_voice?.trim() || DEFAULT_TTS_VOICE;
  const gatherUrl = publicTexmlUrl("/api/public/call-center/texml/gather", request.url);
  const holdUrl = publicTexmlUrl("/api/public/call-center/texml", request.url);

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  if (!call) {
    const msg = "We could not find your call. Please try again.";
    return xml(texmlHangup(msg, speakVoice(msg, configuredVoice)));
  }

  const digit = ids.digits.slice(0, 1);
  if (!digit) {
    try {
      const result = await routeCallToFallbackQueue(call.id);
      if (result.phase === "queue") {
        const holdPrompt = "Please hold while we connect you.";
        return xml(
          texmlQueueWait({
            holdMusicUrl: settings?.hold_music_url,
            voice: speakVoice(holdPrompt, configuredVoice),
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
        voice: speakVoice(greeting, configuredVoice),
      }),
    );
  }

  try {
    const result = await applyIvrDigit(call.id, digit);
    const next = result.call;
    const prev = (next.metadata as Record<string, unknown> | null) ?? {};
    const conferenceName =
      typeof prev.bridgeConferenceName === "string" ? prev.bridgeConferenceName.trim() : "";
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

    if (conferenceName) {
      return xml(
        texmlConference({
          name: conferenceName,
          voice: configuredVoice,
          beep: false,
          startConferenceOnEnter: true,
          endConferenceOnExit: false,
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
          voice: speakVoice(greeting, configuredVoice),
        }),
      );
    }

    if (result.phase === "queue") {
      const holdPrompt = "Please hold while we connect you.";
      return xml(
        texmlQueueWait({
          holdMusicUrl: settings?.hold_music_url,
          voice: speakVoice(holdPrompt, configuredVoice),
          redirectUrl: holdUrl,
        }),
      );
    }

    const bye = result.message || "Goodbye.";
    return xml(texmlHangup(bye, speakVoice(bye, configuredVoice)));
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
        voice: speakVoice(greeting, configuredVoice),
      }),
    );
  }
}
