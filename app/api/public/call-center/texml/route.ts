import { NextResponse } from "next/server";

import {
  findCallByProviderCallId,
  listActiveCalls,
  loadSettingsRow,
  updateCall,
} from "@/lib/call-center/db";
import { routeInboundCall } from "@/lib/call-center/routing";
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

export const maxDuration = 30;

function xml(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function conferenceNameFromForm(form: Record<string, string>): string {
  for (const [key, value] of Object.entries(form)) {
    if (/x-?fec-?conference/i.test(key) && value.trim()) return value.trim();
  }
  return "";
}

async function findAwaitingConferenceBridge(preferredName?: string) {
  const active = await listActiveCalls();
  const pending = active.filter((c) => {
    const m = (c.metadata as Record<string, unknown> | null) ?? {};
    const phase = typeof m.bridgePhase === "string" ? m.bridgePhase : "";
    const name = typeof m.bridgeConferenceName === "string" ? m.bridgeConferenceName.trim() : "";
    if (!name) return false;
    if (m.bridgeMode !== "texml_conference") return false;
    if (!["joining_conference", "joining_agent_sip"].includes(phase) && m.bridgePendingSip !== true) {
      return false;
    }
    if (preferredName && name !== preferredName) return false;
    return true;
  });
  if (preferredName) return pending.find((c) => {
    const m = (c.metadata as Record<string, unknown> | null) ?? {};
    return m.bridgeConferenceName === preferredName;
  }) ?? null;
  return pending[0] ?? null;
}

/**
 * Telnyx TeXML voice webhook — inbound IVR without Call Control Answer.
 * Answer bridge: caller stays on this leg in a TeXML Conference; softphone joins via
 * LiveKit outbound SIP to this DID (no customer callback / second ring).
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
  const outboundDid = settings?.outbound_caller_id_e164?.trim() || "";

  if (!ids.from && !ids.to) {
    return xml(texmlHangup("We are unable to take your call right now.", voice));
  }

  try {
    // Softphone join leg: LiveKit dials our DID to enter the pending conference.
    // Do not create a new CDR / IVR for this loopback.
    const headerConf = conferenceNameFromForm(form);
    const headerBridge = Object.entries(form).some(
      ([key, value]) => /x-?fec-?bridge/i.test(key) && String(value).trim(),
    );
    const digits = (value: string) => value.replace(/\D/g, "");
    const dialsOurDid =
      Boolean(outboundDid) &&
      Boolean(ids.to) &&
      (ids.to === outboundDid || digits(ids.to) === digits(outboundDid));
    const fromOurDid =
      Boolean(outboundDid) &&
      (ids.from === outboundDid ||
        digits(ids.from) === digits(outboundDid) ||
        ids.from === ids.to);
    // Softphone join = SIP headers and/or DID loopback (from+to = our CLI).
    // Do NOT treat every inbound to the DID as a join while a bridge is pending —
    // that would steal a real caller into the conference instead of IVR.
    const looksLikeBridgeJoin =
      Boolean(headerConf) || headerBridge || (dialsOurDid && fromOurDid);
    if (looksLikeBridgeJoin) {
      const pending = await findAwaitingConferenceBridge(headerConf || undefined);
      const pendingMeta = (pending?.metadata as Record<string, unknown> | null) ?? {};
      const confName =
        headerConf ||
        (typeof pendingMeta.bridgeConferenceName === "string"
          ? pendingMeta.bridgeConferenceName.trim()
          : "");
      if (confName && pending) {
        console.info(
          `[call-center/texml] conference join leg from=${ids.from} to=${ids.to} conf=${confName}`,
        );
        return xml(
          texmlConference({
            name: confName,
            voice,
            beep: false,
            startConferenceOnEnter: true,
            endConferenceOnExit: true,
          }),
        );
      }
      // Loopback/join markers with no pending Answer bridge — hang up; never start IVR.
      console.warn(
        `[call-center/texml] conference join miss from=${ids.from} to=${ids.to} header=${headerConf || "-"}`,
      );
      return xml(texmlHangup("", voice));
    }

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
    const conferenceName =
      typeof prev.bridgeConferenceName === "string" ? prev.bridgeConferenceName.trim() : "";
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
    if (!conferenceName) {
      meta.bridgeMode =
        prev.bridgeMode === "texml_conference" ? "texml_conference" : "texml_hold";
    }
    call = (await updateCall(call.id, { metadata: meta })) ?? call;

    if (call.status === "failed" || ["ended", "missed", "declined", "voicemail"].includes(call.status)) {
      return xml(texmlHangup(call.hangupReason || "Goodbye.", voice));
    }

    // Agent Answer moved this caller into a conference — keep them there on Redirect/Update.
    if (
      conferenceName &&
      (call.status === "answered" || call.status === "held" || prev.bridgePendingSip)
    ) {
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
  return POST(request);
}
