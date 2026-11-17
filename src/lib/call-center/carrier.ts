import "server-only";

import { usesAdminAiGateway } from "./ai-reply-helpers";
import { handoffAiCallToQueue } from "./ai-session";
import { CarrierNotConfiguredError } from "./carrier-errors";
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
  CALL_CENTER_ROOM_PREFIX,
  deleteLiveKitRoom,
  dialOutboundSip,
  dispatchLiveKitAgent,
  ensureLiveKitRoom,
  waitForAgentPublishedInRoom,
  waitForAnyPublisherInRoom,
} from "./livekit-sip";
import { shouldSkipHoldMusic } from "./incoming-offer";
import { applyIvrDigit, routeCallToFallbackQueue, routeInboundCall } from "./routing";
import { createTelnyxClient, resolveTelnyxApiKey, type TelnyxClient, type TelnyxEvent } from "./telnyx";
import type { CallCenterCall, CallCenterSettingsRow, InboundRouteResult } from "./types";

/**
 * Carrier orchestration: Telnyx + LiveKit SIP → FEC routing (routing.ts) → agent softphone.
 *
 * Mode A (Telnyx SIP Trunking):
 *   Caller → Telnyx SIP → LiveKit inbound trunk → dispatch → room → softphone.
 *
 * Mode B (Telnyx Call Control — production E3):
 *   call.initiated → IVR/hold on Call Control → agent Answer → softphone joins room →
 *   LiveKit createSipParticipant dials the caller (outbound trunk) into the room, then
 *   Call Control leg is hung up. (Telnyx→LiveKit inbound transfer never got 200 OK here.)
 *
 * Outbound : softphone → placeOutboundCall → LiveKit createSipParticipant.
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

  // Outbound-dial bridge hangs up Call Control on purpose while LiveKit dials the caller.
  // Do not mark the CDR ended/missed or tear down the softphone room.
  if (
    meta.bridgeMode === "livekit_outbound_dial" &&
    meta.bridgeInProgress &&
    !meta.bridgeVerifiedAt
  ) {
    await patchMeta(call.id, {
      bridgeCallControlHangupIgnored: true,
      bridgeCallControlHangupReason: reason || "normal_clearing",
      carrierFinal: true,
    });
    return (await getCall(call.id)) ?? call;
  }

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

/**
 * Telnyx Answer can return 10007 ("unexpected error") while the inbound leg is still
 * setting up. Try a bare `{}` answer first (no client_state), then retries with state.
 */
async function answerInboundLeg(
  ctx: Ctx,
  clientState: Record<string, unknown>,
  label = "answer",
): Promise<boolean> {
  const attempts: Array<{ delayMs: number; state?: Record<string, unknown>; tag: string }> = [
    { delayMs: 0, tag: label },
    { delayMs: 400, tag: `${label}:bare2` },
    { delayMs: 900, state: clientState, tag: `${label}:stated` },
    { delayMs: 1600, state: clientState, tag: `${label}:stated2` },
  ];
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) await sleep(attempt.delayMs);
    const commandId = crypto.randomUUID();
    const ok = await exec(ctx, attempt.tag, (c) =>
      c.answer(ctx.ccid, attempt.state, commandId),
    );
    if (ok) return true;
    const last = ctx.actions[ctx.actions.length - 1] ?? "";
    // Call already gone — further retries are useless.
    if (/90018|already ended|no longer active/i.test(last)) return false;
  }
  return false;
}

function voiceOf(ctx: Ctx): string {
  return ctx.settings?.tts_voice ?? "";
}

