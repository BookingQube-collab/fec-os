import "server-only";

import { CarrierNotConfiguredError, TelnyxApiError } from "./carrier-errors";
import {
  findCallByLivekitRoom,
  findCallByProviderCallId,
  getAgentStatus,
  getCall,
  listIvrMenus,
  loadSettingsRow,
  setAgentStatus,
  updateCall,
} from "./db";
import {
  buildLiveKitSipUri,
  CALL_CENTER_ROOM_PREFIX,
  deleteLiveKitRoom,
  dialOutboundSip,
} from "./livekit-sip";
import { applyIvrDigit, routeCallToFallbackQueue, routeInboundCall } from "./routing";
import { createTelnyxClient, resolveTelnyxApiKey, type TelnyxClient, type TelnyxEvent } from "./telnyx";
import type { CallCenterCall, CallCenterSettingsRow, InboundRouteResult } from "./types";

/**
 * Carrier orchestration: Telnyx Call Control events → FEC routing (routing.ts) → LiveKit room.
 *
 * Inbound  : call.initiated → route + answer → greeting / IVR gather / hold music →
 *            (agent answers in softphone) → Telnyx `transfer` to LiveKit SIP → caller joins the cc-… room.
 * Outbound : softphone → placeOutboundCall → LiveKit createSipParticipant (outbound trunk → Telnyx).
 * CDR sync : Telnyx call.hangup + LiveKit participant_left / room_finished webhooks.
 */

const FINAL_STATUSES = new Set(["ended", "missed", "declined", "failed", "voicemail"]);
const WAITING_STATUSES = new Set(["ringing", "queued", "offered"]);
const DEFAULT_VOICEMAIL_PROMPT =
  "Thank you for calling. We are unable to take your call right now. Please call back later.";
const DEFAULT_IVR_PROMPT = "Please choose an option.";
const MAX_SPEAK_CHARS = 1500;

export type CarrierEventResult = {
  handled: boolean;
  note: string;
  callId?: string;
  actions: string[];
};

function isFinal(status: string): boolean {
  return FINAL_STATUSES.has(status);
}

function metaOf(call: CallCenterCall): Record<string, unknown> {
  return (call.metadata as Record<string, unknown> | null) ?? {};
}

function clip(text: string): string {
  return text.trim().slice(0, MAX_SPEAK_CHARS);
}

async function patchMeta(callId: string, patch: Record<string, unknown>): Promise<CallCenterCall | null> {
  const fresh = await getCall(callId);
  if (!fresh) return null;
  return updateCall(callId, { metadata: { ...metaOf(fresh), ...patch } });
}

async function releaseAgent(call: CallCenterCall, now: string) {
  if (!call.agentUserId) return;
  const status = await getAgentStatus(call.agentUserId);
  if (status && status.status === "busy") {
    await setAgentStatus(call.agentUserId, "acw", { lastCallAt: now });
  }
}

/** Remote side (caller / callee / carrier) ended the call. Idempotent. */
export async function finalizeCarrierHangup(
  call: CallCenterCall,
  reason: string,
): Promise<CallCenterCall> {
  if (isFinal(call.status)) return call;
  const now = new Date().toISOString();
  const meta = metaOf(call);

  if (meta.pstnState === "dialing") {
    const failed = await updateCall(call.id, {
      status: "failed",
      hangupReason: reason ? `PSTN not answered: ${reason}` : "PSTN not answered",
      endedAt: now,
      metadata: { ...meta, pstnState: "failed", sipOutboundPending: false },
    });
    await releaseAgent(call, now);
    return failed;
  }

  if (call.status === "answered" || call.status === "held") {
    const talkSeconds = call.answeredAt
      ? Math.max(0, Math.round((new Date(now).getTime() - new Date(call.answeredAt).getTime()) / 1000))
      : null;
    const ended = await updateCall(call.id, {
      status: "ended",
      hangupReason: reason || "Remote hangup",
      endedAt: now,
      talkSeconds,
    });
    await releaseAgent(call, now);
    return ended;
  }

  // ringing / queued / ivr / offered: caller abandoned before an agent picked up.
  return updateCall(call.id, {
    status: "missed",
    hangupReason: reason ? `Caller hung up: ${reason}` : "Caller hung up before answer",
    endedAt: now,
  });
}

// ---------------------------------------------------------------------------------------
// Telnyx Call Control
// ---------------------------------------------------------------------------------------

type Ctx = {
  settings: CallCenterSettingsRow | null;
  /** Null in demo mode without an API key: routing + CDR only, no carrier commands. */
  client: TelnyxClient | null;
  ccid: string;
  actions: string[];
};

