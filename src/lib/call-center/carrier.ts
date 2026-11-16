import "server-only";

import { usesAdminAiGateway } from "./ai-reply-helpers";
import { handoffAiCallToQueue } from "./ai-session";
import { CarrierNotConfiguredError, TelnyxApiError } from "./carrier-errors";
import {
  findCallByLivekitRoom,
  findCallByProviderCallId,
  getAgentStatus,
  getCall,
  listDids,
  listIvrMenus,
  loadSettingsRow,
  normalizeE164,
  setAgentStatus,
  updateCall,
} from "./db";
import {
  buildLiveKitSipUri,
  CALL_CENTER_ROOM_PREFIX,
  deleteLiveKitRoom,
  dialOutboundSip,
  dispatchLiveKitAgent,
  ensureCallControlBridgeDispatch,
  ensureLiveKitRoom,
  waitForAgentPublishedInRoom,
  waitForAnyPublisherInRoom,
  waitForSipParticipantInRoom,
} from "./livekit-sip";
import { shouldSkipHoldMusic } from "./incoming-offer";
import { applyIvrDigit, routeCallToFallbackQueue, routeInboundCall } from "./routing";
import { createTelnyxClient, resolveTelnyxApiKey, type TelnyxClient, type TelnyxEvent } from "./telnyx";
import type { CallCenterCall, CallCenterSettingsRow, InboundRouteResult } from "./types";

/**
 * Carrier orchestration: Telnyx + LiveKit SIP → FEC routing (routing.ts) → agent softphone.
 *
 * Mode A (recommended / Telnyx SIP Trunking):
 *   Caller → Telnyx SIP origination → LiveKit inbound trunk → dispatch rule → room →
 *   FEC IVR/queue (DTMF via LiveKit SipDTMF + webhook digit API; optional LiveKit Agent for prompts).
 *
 * Mode B (Telnyx Call Control):
 *   call.initiated → route + answer → greeting / IVR gather / hold music →
 *   (agent answers) → Telnyx `transfer` to LiveKit SIP → caller joins the cc-… room.
 *
 * Outbound : softphone → placeOutboundCall → LiveKit createSipParticipant (outbound trunk → Telnyx).
 * CDR sync : Telnyx call.hangup + LiveKit participant_left / room_finished webhooks.
 */

async function maybeDispatchIvrAgent(
  call: CallCenterCall,
  settings: CallCenterSettingsRow | null,
  actions: string[],
): Promise<void> {
  if (call.status !== "ivr" || !call.livekitRoom) return;
  const agentName = settings?.ai_livekit_agent_name?.trim() ?? "";
  if (!agentName) {
    actions.push("ivr_waiting_dtmf_no_agent");
    return;
  }
  const dispatched = await dispatchLiveKitAgent({
    roomName: call.livekitRoom,
    agentName,
    metadata: JSON.stringify({
      fecCallId: call.id,
      purpose: "ivr",
      greeting: (call.metadata as Record<string, unknown> | null)?.ivrGreeting ?? "",
      llmVia: usesAdminAiGateway(settings?.ai_provider) ? "admin_gateway" : settings?.ai_provider,
    }),
  });
  if (dispatched.ok) {
    actions.push(`ivr_agent_dispatched:${dispatched.dispatchId || agentName}`);
    await patchMeta(call.id, { ivrAgentDispatched: true, ivrAgentName: agentName });
  } else {
    actions.push(`ivr_agent_dispatch_failed:${dispatched.reason}`);
  }
}