/** Telnyx uses `incoming`; some payloads use `inbound`. Empty = unknown (allow). */
function isInboundTelnyxDirection(direction: string | undefined): boolean {
  const dir = (direction ?? "").trim().toLowerCase();
  return !dir || dir === "incoming" || dir === "inbound";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** call.answered can race createCall when we answer before routing finishes. */
async function findCallByProviderCallIdWithRetry(
  providerCallId: string,
  attempts = 10,
  delayMs = 150,
): Promise<CallCenterCall | null> {
  for (let i = 0; i < attempts; i += 1) {
    const found = await findCallByProviderCallId(providerCallId);
    if (found) return found;
    if (i + 1 < attempts) await sleep(delayMs);
  }
  return null;
}

async function startPromptForAnsweredCall(ctx: Ctx, call: CallCenterCall): Promise<void> {
  const meta = metaOf(call);
  if (meta.carrierPromptStarted) return;

  const actionsBefore = ctx.actions.length;
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
      typeof meta.aiProvider === "string" ? meta.aiProvider : ctx.settings?.ai_provider,
    );
    if (adminGateway && call.provider === "telnyx") {
      await startAdminGatewayAiPrompt(ctx, call);
    } else if (call.livekitRoom) {
      try {
        await maybeDispatchAiAgent(call, ctx.settings, ctx.actions);
        await bridgeCallerToLiveKit(call, call.livekitRoom, ctx.client);
        ctx.actions.push("bridge_ai_room");
      } catch (e) {
        ctx.actions.push(`bridge_ai_room:error(${e instanceof Error ? e.message : "failed"})`);
      }
    }
  } else if (isFinal(call.status)) {
    await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
  } else {
    return;
  }

  const started = ctx.actions
    .slice(actionsBefore)
    .some((a) => !a.includes(":error(") && !a.includes(":skipped("));
  if (!started) return;

  await patchMeta(call.id, {
    carrierPromptStarted: true,
    carrierPromptStartedAt: new Date().toISOString(),
    carrierInitActions: ctx.actions.slice(-24),
  });
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
  // Prefer Welcome greeting text; fall back to TTS greeting text so either field works without MP3s.
  const text = s?.welcome_greeting?.trim() || s?.tts_greeting_text?.trim() || "";
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
      if (!isInboundTelnyxDirection(ev.direction)) return done(false, "not an inbound leg");
      const wanted = settings?.telnyx_connection_id?.trim();
      if (wanted && ev.connectionId && wanted !== ev.connectionId) {
        return done(false, "connection_id does not match configured Telnyx connection");
      }

      const existing = await findCallByProviderCallId(ev.callControlId);
      if (existing) {
        // Webhook timeout/retry: CDR may exist while Answer never ran — re-answer so IVR can play.
        if (!isFinal(existing.status) && metaOf(existing).carrierAnswered !== true) {
          const reanswered = await answerInboundLeg(ctx, {
            step: "answered",
            callId: existing.id,
          });
          await patchMeta(existing.id, {
            carrierAnswerRetriedAt: new Date().toISOString(),
            carrierAnswerEarly: reanswered,
            carrierInitActions: actions.slice(-24),
            ...(reanswered ? {} : { carrierAnswerFailed: true }),
          });
          if (reanswered) {
            const fresh = (await getCall(existing.id)) ?? existing;
            await startPromptForAnsweredCall(ctx, fresh);
            return done(true, "duplicate:reanswer", existing.id);
          }
          await exec(ctx, "reject", (c) => c.reject(ctx.ccid));
          const failed = await updateCall(existing.id, {
            status: "failed",
            hangupReason: "Telnyx Answer failed (Call Control 10007) — IVR could not start",
            endedAt: new Date().toISOString(),
          });
          return done(true, "duplicate:answer_failed", failed.id);
        }
        return done(true, "duplicate event", existing.id);
      }

      // Answer ASAP (with retries) so the PSTN leg leaves ringback; then route → IVR gather.
      let answered = await answerInboundLeg(ctx, { step: "answered" });

      const result = await routeInboundCall({
        fromE164: ev.from || "+00000000000",
        toE164: ev.to,
        provider: "telnyx",
        providerCallId: ev.callControlId,
      });
      const call = result.call;

      if (call.status === "failed") {
        if (answered) await exec(ctx, "hangup", (c) => c.hangup(ctx.ccid));
        else await exec(ctx, "reject", (c) => c.reject(ctx.ccid));
        return done(true, result.message, call.id);
      }
      if (result.phase === "ended") {
        await patchMeta(call.id, { carrierFinal: true, carrierPrompt: result.message });
      }

      // Second chance: Answer sometimes 10007's before the leg is fully ready.
      if (!answered) {
        answered = await answerInboundLeg(ctx, { step: "answered", callId: call.id }, "answer_late");
      }

      await patchMeta(call.id, {
        carrierAnswerEarly: answered,
        carrierAnswerCommandAt: new Date().toISOString(),
        carrierInitActions: actions.slice(-24),
        ...(answered
          ? {}
          : {
              carrierAnswerFailed: true,
              carrierAnswerFailDetail: actions.filter((a) => a.includes("answer")).slice(-6),
            }),
      });

      if (!answered) {
        // Do not leave the caller in silent ringback / zombie IVR — reject and mark failed.
        await exec(ctx, "reject", (c) => c.reject(ctx.ccid));
        const failed = await updateCall(call.id, {
          status: "failed",
          hangupReason: "Telnyx Answer failed (Call Control 10007) — IVR could not start",
          endedAt: new Date().toISOString(),
        });
        return done(true, "answer_failed", failed.id);
      }

      // Start IVR/hold as soon as routing knows the phase (do not wait for call.answered).
      // call.answered is idempotent via carrierPromptStarted.
      const fresh = (await getCall(call.id)) ?? call;
      if (
        fresh.status === "ivr" ||
        WAITING_STATUSES.has(fresh.status) ||
        metaOf(fresh).carrierFinal ||
        (fresh.status === "answered" && metaOf(fresh).aiSession)
      ) {
        await startPromptForAnsweredCall(ctx, fresh);
      }
      return done(true, result.message, call.id);
    }

    case "call.answered": {
      if (!isInboundTelnyxDirection(ev.direction)) return done(false, "not an inbound leg");
      const found = await findCallByProviderCallIdWithRetry(ev.callControlId);
      if (!found) return done(false, "unknown call");
      const call =
        (await patchMeta(found.id, { carrierAnswered: true, carrierAnsweredAt: new Date().toISOString() })) ??
        found;
      await startPromptForAnsweredCall(ctx, call);
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
      const before = metaOf(call);
      const updated = await finalizeCarrierHangup(call, reason);
      const after = metaOf(updated);
      // Never delete the LiveKit room during an in-flight outbound dial bridge.
      if (
        after.bridgeCallControlHangupIgnored ||
        (before.bridgeMode === "livekit_outbound_dial" && before.bridgeInProgress)
      ) {
        return done(true, "hangup:ignored_outbound_bridge", call.id);
      }
      if (updated.livekitRoom && before.bridgedAt) await deleteLiveKitRoom(updated.livekitRoom);
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
 * Phase 1: tell the caller we're connecting and prep the LiveKit room.
 * Media bridge uses LiveKit *outbound* dial (not Telnyx→LiveKit inbound transfer).
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
  if (!settings?.livekit_sip_trunk_id?.trim()) {
    throw new Error(
      "Outbound SIP trunk is not set. Add the LiveKit outbound trunk id (ST_…) in Call Center → Settings.",
    );
  }
  if (!call.fromE164?.startsWith("+") || call.fromE164.length < 8) {
    throw new Error("Caller number is missing — cannot dial them into the softphone room.");
  }

  const voice = settings?.tts_voice ?? "";
  const metaPromise = patchMeta(call.id, {
    bridgeInProgress: true,
    bridgeAwaitingAgent: true,
    bridgeError: null,
    bridgePendingSip: false,
    bridgeMode: "livekit_outbound_dial",
  });
  const promptPromise = telnyx
    .speak(call.providerCallId, CONNECTING_PROMPT, { step: "connecting", callId: call.id }, voice)
    .catch(() => undefined);
  const prepPromise = ensureLiveKitRoom(roomName).catch(() => undefined);

  await Promise.all([metaPromise, promptPromise, prepPromise]);
}