async function exec(ctx: Ctx, label: string, fn: (client: TelnyxClient) => Promise<unknown>): Promise<boolean> {
  if (!ctx.client) {
    ctx.actions.push(`${label}:skipped(no-api-key)`);
    return false;
  }
  try {
    await fn(ctx.client);
    ctx.actions.push(label);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    console.error(`[call-center/telnyx] ${label} failed:`, msg);
    ctx.actions.push(`${label}:error(${msg})`);
    return false;
  }
}

function voiceOf(ctx: Ctx): string {
  return ctx.settings?.tts_voice ?? "";
}

async function gather(ctx: Ctx, text: string) {
  await exec(ctx, "gather", (c) =>
    c.gatherUsingSpeak(ctx.ccid, clip(text) || DEFAULT_IVR_PROMPT, { step: "ivr" }, voiceOf(ctx)),
  );
}

async function speakThenHangup(ctx: Ctx, text: string) {
  const prompt = clip(text);
  if (!prompt) {
    await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
    return;
  }
  const ok = await exec(ctx, "speak", (c) => c.speak(ctx.ccid, prompt, { step: "final" }, voiceOf(ctx)));
  if (!ok) await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
}

async function startHold(ctx: Ctx) {
  const url = ctx.settings?.hold_music_url?.trim() ?? "";
  if (!url) return;
  await exec(ctx, "hold_music", (c) => c.playbackStart(ctx.ccid, url, { step: "hold" }, true));
}

/** Welcome prompt (if configured) then hold music while agents ring. */
async function startQueueWait(ctx: Ctx) {
  const s = ctx.settings;
  const audio = s?.welcome_audio_url?.trim() ?? "";
  const text = s?.welcome_greeting?.trim() ?? "";
  if (audio) {
    const ok = await exec(ctx, "welcome_audio", (c) => c.playbackStart(ctx.ccid, audio, { step: "welcome" }, false));
    if (ok) return;
  } else if (s?.tts_enabled && text) {
    const ok = await exec(ctx, "welcome_speak", (c) => c.speak(ctx.ccid, clip(text), { step: "welcome" }, voiceOf(ctx)));
    if (ok) return;
  }
  await startHold(ctx);
}

function endedPrompt(call: CallCenterCall): string {
  const meta = metaOf(call);
  if (typeof meta.carrierPrompt === "string" && meta.carrierPrompt.trim()) return meta.carrierPrompt;
  if (typeof meta.greeting === "string" && meta.greeting.trim()) return meta.greeting;
  return call.status === "voicemail" ? DEFAULT_VOICEMAIL_PROMPT : "";
}

/** Translate a routing result (IVR digit / fallback) into the next carrier command. */
async function applyRouteResult(ctx: Ctx, result: InboundRouteResult) {
  const call = result.call;
  const meta = metaOf(call);

  if (result.phase === "ivr") {
    const greeting = typeof meta.ivrGreeting === "string" && meta.ivrGreeting ? meta.ivrGreeting : result.message;
    await gather(ctx, greeting);
    return;
  }

  if (result.phase === "queue") {
    if (call.status === "answered" && call.livekitRoom) {
      // AI-answered stub: connect the caller to the room right away so a LiveKit Agents worker can join.
      try {
        await bridgeCallerToLiveKit(call, call.livekitRoom, ctx.client);
        ctx.actions.push("bridge_ai_room");
      } catch (e) {
        ctx.actions.push(`bridge_ai_room:error(${e instanceof Error ? e.message : "failed"})`);
      }
      return;
    }
    await startQueueWait(ctx);
    return;
  }

  // phase === "ended"
  const reason = call.hangupReason ?? "";
  if (reason.startsWith("transfer:")) {
    const target = reason.slice("transfer:".length).trim();
    if (target) {
      await exec(ctx, "transfer_sip", (c) => c.transfer(ctx.ccid, target));
      return;
    }
  }
  await speakThenHangup(ctx, call.status === "voicemail" || meta.afterHours ? endedPrompt(call) : "");
}

async function failCall(ctx: Ctx, call: CallCenterCall, reason: string) {
  const fresh = (await getCall(call.id)) ?? call;
  if (!isFinal(fresh.status)) {
    await updateCall(call.id, {
      status: "failed",
      hangupReason: reason,
      endedAt: new Date().toISOString(),
    });
  }
  await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
}

