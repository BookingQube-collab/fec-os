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
 * TeXML Update Call Url target for same-leg Answer bridge.
 * Puts the live inbound PSTN leg into a named conference (no customer redial).
 * Softphone joins the same conference via LiveKit outbound SIP → this DID.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = await assertCallCenterWebhook(request, { rawBody });
  if (authError) return authError;

  const form = parseTexmlForm(rawBody, request.headers.get("content-type"));
  const ids = texmlCallIds(form);
  const settings = await loadSettingsRow();
  const voice = settings?.tts_voice?.trim() || "Polly.Joanna";
  const holdUrl = publicTexmlUrl("/api/public/call-center/texml", request.url);

  const call =
    (ids.callControlId ? await findCallByProviderCallId(ids.callControlId) : null) ||
    (ids.callSid ? await findCallByProviderCallId(ids.callSid) : null);

  if (!call) {
    return xml(texmlHangup("We could not find your call.", voice));
  }

  const meta = (call.metadata as Record<string, unknown> | null) ?? {};
  const conferenceName =
    typeof meta.bridgeConferenceName === "string" ? meta.bridgeConferenceName.trim() : "";
  if (!conferenceName) {
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
    }),
  );
}

export async function GET(request: Request) {
  return POST(request);
}