/**
 * Phase 2: softphone is live → LiveKit *outbound* SIP dials the PSTN caller into the room
 * (same path as manual outbound). Then hang up the Telnyx Call Control IVR/hold leg.
 *
 * Why not Telnyx transfer → LiveKit inbound SIP: LiveKit never sent 200 OK (subscribe wait)
 * across many retries (UDP/TCP/agent-first/US pin); Telnyx showed 487 only after we cancelled.
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

  const voice = settings?.tts_voice ?? "";
  const callerE164 = call.fromE164?.trim() ?? "";
  if (!callerE164.startsWith("+")) {
    throw new Error("Caller number is missing — cannot dial them into the softphone room.");
  }
  const fromE164 =
    settings?.outbound_caller_id_e164?.trim() ||
    (call.toE164?.startsWith("+") ? call.toE164 : "") ||
    "";

  const publisherReady = agentUserId
    ? await waitForAgentPublishedInRoom(roomName, agentUserId, 10_000)
    : await waitForAnyPublisherInRoom(roomName, 12_000);
  if (!publisherReady) {
    const note = agentUserId
      ? "Softphone microphone was not ready in time. Allow mic access and Answer again."
      : "No LiveKit participant published audio in time for the bridge.";
    await restoreHoldAfterBridgeFailure(telnyx, call, settings, voice, note, "publisher_not_ready");
    throw new Error(note);
  }

  // Mark bridge in-progress BEFORE hanging up Call Control so call.hangup does not
  // finalize the CDR or delete the LiveKit room.
  await patchMeta(call.id, {
    bridgeMode: "livekit_outbound_dial",
    bridgeAwaitingAgent: false,
    bridgePendingSip: true,
    bridgeInProgress: true,
    bridgeError: null,
    bridgeDialTo: callerE164,
  });

  // Release the Call Control IVR/hold leg, then LiveKit outbound-dials the caller into the
  // room (proven createSipParticipant path). Avoids busy/call-waiting on the same PSTN line.
  await telnyx
    .speak(
      call.providerCallId,
      "Connecting you now. Please answer when we call you back.",
      { step: "bridge_callback", callId: call.id },
      voice,
    )
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1_200));
  await telnyx.hangup(call.providerCallId).catch(() => undefined);
  await patchMeta(call.id, {
    carrierFinal: true,
    bridgeCallControlHungUpAt: new Date().toISOString(),
  });

  console.info(
    `[call-center/bridge] outbound dial → ${callerE164} room=${roomName} (Call Control released)`,
  );

  let result: { participantIdentity: string; sipCallId: string };
  try {
    result = await dialOutboundSip({
      settings,
      roomName,
      toE164: callerE164,
      fromE164,
      callId: call.id,
      ringingTimeoutSecs: 25,
      playDialtone: true,
      directionAttr: "inbound_bridge",
    });
  } catch (e) {
    const lastError = e instanceof Error ? e.message : "outbound dial failed";
    console.warn("[call-center/bridge] outbound dial failed:", lastError);
    await patchMeta(call.id, {
      bridgePendingSip: false,
      bridgeInProgress: false,
      bridgeError: lastError,
      bridgeVerifyNote: lastError,
      bridgeTransport: "outbound_dial",
    });
    throw new Error(
      `Could not reach the caller on the connect-back dial (${lastError.slice(0, 120)}). Ask them to call again.`,
    );
  }

  await patchMeta(call.id, {
    sipParticipantIdentity: result.participantIdentity,
    sipCallId: result.sipCallId,
    bridgedAt: new Date().toISOString(),
    bridgeVerifiedAt: new Date().toISOString(),
    bridgePendingSip: false,
    bridgeInProgress: false,
    bridgeAwaitingAgent: false,
    bridgeError: null,
    bridgeTransport: "outbound_trunk",
    bridgeMode: "livekit_outbound_dial",
    carrierFinal: true,
  });
  console.info(
    `[call-center/bridge] outbound SIP joined room=${roomName} identity=${result.participantIdentity}`,
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
    "Could not connect the caller into the softphone room. Stay Available and try Answer again, or ask them to call back.";
  await patchMeta(call.id, {
    bridgePendingSip: false,
    bridgeInProgress: false,
    bridgeAwaitingAgent: false,
    bridgeError: note,
    bridgeVerifyNote: verifyNote,
    bridgeTransport: transport,
    bridgeMode: "livekit_outbound_dial",
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

type LiveKitEgressLike = {
  egressId?: string;
  roomName?: string;
  status?: number | string;
  error?: string;
  fileResults?: Array<{ location?: string }>;
};

type LiveKitEventLike = {
  event: string;
  room?: { name?: string } | null;
  participant?: LiveKitParticipantLike | null;
  egressInfo?: LiveKitEgressLike | null;
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

  if (
    event.event === "egress_ended" ||
    event.event === "egress_updated" ||
    event.event === "egress_started"
  ) {
    const egress = event.egressInfo;
    if (!egress) return done(false, "egress event missing egressInfo");
    const { applyLiveKitEgressInfo } = await import("./recording-egress");
    const result = await applyLiveKitEgressInfo({
      ...egress,
      roomName: egress.roomName?.trim() || room || egress.roomName,
    });
    actions.push(result.note);
    return done(result.handled, result.note, result.callId);
  }

  if (event.event === "room_finished") {
    const call = await findCallByLivekitRoom(room);
    if (!call) return done(false, "unknown room");
    // Capture recording URL before/while tearing down — egress often completes on hangup.
    try {
      const { refreshCallRecordingFromEgress } = await import("./recording-egress");
      await refreshCallRecordingFromEgress(call);
      actions.push("egress_refresh");
    } catch {
      // best-effort
    }
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