/** Dispatch LiveKit agent for AI first-answer; metadata tells the worker to call FEC /ai-turn (Gemini). */
async function maybeDispatchAiAgent(
  call: CallCenterCall,
  settings: CallCenterSettingsRow | null,
  actions: string[],
): Promise<void> {
  const meta = metaOf(call);
  if (!meta.aiSession && !meta.ai_answered) return;
  if (!call.livekitRoom) return;
  const agentName = settings?.ai_livekit_agent_name?.trim() ?? "";
  if (!agentName) {
    actions.push("ai_session_no_livekit_agent");
    return;
  }
  const adminGateway = usesAdminAiGateway(
    typeof meta.aiProvider === "string" ? meta.aiProvider : settings?.ai_provider,
  );
  const dispatched = await dispatchLiveKitAgent({
    roomName: call.livekitRoom,
    agentName,
    metadata: JSON.stringify({
      fecCallId: call.id,
      purpose: "ai_first_answer",
      welcome: typeof meta.aiWelcome === "string" ? meta.aiWelcome : "",
      systemPrompt: typeof meta.aiSystemPrompt === "string" ? meta.aiSystemPrompt : "",
      language: typeof meta.aiLanguage === "string" ? meta.aiLanguage : "en",
      llmVia: adminGateway ? "admin_gateway" : settings?.ai_provider ?? "admin_gateway",
      /** Worker should POST caller transcripts here instead of calling OpenAI directly. */
      aiTurnPath: "/api/public/call-center/ai-turn",
    }),
  });
  if (dispatched.ok) {
    actions.push(`ai_agent_dispatched:${dispatched.dispatchId || agentName}`);
    await patchMeta(call.id, { aiAgentDispatched: true, aiAgentName: agentName });
  } else {
    actions.push(`ai_agent_dispatch_failed:${dispatched.reason}`);
  }
}

async function startAdminGatewayAiPrompt(ctx: Ctx, call: CallCenterCall) {
  const meta = metaOf(call);
  const welcome =
    (typeof meta.aiWelcome === "string" && meta.aiWelcome.trim()) ||
    (typeof meta.aiGatherPrompt === "string" && meta.aiGatherPrompt.trim()) ||
    "Thank you for calling. How can I help?";
  const gatherHint =
    typeof meta.aiGatherPrompt === "string" && meta.aiGatherPrompt.trim()
      ? meta.aiGatherPrompt.trim()
      : "To speak with a human agent, press zero.";
  const spoken = clip(`${welcome} ${gatherHint}`);
  await exec(ctx, "ai_welcome_gather", (c) =>
    c.gatherUsingSpeak(ctx.ccid, spoken, { step: "ai_session" }, voiceOf(ctx)),
  );
  await patchMeta(call.id, { aiWelcomeSpoken: true });
}

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
    void import("./outbound-webhooks").then(({ emitCallCenterOutboundWebhook }) =>
      emitCallCenterOutboundWebhook({ event: "call.ended", call: ended }),
    );
    return ended;
  }

  // ringing / queued / ivr / offered: caller abandoned before an agent picked up.
  const missed = await updateCall(call.id, {
    status: "missed",
    hangupReason: reason ? `Caller hung up: ${reason}` : "Caller hung up before answer",
    endedAt: now,
  });
  void import("./outbound-webhooks").then(({ emitCallCenterOutboundWebhook }) =>
    emitCallCenterOutboundWebhook({ event: "call.missed", call: missed }),
  );
  return missed;
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