export async function handleTelnyxEvent(
  ev: TelnyxEvent,
  options: { demo: boolean },
): Promise<CarrierEventResult> {
  const actions: string[] = [];
  const done = (handled: boolean, note: string, callId?: string): CarrierEventResult => ({
    handled,
    note,
    callId,
    actions,
  });

  if (!ev.callControlId) return done(false, "no call_control_id");

  const settings = await loadSettingsRow();
  const apiKey = resolveTelnyxApiKey(settings);
  if (!apiKey && !options.demo) {
    return done(
      false,
      "Telnyx API key not configured (Call Center → Settings or TELNYX_API_KEY); event ignored.",
    );
  }
  const ctx: Ctx = {
    settings,
    client: apiKey ? createTelnyxClient(apiKey) : null,
    ccid: ev.callControlId,
    actions,
  };

  switch (ev.eventType) {
    case "call.initiated": {
      if (ev.direction && ev.direction !== "incoming") return done(false, "not an inbound leg");
      const wanted = settings?.telnyx_connection_id?.trim();
      if (wanted && ev.connectionId && wanted !== ev.connectionId) {
        return done(false, "connection_id does not match configured Telnyx connection");
      }
      if (await findCallByProviderCallId(ev.callControlId)) return done(true, "duplicate event");

      const result = await routeInboundCall({
        fromE164: ev.from || "+00000000000",
        toE164: ev.to,
        provider: "telnyx",
        providerCallId: ev.callControlId,
      });
      const call = result.call;

      if (call.status === "failed") {
        await exec(ctx, "reject", (c) => c.reject(ctx.ccid));
        return done(true, result.message, call.id);
      }
      if (result.phase === "ended") {
        await patchMeta(call.id, { carrierFinal: true, carrierPrompt: result.message });
      }
      await exec(ctx, "answer", (c) => c.answer(ctx.ccid, { step: "answered", callId: call.id }));
      return done(true, result.message, call.id);
    }

    case "call.answered": {
      if (ev.direction && ev.direction !== "incoming") return done(false, "not an inbound leg");
      const found = await findCallByProviderCallId(ev.callControlId);
      if (!found) return done(false, "unknown call");
      const call =
        (await patchMeta(found.id, { carrierAnswered: true, carrierAnsweredAt: new Date().toISOString() })) ??
        found;
      const meta = metaOf(call);

      if (meta.carrierFinal) {
        await speakThenHangup(ctx, endedPrompt(call));
      } else if (call.status === "ivr") {
        const greeting = typeof meta.ivrGreeting === "string" ? meta.ivrGreeting : "";
        await gather(ctx, greeting);
      } else if (WAITING_STATUSES.has(call.status)) {
        await startQueueWait(ctx);
      } else if (call.status === "answered" && !call.agentUserId && call.livekitRoom) {
        try {
          await bridgeCallerToLiveKit(call, call.livekitRoom, ctx.client);
          actions.push("bridge_ai_room");
        } catch (e) {
          actions.push(`bridge_ai_room:error(${e instanceof Error ? e.message : "failed"})`);
        }
      } else if (isFinal(call.status)) {
        await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
      }
      return done(true, "answered", call.id);
    }

    case "call.gather.ended": {
      const call = await findCallByProviderCallId(ev.callControlId);
      if (!call) return done(false, "unknown call");
      if (call.status !== "ivr") return done(true, "not waiting on IVR", call.id);
      if (ev.gatherStatus === "call_hangup") return done(true, "caller hung up", call.id);

      const digit = ev.digits.slice(0, 1);
      try {
        if (digit) {
          const result = await applyIvrDigit(call.id, digit);
          await applyRouteResult(ctx, result);
          return done(true, result.message, call.id);
        }

        const menus = await listIvrMenus();
        const menu = menus.find((m) => m.id === call.ivrMenuId);
        const meta = metaOf(call);
        const retries = Number(meta.ivrRetries ?? 0) + 1;
        const maxRetries = Math.max(1, menu?.maxRetries ?? 3);
        if (retries > maxRetries) {
          const result = await routeCallToFallbackQueue(call.id);
          await applyRouteResult(ctx, result);
          return done(true, "IVR timeout → fallback queue", call.id);
        }
        const updated = (await patchMeta(call.id, { ivrRetries: retries })) ?? call;
        const greeting = typeof metaOf(updated).ivrGreeting === "string" ? String(metaOf(updated).ivrGreeting) : "";
        await gather(ctx, greeting);
        return done(true, "IVR retry", call.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "IVR failed";
        await failCall(ctx, call, `IVR error: ${msg}`);
        return done(true, msg, call.id);
      }
    }

    case "call.speak.ended":
    case "call.playback.ended": {
      const call = await findCallByProviderCallId(ev.callControlId);
      if (!call) return done(false, "unknown call");
      const step = typeof ev.clientState.step === "string" ? ev.clientState.step : "";
      if (step === "final") {
        await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
      } else if (step === "welcome") {
        // Agent may have answered (bridge) while the welcome prompt was playing.
        const fresh = (await getCall(call.id)) ?? call;
        if (WAITING_STATUSES.has(fresh.status)) await startHold(ctx);
      }
      return done(true, `${ev.eventType}:${step || "-"}`, call.id);
    }

    case "call.hangup": {
      const call = await findCallByProviderCallId(ev.callControlId);
      if (!call) return done(false, "unknown call");
      const reason = ev.hangupCause || ev.hangupSource || "";
      const updated = await finalizeCarrierHangup(call, reason);
      if (updated.livekitRoom && metaOf(call).bridgedAt) await deleteLiveKitRoom(updated.livekitRoom);
      return done(true, `hangup:${updated.status}`, call.id);
    }

    case "call.bridged": {
      const call = await findCallByProviderCallId(ev.callControlId);
      if (call) await patchMeta(call.id, { carrierBridgedAt: new Date().toISOString() });
      return done(true, "bridged", call?.id);
    }

    default:
      return done(true, `ignored ${ev.eventType}`);
  }
}

/**
 * Connect the waiting PSTN caller to the LiveKit room via SIP. Called when an agent answers.
 * Throws a user-readable Error when the caller cannot be connected (call stays offered).
 */
export async function bridgeCallerToLiveKit(
  call: CallCenterCall,
  roomName: string,
  client?: TelnyxClient | null,
): Promise<void> {
  const settings = await loadSettingsRow();
  let telnyx = client ?? null;
  try {
    telnyx = telnyx ?? createTelnyxClient(resolveTelnyxApiKey(settings));
  } catch (e) {
    if (e instanceof CarrierNotConfiguredError) throw new Error(e.message);
    throw e;
  }
  if (metaOf(call).carrierAnswered !== true) {
    throw new Error("The caller is still connecting. Try again in a moment.");
  }

  let uri: string;
  try {
    uri = await buildLiveKitSipUri(roomName, settings);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "LiveKit SIP is not configured.");
  }

  try {
    await telnyx.playbackStop(call.providerCallId);
  } catch {
    // nothing was playing
  }
  try {
    await telnyx.transfer(call.providerCallId, uri, {
      headers: [{ name: "X-FEC-Call-Id", value: call.id }],
      clientState: { step: "bridge", callId: call.id },
    });
  } catch (e) {
    if (e instanceof TelnyxApiError && (e.status === 404 || e.status === 422)) {
      throw new Error("The caller is no longer on the line.");
    }
    throw new Error(`Could not connect the caller: ${e instanceof Error ? e.message : "carrier error"}`);
  }
  await patchMeta(call.id, { bridgedAt: new Date().toISOString(), bridgeSipUri: uri });
}

