import { NextResponse } from "next/server";

import { findCallByProviderCallId, loadSettingsRow } from "@/lib/call-center/db";
import {
  parseTexmlForm,
  publicTexmlUrl,
  texmlCallIds,
  texmlConference,
  texmlHangup,
  texmlQueueWait,
} from "@/lib/call-center/texml";
import { assertCallCenterWebhook } from "@/lib/call-center/webhook-auth";

export const maxDuration = 15;

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

/**
 * TeXML Update Call Url fallback for same-leg Answer bridge.
 * Prefer inline `<Dial><Conference>` from carrier.ts — Url fetches that return JSON 401
 * make Telnyx play its default "application error" apology on the PSTN leg.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) {
    // Never return JSON to a TeXML voice fetch — that triggers Telnyx's apology TTS.
    return xml(texmlHangup(""));
  }

  const form = parseTexmlForm(rawBody, request.headers.get("content-type"));
  const ids = texmlCallIds(form);
  const settings = await loadSettingsRow();
  const voice = settings?.tts_voice?.trim() || "Polly.Joanna";
  const holdUrl = publicTexmlUrl("/api/public/call-center/texml", request.url);
  const confFromQuery = new URL(request.url).searchParams.get("conf")?.trim() || "";

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  const meta = (call?.metadata as Record<string, unknown> | null) ?? {};
  const conferenceName =
    confFromQuery ||
    (typeof meta.bridgeConferenceName === "string" ? meta.bridgeConferenceName.trim() : "");

  if (!conferenceName) {
    if (!call) return xml(texmlHangup(""));
    return xml(
      texmlQueueWait({
        holdMusicUrl: settings?.hold_music_url,
        voice,
        redirectUrl: holdUrl,
        pauseSeconds: 2,
      }),
    );
  }

  return xml(
    texmlConference({
      name: conferenceName,
      voice,
      beep: false,
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      maxParticipants: 2,
      participantLabel: "caller",
    }),
  );
}

export async function GET(request: Request) {
  return POST(request);
}