async function gather(ctx: Ctx, text: string, audioUrl?: string) {
  const audio = audioUrl?.trim() ?? "";
  if (audio) {
    const ok = await exec(ctx, "gather_audio", (c) =>
      c.gatherUsingAudio(ctx.ccid, audio, { step: "ivr" }),
    );
    if (ok) return;
  }
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
  const call = await findCallByProviderCallId(ctx.ccid).catch(() => null);
  if (call && shouldSkipHoldMusic(call)) {
    ctx.actions.push("hold_music:skipped(bridging)");
    return;
  }
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
    const audio = typeof meta.ivrAudioUrl === "string" ? meta.ivrAudioUrl : "";
    await gather(ctx, greeting, audio);
    return;
  }

  if (result.phase === "queue") {
    if (call.status === "answered" && (meta.aiSession || meta.ai_answered)) {
      const adminGateway = usesAdminAiGateway(
        typeof meta.aiProvider === "string" ? meta.aiProvider : ctx.settings?.ai_provider,
      );
      if (adminGateway && call.provider === "telnyx") {
        // In-app path: Telnyx TTS welcome + digit-0 handoff; LLM turns via /ai-turn (Gemini).
        await startAdminGatewayAiPrompt(ctx, call);
        return;
      }
      // LiveKit Agents (or SIP bridge): connect so an external worker can join for STT/TTS.
      if (call.livekitRoom) {
        try {
          // Dispatch the AI worker first so something publishes before the SIP INVITE.
          await maybeDispatchAiAgent(call, ctx.settings, ctx.actions);
          await bridgeCallerToLiveKit(call, call.livekitRoom, ctx.client);
          ctx.actions.push("bridge_ai_room");
        } catch (e) {
          ctx.actions.push(`bridge_ai_room:error(${e instanceof Error ? e.message : "failed"})`);
        }
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
        const audio = typeof meta.ivrAudioUrl === "string" ? meta.ivrAudioUrl : "";
        await gather(ctx, greeting, audio);
      } else if (WAITING_STATUSES.has(call.status)) {
        await startQueueWait(ctx);
      } else if (call.status === "answered" && !call.agentUserId && (meta.aiSession || meta.ai_answered)) {
        const adminGateway = usesAdminAiGateway(
          typeof meta.aiProvider === "string" ? meta.aiProvider : settings?.ai_provider,
        );
        if (adminGateway && call.provider === "telnyx") {
          await startAdminGatewayAiPrompt(ctx, call);
        } else if (call.livekitRoom) {
          try {
            await maybeDispatchAiAgent(call, settings, actions);
            await bridgeCallerToLiveKit(call, call.livekitRoom, ctx.client);
            actions.push("bridge_ai_room");
          } catch (e) {
            actions.push(`bridge_ai_room:error(${e instanceof Error ? e.message : "failed"})`);
          }
        }
      } else if (isFinal(call.status)) {
        await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
      }
      return done(true, "answered", call.id);
    }

    case "call.gather.ended": {
      const call = await findCallByProviderCallId(ev.callControlId);
      if (!call) return done(false, "unknown call");
      if (ev.gatherStatus === "call_hangup") {
        // Do not wait for a separate call.hangup — leaving status as ivr/queued keeps the
        // softphone Incoming modal alive (ghost re-offer) until the next poll clears it.
        const updated = await finalizeCarrierHangup(call, "Caller hung up during IVR gather");
        if (updated.livekitRoom && metaOf(call).bridgedAt) await deleteLiveKitRoom(updated.livekitRoom);
        return done(true, `hangup:gather:${updated.status}`, call.id);
      }

      const gatherStep = typeof ev.clientState.step === "string" ? ev.clientState.step : "";
      const meta = metaOf(call);
      if (gatherStep === "ai_session" || (meta.aiSession && call.status === "answered")) {
        const digit = ev.digits.slice(0, 1);
        if (digit === "0" && meta.aiHandoffEnabled !== false) {
          try {
            const result = await handoffAiCallToQueue(call.id);
            await applyRouteResult(ctx, result);
            return done(true, "AI → human handoff", call.id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "AI handoff failed";
            await failCall(ctx, call, msg);
            return done(true, msg, call.id);
          }
        }
        // Stay in AI session: re-prompt digit handoff; text turns use /api/public/call-center/ai-turn.
        const hint =
          (typeof meta.aiGatherPrompt === "string" && meta.aiGatherPrompt.trim()) ||
          "To speak with a human agent, press zero.";
        await exec(ctx, "ai_reprompt", (c) =>
          c.gatherUsingSpeak(ctx.ccid, clip(hint), { step: "ai_session" }, voiceOf(ctx)),
        );
        return done(true, "AI session waiting", call.id);
      }

      if (call.status !== "ivr") return done(true, "not waiting on IVR", call.id);

      const digit = ev.digits.slice(0, 1);
      try {
        if (digit) {
          await patchMeta(call.id, { lastIvrDigitAttempt: digit, lastIvrDigitAt: new Date().toISOString() });
          const result = await applyIvrDigit(call.id, digit);
          const softLoop =
            result.phase === "ivr" &&
            (result.message === "Repeat menu." || result.message === "Invalid digit.");
          if (softLoop) {
            // Do not re-prompt forever: count invalid/repeat like an empty gather.
            const menus = await listIvrMenus();
            const menu = menus.find((m) => m.id === call.ivrMenuId);
            const retries = Number(meta.ivrRetries ?? 0) + 1;
            const maxRetries = Math.max(1, menu?.maxRetries ?? 3);
            if (retries > maxRetries) {
              const fallback = await routeCallToFallbackQueue(call.id);
              await applyRouteResult(ctx, fallback);
              return done(true, `IVR ${result.message} → fallback queue`, call.id);
            }
            await patchMeta(call.id, { ivrRetries: retries });
          }
          await applyRouteResult(ctx, result);
          return done(true, result.message, call.id);
        }

        const menus = await listIvrMenus();
        const menu = menus.find((m) => m.id === call.ivrMenuId);
        const retries = Number(meta.ivrRetries ?? 0) + 1;
        const maxRetries = Math.max(1, menu?.maxRetries ?? 3);
        if (retries > maxRetries) {
          const result = await routeCallToFallbackQueue(call.id);
          await applyRouteResult(ctx, result);
          return done(true, "IVR timeout → fallback queue", call.id);
        }
        const updated = (await patchMeta(call.id, { ivrRetries: retries })) ?? call;
        const nextMeta = metaOf(updated);
        const greeting = typeof nextMeta.ivrGreeting === "string" ? String(nextMeta.ivrGreeting) : "";
        const audio = typeof nextMeta.ivrAudioUrl === "string" ? String(nextMeta.ivrAudioUrl) : "";
        await gather(ctx, greeting, audio);
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
        // Restarting hold after playback_stop races Telnyx transfer → SIP never publishes
        // and the softphone sits on "Connected — waiting for caller audio".
        const fresh = (await getCall(call.id)) ?? call;
        if (shouldSkipHoldMusic(fresh)) {
          return done(true, `${ev.eventType}:skipped_bridge`, call.id);
        }
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

const CONNECTING_PROMPT =
  "Please wait. We are connecting you to an agent.";

/**
 * Phase 1: tell the caller we're connecting and prep LiveKit room/dispatch.
 * Do NOT transfer yet — LiveKit SIP only answers INVITEs after the agent softphone
 * has joined the room and published audio (see LiveKit inbound workflow docs).
 */
export async function prepareCallerBridge(
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
  // Validate SIP URI host early so Answer fails fast with a clear Settings message.
  try {
    await buildLiveKitSipUri(roomName, settings);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "LiveKit SIP is not configured.");
  }

  const voice = settings?.tts_voice ?? "";
  const metaPromise = patchMeta(call.id, {
    bridgeInProgress: true,
    bridgeAwaitingAgent: true,
    bridgeError: null,
    bridgePendingSip: false,
  });
  const promptPromise = telnyx
    .speak(call.providerCallId, CONNECTING_PROMPT, { step: "connecting", callId: call.id }, voice)
    .catch(() => undefined);
  const prepPromise = Promise.all([
    ensureCallControlBridgeDispatch(settings).catch((e) => ({
      ok: false as const,
      detail: e instanceof Error ? e.message : "dispatch heal failed",
    })),
    ensureLiveKitRoom(roomName).catch(() => undefined),
  ]);

  const [, , [dispatchHeal]] = await Promise.all([metaPromise, promptPromise, prepPromise]);
  if (dispatchHeal && "ok" in dispatchHeal && !dispatchHeal.ok) {
    console.warn("[call-center/bridge] dispatch heal:", dispatchHeal.detail);
  }
  await patchMeta(call.id, {
    bridgeDispatchHeal:
      dispatchHeal && "detail" in dispatchHeal ? dispatchHeal.detail : undefined,
  });
}

/**
 * Phase 2: after the agent softphone is in the room with published audio, transfer
 * the Telnyx PSTN leg into LiveKit SIP (single UDP INVITE — no retry/cancel 487).
 */
export async function transferCallerToLiveKit(
  call: CallCenterCall,
  roomName: string,
  agentUserId: string | null,
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
  if (!call.providerCallId) {
    throw new Error("No Telnyx call control id for this leg.");
  }

  let uri: string;
  try {
    uri = await buildLiveKitSipUri(roomName, settings);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "LiveKit SIP is not configured.");
  }

  const voice = settings?.tts_voice ?? "";
  const from =
    settings?.outbound_caller_id_e164?.trim() ||
    (call.toE164?.startsWith("+") ? call.toE164 : "") ||
    undefined;

  const publisherReady = agentUserId
    ? await waitForAgentPublishedInRoom(roomName, agentUserId, 12_000)
    : await waitForAnyPublisherInRoom(roomName, 15_000);
  if (!publisherReady) {
    const note = agentUserId
      ? "Softphone joined but microphone was not ready in time. Allow mic access and try again."
      : "No LiveKit participant published audio in time for the SIP bridge.";
    await restoreHoldAfterBridgeFailure(telnyx, call, settings, voice, note, "publisher_not_ready");
    throw new Error(note);
  }

  try {
    console.info(`[call-center/bridge] agent-ready transfer UDP → ${uri}`);
    await telnyx.transfer(call.providerCallId, uri, {
      from,
      headers: [{ name: "X-FEC-Call-Id", value: call.id }],
      clientState: { step: "bridge", callId: call.id, transport: "UDP" },
      sipTransport: "UDP",
      earlyMedia: false,
      mediaEncryption: "disabled",
      timeoutSecs: 45,
    });
  } catch (e) {
    const lastError = e instanceof Error ? e.message : "transfer failed";
    console.warn("[call-center/bridge] UDP transfer failed:", lastError);
    if (e instanceof TelnyxApiError && (e.status === 404 || e.status === 422)) {
      await patchMeta(call.id, {
        bridgeInProgress: false,
        bridgeAwaitingAgent: false,
        bridgePendingSip: false,
        bridgeError: "The caller is no longer on the line.",
      });
      throw new Error("The caller is no longer on the line.");
    }
    await restoreHoldAfterBridgeFailure(telnyx, call, settings, voice, lastError, "UDP");
    throw new Error(
      "Could not bridge the caller into the softphone room (SIP INVITE not accepted). Check Settings → SIP URI and inbound trunk.",
    );
  }

  await patchMeta(call.id, {
    bridgedAt: new Date().toISOString(),
    bridgeSipUri: uri,
    bridgeTransport: "UDP",
    bridgeAwaitingAgent: false,
    bridgePendingSip: true,
    bridgeInProgress: true,
    bridgeError: null,
  });

  // Single INVITE — do not cancel/retry (that produced Telnyx 487 ORIGINATOR_CANCEL).
  const sipIdentity = await waitForSipParticipantInRoom(roomName, 20_000);
  if (!sipIdentity) {
    const note =
      "Could not bridge the caller into the softphone room (SIP INVITE not accepted). Check Settings → SIP URI and inbound trunk.";
    await restoreHoldAfterBridgeFailure(
      telnyx,
      call,
      settings,
      voice,
      "No SIP participant after agent-ready UDP transfer",
      "UDP",
    );
    throw new Error(note);
  }

  await patchMeta(call.id, {
    sipParticipantIdentity: sipIdentity,
    bridgeVerifiedAt: new Date().toISOString(),
    bridgePendingSip: false,
    bridgeInProgress: false,
    bridgeAwaitingAgent: false,
    bridgeError: null,
    bridgeTransport: "UDP",
  });
  console.info(
    `[call-center/bridge] SIP joined room=${roomName} via UDP identity=${sipIdentity}`,
  );
}

async function restoreHoldAfterBridgeFailure(
  telnyx: TelnyxClient,
  call: CallCenterCall,
  settings: CallCenterSettingsRow | null,
  voice: string,
  verifyNote: string,
  transport: string,
): Promise<void> {
  const note =
    "Could not bridge the caller into the softphone room (SIP INVITE not accepted). Check Settings → SIP URI and inbound trunk.";
  await patchMeta(call.id, {
    bridgePendingSip: false,
    bridgeInProgress: false,
    bridgeAwaitingAgent: false,
    bridgeError: note,
    bridgeVerifyNote: verifyNote,
    bridgeTransport: transport,
  });
  if (!call.providerCallId) return;
  const holdUrl = settings?.hold_music_url?.trim() ?? "";
  if (holdUrl) {
    await telnyx
      .playbackStart(call.providerCallId, holdUrl, { step: "hold" }, true)
      .catch(() => undefined);
  } else {
    await telnyx
      .speak(
        call.providerCallId,
        "We are still trying to connect you. Please stay on the line.",
        { step: "bridge_failed" },
        voice,
      )
      .catch(() => undefined);
  }
}

/**
 * One-shot bridge (prepare + transfer). Human Answer uses prepare + deferred transfer
 * via completePstnBridge so the softphone publishes first.
 */
export async function bridgeCallerToLiveKit(
  call: CallCenterCall,
  roomName: string,
  client?: TelnyxClient | null,
): Promise<void> {
  await prepareCallerBridge(call, roomName, client);
  await transferCallerToLiveKit(call, roomName, call.agentUserId, client);
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
        bridgePendingSip: false,
        bridgeVerifiedAt: new Date().toISOString(),
      });
      return done(true, "linked to CDR", linked.id);
    }

    // Native Telnyx SIP Trunk → LiveKit inbound (no Call Control leg yet).
    // Skip only when this is already an FEC cc- room with no CDR (bridge race / orphan).
    if (room.startsWith(CALL_CENTER_ROOM_PREFIX) && !attrs["sip.trunkPhoneNumber"] && !attrs["sip.phoneNumber"]) {
      return done(false, "unknown cc room");
    }
    if (attrs["fec.direction"] === "outbound") return done(false, "outbound leg");
    const sipCallId = attrs["sip.callID"] || participant.sid || "";
    if (sipCallId && (await findCallByProviderCallId(sipCallId))) return done(true, "duplicate");
    const from = attrs["sip.phoneNumber"] || "";
    const to = attrs["sip.trunkPhoneNumber"] || "";
    if (!from && !to) return done(false, "no SIP numbers on participant");

    const settings = await loadSettingsRow();
    // Call Control owns CDRs via Telnyx webhooks. A bridge INVITE that lands in the wrong
    // room (or with From=our DID) must NOT create a second "inbound" Recent row.
    if (settings?.inbound_mode === "telnyx_call_control") {
      const owned = new Set<string>();
      const addOwned = (n: string | null | undefined) => {
        const v = normalizeE164(n ?? "");
        if (v) owned.add(v);
      };
      addOwned(settings.outbound_caller_id_e164);
      addOwned(settings.qatar_did_e164);
      try {
        for (const did of await listDids()) addOwned(did.e164);
      } catch {
        // best-effort
      }
      const fromN = normalizeE164(from);
      if (fromN && owned.has(fromN)) {
        return done(false, "suppressed phantom DID-as-caller (Call Control bridge)");
      }
      if (room.startsWith(CALL_CENTER_ROOM_PREFIX)) {
        return done(false, "call control mode: ignore unlinked SIP join on cc room");
      }
    }

    // Call Control mode still uses Telnyx for IVR; SIP-trunk arrivals on LiveKit get full IVR routing.
    const skipIvr = settings?.inbound_mode === "telnyx_call_control";
    const result = await routeInboundCall({
      fromE164: from || "+00000000000",
      toE164: to,
      provider: "livekit_sip",
      providerCallId: sipCallId,
      skipIvr,
    });
    if (result.phase === "ended") {
      await deleteLiveKitRoom(room);
      return done(true, result.message, result.call.id);
    }
    const updated =
      (await updateCall(result.call.id, {
        livekitRoom: room.startsWith(CALL_CENTER_ROOM_PREFIX) ? room : result.call.livekitRoom || room,
        metadata: {
          ...((result.call.metadata as Record<string, unknown> | null) ?? {}),
          livekitSipInbound: true,
          telnyxDtmfMode: settings?.telnyx_dtmf_mode ?? "rfc2833",
        },
      })) ?? result.call;
    actions.push(skipIvr ? "routed_skip_ivr_call_control_mode" : `routed_${result.phase}`);
    if (!skipIvr) await maybeDispatchIvrAgent(updated, settings, actions);
    if (updated.status === "answered" && (metaOf(updated).aiSession || metaOf(updated).ai_answered)) {
      await maybeDispatchAiAgent(updated, settings, actions);
    }
    return done(true, result.message, updated.id);
  }

  if (event.event === "participant_left") {
    const call = await findCallForSipEvent(room, attrs);
    if (!call) return done(false, "unknown call");
    const updated = await finalizeCarrierHangup(call, "SIP participant left");
    return done(true, `participant_left:${updated.status}`, call.id);
  }

  return done(false, `ignored ${event.event}`);
}
