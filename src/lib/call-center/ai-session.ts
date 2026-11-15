import "server-only";

import { generateCallCenterAiReply } from "./ai-reply";
import {
  adminGatewayGatherPrompt,
  resolveCallCenterAiLanguage,
  resolveCallCenterAiWelcome,
  usesAdminAiGateway,
  type CallCenterAiHistoryItem,
} from "./ai-reply-helpers";
import { getCall, listQueues, loadSettingsRow, updateCall } from "./db";
import type {
  CallCenterAiProvider,
  CallCenterCall,
  CallCenterSettingsRow,
  InboundRouteResult,
} from "./types";

function roomNameForCall(callId: string): string {
  return `cc-${callId.replace(/-/g, "").slice(0, 24)}`;
}

function metaOf(call: CallCenterCall): Record<string, unknown> {
  return (call.metadata as Record<string, unknown> | null) ?? {};
}

function normalizeAiHistory(raw: unknown): CallCenterAiHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CallCenterAiHistoryItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  return out;
}

export type StartAiAnswerInput = {
  call: CallCenterCall;
  settings: CallCenterSettingsRow | null;
  digit?: string | null;
  language?: string | null;
  systemPrompt?: string | null;
  welcome?: string | null;
  handoffQueueId?: string | null;
  /** IVR node id when started from canvas. */
  ivrNodeId?: string | null;
};

/**
 * Mark the call as AI-answered and attach session metadata for Telnyx / LiveKit / ai-turn.
 * Prefer admin_gateway (Gemini via Admin Integrations); LiveKit Agents remains optional speech I/O.
 */
export async function startAiAnswerSession(input: StartAiAnswerInput): Promise<InboundRouteResult> {
  const settings = input.settings ?? (await loadSettingsRow());
  const provider = (settings?.ai_provider ?? "admin_gateway") as CallCenterAiProvider;
  const adminGateway = usesAdminAiGateway(provider);
  const language = resolveCallCenterAiLanguage(input.language ?? "auto");
  const welcome = resolveCallCenterAiWelcome({
    settings,
    language,
    nodeWelcome: input.welcome,
  });
  const handoffQueueId =
    input.handoffQueueId ?? settings?.ai_handoff_queue_id ?? input.call.queueId ?? null;
  const livekitRoom = input.call.livekitRoom || roomNameForCall(input.call.id);
  const meta = {
    ...metaOf(input.call),
    ...(input.ivrNodeId ? { ivrNodeId: input.ivrNodeId } : {}),
    ai_answered: true,
    aiSession: true,
    aiProvider: provider,
    aiEngine: adminGateway ? "admin_gateway" : provider,
    aiLanguage: language,
    aiWelcome: welcome,
    aiGatherPrompt: adminGateway ? adminGatewayGatherPrompt(language) : "",
    aiSystemPrompt: input.systemPrompt?.trim() || settings?.ai_notes || "",
    aiHistory: [] as CallCenterAiHistoryItem[],
    aiStartedAt: new Date().toISOString(),
    aiFirstAnswerSetting: Boolean(settings?.ai_first_answer_enabled),
    livekitAgentsHandoff:
      provider === "livekit_agents" || Boolean(settings?.ai_livekit_agent_name?.trim()),
    aiHandoffEnabled: settings?.ai_handoff_enabled !== false,
    aiHandoffQueueId: handoffQueueId,
    aiHandoffAfterSeconds: settings?.ai_handoff_after_seconds ?? 45,
  };

  const updated = await updateCall(input.call.id, {
    status: "answered",
    ivrDigit: input.digit ?? input.call.ivrDigit,
    livekitRoom,
    answeredAt: new Date().toISOString(),
    queueId: handoffQueueId ?? input.call.queueId,
    metadata: meta,
  });

  const engineLabel = adminGateway
    ? "Admin AI gateway (Gemini → OpenRouter)"
    : provider === "livekit_agents"
      ? "LiveKit Agents"
      : provider;
  return {
    call: updated,
    offeredUserIds: [],
    phase: "queue",
    message: `AI agent answering via ${engineLabel}. CDR: ai_answered=true.`,
  };
}