/** Tear down the carrier side of a call (agent hangup / decline). Best effort. */
export async function endCarrierLeg(call: CallCenterCall): Promise<void> {
  const meta = metaOf(call);
  if (call.provider === "telnyx" && call.providerCallId && call.direction === "inbound") {
    try {
      const client = createTelnyxClient(resolveTelnyxApiKey(await loadSettingsRow()));
      await client.hangup(call.providerCallId);
    } catch {
      // already hung up, or Telnyx not configured
    }
  }
  if (call.livekitRoom && (call.provider === "livekit_sip" || meta.bridgedAt || meta.sipParticipantIdentity)) {
    await deleteLiveKitRoom(call.livekitRoom);
  }
}

// ---------------------------------------------------------------------------------------
// Outbound PSTN (LiveKit SIP outbound trunk → Telnyx)
// ---------------------------------------------------------------------------------------

export function isOutboundPstnReady(settings: CallCenterSettingsRow | null, livekitReady: boolean): boolean {
  return Boolean(settings?.livekit_sip_trunk_id?.trim()) && livekitReady;
}

/** Dial the callee into the call's LiveKit room; updates the CDR with the outcome. */
export async function runOutboundDial(callId: string): Promise<void> {
  const call = await getCall(callId);
  if (!call || isFinal(call.status)) return;
  const settings = await loadSettingsRow();
  try {
    const result = await dialOutboundSip({
      settings,
      roomName: call.livekitRoom,
      toE164: call.toE164,
      fromE164: call.fromE164,
      callId,
    });
    const fresh = await getCall(callId);
    if (!fresh || isFinal(fresh.status)) {
      // Agent hung up while we were still dialing: drop the leg that just connected.
      await deleteLiveKitRoom(call.livekitRoom);
      return;
    }
    await updateCall(callId, {
      answeredAt: new Date().toISOString(),
      metadata: {
        ...metaOf(fresh),
        pstnState: "connected",
        sipOutboundPending: false,
        sipParticipantIdentity: result.participantIdentity,
        sipCallId: result.sipCallId,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "SIP dial failed";
    console.error("[call-center/outbound] dial failed:", message);
    const fresh = await getCall(callId);
    if (!fresh || isFinal(fresh.status)) return;
    const now = new Date().toISOString();
    await updateCall(callId, {
      status: "failed",
      hangupReason: `PSTN dial failed: ${message}`.slice(0, 300),
      endedAt: now,
      metadata: { ...metaOf(fresh), pstnState: "failed", pstnError: message, sipOutboundPending: false },
    });
    await releaseAgent(fresh, now);
    await deleteLiveKitRoom(call.livekitRoom);
  }
}

// ---------------------------------------------------------------------------------------
// LiveKit SIP webhooks (participant_joined / participant_left / room_finished)
// ---------------------------------------------------------------------------------------

type LiveKitParticipantLike = {
  identity?: string;
  sid?: string;
  kind?: number | string;
  attributes?: Record<string, string>;
};

type LiveKitEventLike = {
  event: string;
  room?: { name?: string } | null;
  participant?: LiveKitParticipantLike | null;
};

function isSipParticipant(p: LiveKitParticipantLike): boolean {
  if (Number(p.kind) === 3) return true;
  if ((p.identity ?? "").startsWith("sip_") || (p.identity ?? "").startsWith("sip-")) return true;
  return Object.keys(p.attributes ?? {}).some((k) => k.startsWith("sip."));
}

async function findCallForSipEvent(
  room: string,
  attrs: Record<string, string>,
): Promise<CallCenterCall | null> {
  const callId = attrs["fec.callId"] || attrs["sip.h.x-fec-call-id"] || attrs["sip.h.X-FEC-Call-Id"] || "";
  if (callId) {
    const byId = await getCall(callId).catch(() => null);
    if (byId) return byId;
  }
  return findCallByLivekitRoom(room);
}

export async function handleLiveKitSipEvent(event: LiveKitEventLike): Promise<CarrierEventResult> {
  const actions: string[] = [];
  const done = (handled: boolean, note: string, callId?: string): CarrierEventResult => ({
    handled,
    note,
    callId,
    actions,
  });
  const room = event.room?.name ?? "";

  if (event.event === "room_finished") {
    const call = await findCallByLivekitRoom(room);
    if (!call) return done(false, "unknown room");
    const updated = await finalizeCarrierHangup(call, "Room closed");
    return done(true, `room_finished:${updated.status}`, call.id);
  }

  const participant = event.participant;
  if (!participant || !isSipParticipant(participant)) return done(false, "not a SIP participant");
  const attrs = participant.attributes ?? {};

  if (event.event === "participant_joined") {
    const linked = await findCallForSipEvent(room, attrs);
    if (linked) {
      await patchMeta(linked.id, {
        sipParticipantIdentity: participant.identity ?? "",
        sipCallId: attrs["sip.callID"] ?? "",
      });
      return done(true, "linked to CDR", linked.id);
    }

    // Native inbound (trunk dispatches straight into LiveKit, no Telnyx Call Control).
    if (room.startsWith(CALL_CENTER_ROOM_PREFIX)) return done(false, "unknown cc room");
    if (attrs["fec.direction"] === "outbound") return done(false, "outbound leg");
    const sipCallId = attrs["sip.callID"] || participant.sid || "";
    if (sipCallId && (await findCallByProviderCallId(sipCallId))) return done(true, "duplicate");
    const from = attrs["sip.phoneNumber"] || "";
    const to = attrs["sip.trunkPhoneNumber"] || "";
    if (!from && !to) return done(false, "no SIP numbers on participant");

    const result = await routeInboundCall({
      fromE164: from || "+00000000000",
      toE164: to,
      provider: "livekit_sip",
      providerCallId: sipCallId,
      skipIvr: true, // no prompt playback on this path; IVR needs Telnyx Call Control
    });
    if (result.phase === "ended") {
      await deleteLiveKitRoom(room);
      return done(true, result.message, result.call.id);
    }
    await updateCall(result.call.id, { livekitRoom: room });
    return done(true, result.message, result.call.id);
  }

  if (event.event === "participant_left") {
    const call = await findCallForSipEvent(room, attrs);
    if (!call) return done(false, "unknown call");
    const updated = await finalizeCarrierHangup(call, "SIP participant left");
    return done(true, `participant_left:${updated.status}`, call.id);
  }

  return done(false, `ignored ${event.event}`);
}