export async function handoffAiCallToQueue(callId: string): Promise<InboundRouteResult> {
  const call = await getCall(callId);
  if (!call) throw new Error("Call not found.");
  const settings = await loadSettingsRow();
  const meta = metaOf(call);
  const handoffQueueId =
    (typeof meta.aiHandoffQueueId === "string" ? meta.aiHandoffQueueId : null) ||
    settings?.ai_handoff_queue_id ||
    call.queueId;
  const queues = await listQueues();
  const queue = handoffQueueId ? queues.find((q) => q.id === handoffQueueId) : null;
  if (!queue) {
    throw new Error("AI handoff queue is not configured.");
  }
  const updated = await updateCall(call.id, {
    status: "queued",
    metadata: {
      ...meta,
      aiSession: false,
      aiHandedOff: true,
      aiHandedOffAt: new Date().toISOString(),
    },
  });
  // Lazy import avoids a cycle: routing → ai-session → routing.
  const { offerCallToQueue } = await import("./routing");
  return offerCallToQueue({
    call: updated,
    queue,
    eventId: call.eventId,
  });
}

export type ProcessAiTurnResult = {
  call: CallCenterCall;
  reply: string;
  provider: string;
  model: string;
  language: "en" | "ar";
  handoff: boolean;
  routeResult?: InboundRouteResult;
};

/** Apply a caller utterance: generate admin-gateway reply or hand off to a human queue. */
export async function processCallCenterAiTurn(input: {
  callId: string;
  utterance: string;
  language?: string | null;
}): Promise<ProcessAiTurnResult> {
  const utterance = input.utterance.trim();
  if (!utterance) throw new Error("Utterance is required.");
  const call = await getCall(input.callId);
  if (!call) throw new Error("Call not found.");
  const meta = metaOf(call);
  if (!meta.ai_answered && !meta.aiSession) {
    throw new Error("Call is not in an AI session.");
  }

  const settings = await loadSettingsRow();
  const history = normalizeAiHistory(meta.aiHistory);
  const languageHint =
    input.language || (typeof meta.aiLanguage === "string" ? meta.aiLanguage : null) || "auto";

  const generated = await generateCallCenterAiReply({
    settings,
    utterance,
    language: languageHint,
    history,
    systemPromptOverride: typeof meta.aiSystemPrompt === "string" ? meta.aiSystemPrompt : null,
    welcomeOverride: typeof meta.aiWelcome === "string" ? meta.aiWelcome : null,
    moduleSource: "call_center_ai_live",
  });

  const nextHistory: CallCenterAiHistoryItem[] = [
    ...history,
    { role: "user" as const, content: utterance },
    { role: "assistant" as const, content: generated.text },
  ].slice(-24);

  const transcriptLines = nextHistory.map((item) => {
    const label = item.role === "user" ? "Caller" : "Agent";
    return `${label}: ${item.content}`;
  });

  const patched = await updateCall(call.id, {
    metadata: {
      ...meta,
      aiHistory: nextHistory,
      aiLastReplyAt: new Date().toISOString(),
      aiLastProvider: generated.provider,
      aiLastModel: generated.model,
      aiLanguage: generated.language,
    },
    transcriptText: transcriptLines.join("\n\n"),
    transcriptStatus: "partial",
    transcriptUpdatedAt: new Date().toISOString(),
  });

  if (generated.handoffRequested && settings?.ai_handoff_enabled !== false) {
    const routeResult = await handoffAiCallToQueue(call.id);
    return {
      call: routeResult.call,
      reply: generated.text,
      provider: generated.provider,
      model: generated.model,
      language: generated.language,
      handoff: true,
      routeResult,
    };
  }

  return {
    call: patched,
    reply: generated.text,
    provider: generated.provider,
    model: generated.model,
    language: generated.language,
    handoff: false,
  };
}
