import "server-only";

import { getCallProvider } from "@/lib/chat/call-provider";

import { isWithinBusinessHours } from "./business-hours";
import {
  createCall,
  createVoicemail,
  findDidByE164,
  getAgentStatus,
  listAvailableAgents,
  listHolidays,
  listIvrMenus,
  listIvrOptions,
  listQueueMembers,
  listQueues,
  loadSettingsRow,
  normalizeE164,
  setAgentStatus,
  updateCall,
} from "./db";
import {
  findEntryInteractiveNode,
  findStartNode,
  flowHasGraph,
  followDefaultEdge,
  followDigitEdge,
  followHandleEdge,
  type IvrFlowJson,
  type IvrFlowNode,
} from "./ivr-flow";
import type {
  CallCenterCall,
  CallCenterMediaSession,
  CallCenterProvider,
  CallCenterQueue,
  CallCenterQueueStrategy,
  InboundRouteResult,
} from "./types";

function roomNameForCall(callId: string): string {
  return `cc-${callId.replace(/-/g, "").slice(0, 24)}`;
}

function pickAgents(
  strategy: CallCenterQueueStrategy,
  agents: Array<{ userId: string; priority: number; lastCallAt: string | null }>,
): string[] {
  if (agents.length === 0) return [];
  const sorted = [...agents].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aTime = a.lastCallAt ?? "";
    const bTime = b.lastCallAt ?? "";
    return aTime.localeCompare(bTime);
  });
  if (strategy === "simultaneous") return sorted.map((a) => a.userId);
  return [sorted[0]!.userId];
}

async function resolveQueueAgents(queue: CallCenterQueue): Promise<string[]> {
  const members = (await listQueueMembers(queue.id)).filter((m) => m.isActive);
  if (members.length === 0) return [];
  const available = await listAvailableAgents(members.map((m) => m.userId));
  const availableIds = new Set(available.map((a) => a.userId));
  const candidates = members
    .filter((m) => availableIds.has(m.userId))
    .map((m) => {
      const status = available.find((a) => a.userId === m.userId);
      return {
        userId: m.userId,
        priority: m.priority,
        lastCallAt: status?.lastCallAt ?? null,
      };
    });
  return pickAgents(queue.strategy, candidates);
}

async function offerToQueue(params: {
  call: CallCenterCall;
  queue: CallCenterQueue;
  eventId: string | null;
}): Promise<InboundRouteResult> {
  const offeredUserIds = await resolveQueueAgents(params.queue);
  const now = new Date().toISOString();
  const livekitRoom = params.call.livekitRoom || roomNameForCall(params.call.id);
  const agentUserId =
    params.queue.strategy === "simultaneous" ? null : (offeredUserIds[0] ?? null);

  const call = await updateCall(params.call.id, {
    status: offeredUserIds.length > 0 ? "offered" : "queued",
    queueId: params.queue.id,
    eventId: params.eventId ?? params.queue.eventId ?? params.call.eventId,
    agentUserId,
    livekitRoom,
    offeredAt: now,
  });

  return {
    call,
    offeredUserIds,
    phase: "queue",
    message:
      offeredUserIds.length > 0
        ? `Offered to ${offeredUserIds.length} agent(s).`
        : "Queued — no available agents.",
  };
}

/**
 * Resolve an inbound DID hit into IVR or queue offer.
 * Works without Telnyx: callers (webhooks / test ring) pass from/to and provider.
 */
export async function routeInboundCall(input: {
  fromE164: string;
  toE164: string;
  provider: CallCenterProvider;
  providerCallId?: string;
  /** When set, skip DID lookup and force this queue (test / admin). */
  forceQueueId?: string | null;
  /** When set, offer only to this agent (test ring). */
  forceAgentUserId?: string | null;
  skipIvr?: boolean;
}): Promise<InboundRouteResult> {
  const settings = await loadSettingsRow();
  if (!settings?.enabled && input.provider !== "test") {
    const call = await createCall({
      direction: "inbound",
      status: "failed",
      fromE164: normalizeE164(input.fromE164),
      toE164: normalizeE164(input.toE164),
      provider: input.provider,
      providerCallId: input.providerCallId,
    });
    const failed = await updateCall(call.id, {
      status: "failed",
      hangupReason: "Call Center disabled",
      endedAt: new Date().toISOString(),
    });
    return { call: failed, offeredUserIds: [], phase: "ended", message: "Call Center is disabled." };
  }

  const toE164 = normalizeE164(input.toE164);
  const fromE164 = normalizeE164(input.fromE164);
  if (fromE164 && input.provider !== "test") {
    const { isNumberBlacklisted } = await import("./db");
    if (await isNumberBlacklisted(fromE164)) {
      const call = await createCall({
        direction: "inbound",
        status: "failed",
        fromE164,
        toE164,
        provider: input.provider,
        providerCallId: input.providerCallId,
      });
      const failed = await updateCall(call.id, {
        status: "failed",
        hangupReason: "Blocked number",
        endedAt: new Date().toISOString(),
        metadata: { blacklisted: true },
      });
      return {
        call: failed,
        offeredUserIds: [],
        phase: "ended",
        message: "Caller is on the blocklist.",
      };
    }
  }
  const did = toE164 ? await findDidByE164(toE164) : null;
  const queues = await listQueues();
  const defaultQueue =
    queues.find((q) => q.id === settings?.default_queue_id) ??
    queues.find((q) => q.isActive) ??
    null;

  if (input.forceAgentUserId) {
    const call = await createCall({
      direction: input.provider === "test" ? "internal_test" : "inbound",
      status: "offered",
      fromE164: fromE164 || "+00000000000",
      toE164: toE164 || "test",
      didId: did?.id ?? null,
      queueId: input.forceQueueId ?? did?.queueId ?? defaultQueue?.id ?? null,
      agentUserId: input.forceAgentUserId,
      eventId: did?.eventId ?? null,
      livekitRoom: "",
      provider: input.provider,
      providerCallId: input.providerCallId,
      offeredAt: new Date().toISOString(),
    });
    const livekitRoom = roomNameForCall(call.id);
    const updated = await updateCall(call.id, { livekitRoom });
    return {
      call: updated,
      offeredUserIds: [input.forceAgentUserId],
      phase: "queue",
      message: "Test ring offered to agent.",
    };
  }

  const forceQueue = input.forceQueueId
    ? queues.find((q) => q.id === input.forceQueueId) ?? null
    : null;
  const targetQueue =
    forceQueue ??
    (did?.queueId ? queues.find((q) => q.id === did.queueId) ?? null : null) ??
    defaultQueue;

  const holidays = await listHolidays();
  const openNow = isWithinBusinessHours({
    enabled: Boolean(settings?.business_hours_enabled),
    timezone: settings?.timezone || "Asia/Qatar",
    hoursJson: settings?.business_hours_json ?? {},
    holidays,
  });

  if (!openNow && !input.forceAgentUserId && !forceQueue && input.provider !== "test") {
    const greeting =
      settings?.after_hours_greeting ||
      "We are currently closed. Please leave a message or call back during business hours.";
    const action = settings?.after_hours_action || "voicemail";
    if (action === "hangup") {
      const call = await createCall({
        direction: "inbound",
        status: "ended",
        fromE164,
        toE164,
        didId: did?.id ?? null,
        eventId: did?.eventId ?? null,
        provider: input.provider,
        providerCallId: input.providerCallId,
      });
      const ended = await updateCall(call.id, {
        status: "ended",
        hangupReason: "After hours hangup",
        endedAt: new Date().toISOString(),
        metadata: { afterHours: true, greeting },
      });
      return { call: ended, offeredUserIds: [], phase: "ended", message: greeting };
    }
    if (action !== "queue") {
      const call = await createCall({
        direction: "inbound",
        status: "voicemail",
        fromE164,
        toE164,
        didId: did?.id ?? null,
        queueId: targetQueue?.id ?? null,
        eventId: did?.eventId ?? null,
        provider: input.provider,
        providerCallId: input.providerCallId,
      });
      const ended = await updateCall(call.id, {
        status: "voicemail",
        hangupReason: "After hours voicemail",
        endedAt: new Date().toISOString(),
        metadata: { afterHours: true, greeting },
      });
      await createVoicemail({
        callId: ended.id,
        fromE164,
        toE164,
        queueId: targetQueue?.id ?? null,
        eventId: did?.eventId ?? null,
        promptText: greeting,
      });
      return { call: ended, offeredUserIds: [], phase: "ended", message: greeting };
    }
    // action === queue → fall through to normal queue offer below
  }

  const useIvr =
    !input.skipIvr &&
    Boolean(settings?.ivr_enabled) &&
    Boolean(did?.ivrMenuId) &&
    !forceQueue &&
    openNow;

  if (useIvr && did?.ivrMenuId) {
    const menus = await listIvrMenus();
    const menu = menus.find((m) => m.id === did.ivrMenuId && m.isActive);
    if (menu) {
      const flow = menu.flowJson;
      const entry = flowHasGraph(flow) ? findEntryInteractiveNode(flow) : null;
      const start = flowHasGraph(flow) ? findStartNode(flow) : null;
      const greeting =
        start?.data.greetingText ||
        entry?.data.greetingText ||
        menu.greetingText ||
        "IVR menu active.";
      const call = await createCall({
        direction: "inbound",
        status: "ivr",
        fromE164,
        toE164,
        didId: did.id,
        queueId: targetQueue?.id ?? null,
        eventId: did.eventId,
        ivrMenuId: menu.id,
        livekitRoom: "",
        provider: input.provider,
        providerCallId: input.providerCallId,
      });
      const livekitRoom = roomNameForCall(call.id);
      const updated = await updateCall(call.id, {
        livekitRoom,
        metadata: {
          ivrNodeId: entry?.id ?? start?.id ?? null,
          ivrGreeting: greeting,
        },
      });
      return {
        call: updated,
        offeredUserIds: [],
        phase: "ivr",
        message: greeting,
      };
    }
  }

  if (!targetQueue) {
    const call = await createCall({
      direction: "inbound",
      status: "failed",
      fromE164,
      toE164,
      didId: did?.id ?? null,
      eventId: did?.eventId ?? null,
      provider: input.provider,
      providerCallId: input.providerCallId,
    });
    const failed = await updateCall(call.id, {
      status: "failed",
      hangupReason: "No queue configured",
      endedAt: new Date().toISOString(),
    });
    return { call: failed, offeredUserIds: [], phase: "ended", message: "No queue configured." };
  }

  const call = await createCall({
    direction: input.provider === "test" ? "internal_test" : "inbound",
    status: "queued",
    fromE164: fromE164 || "+00000000000",
    toE164: toE164 || "unknown",
    didId: did?.id ?? null,
    queueId: targetQueue.id,
    eventId: did?.eventId ?? targetQueue.eventId,
    livekitRoom: "",
    provider: input.provider,
    providerCallId: input.providerCallId,
  });
  const withRoom = await updateCall(call.id, { livekitRoom: roomNameForCall(call.id) });
  return offerToQueue({
    call: withRoom,
    queue: targetQueue,
    eventId: did?.eventId ?? targetQueue.eventId,
  });
}

async function resolveTerminalIvrNode(params: {
  call: CallCenterCall;
  node: IvrFlowNode;
  digit: string;
  flow: IvrFlowJson;
}): Promise<InboundRouteResult> {
  const { call, node, digit, flow } = params;
  let current: IvrFlowNode | null = node;
  let guard = 0;

  while (current && guard < 12) {
    guard += 1;
    if (current.type === "play") {
      current = followDefaultEdge(flow, current.id);
      continue;
    }
    if (current.type === "hours") {
      const settings = await loadSettingsRow();
      const holidays = await listHolidays();
      const open = isWithinBusinessHours({
        enabled: Boolean(settings?.business_hours_enabled),
        timezone: settings?.timezone || "Asia/Qatar",
        hoursJson: settings?.business_hours_json ?? {},
        holidays,
      });
      current =
        followHandleEdge(flow, current.id, open ? "open" : "closed") ??
        followDefaultEdge(flow, current.id);
      continue;
    }
    if (current.type === "menu" || current.type === "start") {
      const greeting =
        current.data.greetingText || current.data.messageText || current.data.label || "IVR menu.";
      const updated = await updateCall(call.id, {
        status: "ivr",
        ivrDigit: digit,
        metadata: {
          ...((call.metadata as Record<string, unknown>) ?? {}),
          ivrNodeId: current.id,
          ivrGreeting: greeting,
        },
      });
      return { call: updated, offeredUserIds: [], phase: "ivr", message: greeting };
    }
    if (current.type === "hangup") {
      const ended = await updateCall(call.id, {
        status: "ended",
        ivrDigit: digit,
        hangupReason: "IVR hangup",
        endedAt: new Date().toISOString(),
        metadata: {
          ...((call.metadata as Record<string, unknown>) ?? {}),
          ivrNodeId: current.id,
        },
      });
      return { call: ended, offeredUserIds: [], phase: "ended", message: "Caller hung up via IVR." };
    }
    if (current.type === "voicemail") {
      const prompt =
        current.data.messageText || current.data.greetingText || "Please leave a message after the tone.";
      const ended = await updateCall(call.id, {
        status: "voicemail",
        ivrDigit: digit,
        eventId: current.data.eventId ?? call.eventId,
        endedAt: new Date().toISOString(),
        metadata: {
          ...((call.metadata as Record<string, unknown>) ?? {}),
          ivrNodeId: current.id,
        },
      });
      await createVoicemail({
        callId: ended.id,
        fromE164: call.fromE164,
        toE164: call.toE164,
        queueId: call.queueId,
        eventId: current.data.eventId ?? call.eventId,
        promptText: prompt,
      });
      return { call: ended, offeredUserIds: [], phase: "ended", message: "Routed to voicemail." };
    }
    if (current.type === "agent") {
      const agentUserId = current.data.agentUserId;
      if (!agentUserId) throw new Error("Agent node has no agent selected.");
      const livekitRoom = call.livekitRoom || roomNameForCall(call.id);
      const now = new Date().toISOString();
      const updated = await updateCall(call.id, {
        status: "offered",
        ivrDigit: digit,
        agentUserId,
        livekitRoom,
        offeredAt: now,
        eventId: current.data.eventId ?? call.eventId,
        metadata: {
          ...((call.metadata as Record<string, unknown>) ?? {}),
          ivrNodeId: current.id,
        },
      });
      return {
        call: updated,
        offeredUserIds: [agentUserId],
        phase: "queue",
        message: "Offered to agent via IVR.",
      };
    }
    if (current.type === "ai") {
      const settings = await loadSettingsRow();
      const nodeEnabled = current.data.aiEnabled !== false;
      const settingsFirstAnswer = Boolean(settings?.ai_first_answer_enabled);
      // Node switch is enough for canvas routing; settings flag is recorded for Agents dispatch.
      const aiActive = nodeEnabled;
      const livekitRoom = call.livekitRoom || roomNameForCall(call.id);
      const handoffQueueId =
        current.data.aiHandoffQueueId ?? current.data.queueId ?? call.queueId ?? null;
      const meta = {
        ...((call.metadata as Record<string, unknown>) ?? {}),
        ivrNodeId: current.id,
        ai_answered: true,
        aiEnabled: aiActive,
        aiFirstAnswerSetting: settingsFirstAnswer,
        aiLanguage: current.data.aiLanguage ?? "auto",
        aiSystemPrompt: current.data.aiSystemPrompt ?? settings?.ai_notes ?? "",
        livekitAgentsHandoff: true,
        aiHandoffEnabled: settings?.ai_handoff_enabled !== false,
        aiHandoffQueueId: handoffQueueId,
      };

      if (!aiActive) {
        // Node disabled → fall through to handoff queue if configured
        if (handoffQueueId) {
          const queues = await listQueues();
          const queue = queues.find((q) => q.id === handoffQueueId);
          if (queue) {
            const updated = await updateCall(call.id, {
              ivrDigit: digit,
              queueId: queue.id,
              status: "queued",
              livekitRoom,
              metadata: { ...meta, ai_answered: false, aiSkipped: true },
            });
            return offerToQueue({
              call: updated,
              queue,
              eventId: call.eventId,
            });
          }
        }
        const updated = await updateCall(call.id, {
          status: "ivr",
          ivrDigit: digit,
          livekitRoom,
          metadata: { ...meta, ai_answered: false, aiSkipped: true },
        });
        return {
          call: updated,
          offeredUserIds: [],
          phase: "ivr",
          message: "AI node disabled — configure /call-center/ai or enable the node.",
        };
      }

      // Stub: mark CDR for LiveKit Agents handoff; keep call answered until Agents worker joins.
      const updated = await updateCall(call.id, {
        status: "answered",
        ivrDigit: digit,
        livekitRoom,
        answeredAt: new Date().toISOString(),
        queueId: handoffQueueId ?? call.queueId,
        metadata: meta,
      });
      return {
        call: updated,
        offeredUserIds: [],
        phase: "queue",
        message: "AI agent answering (LiveKit Agents stub). CDR: ai_answered=true.",
      };
    }
    if (current.type === "queue" || current.type === "event") {
      const terminal: IvrFlowNode = current;
      if (terminal.data.transferSipUri) {
        const ended = await updateCall(call.id, {
          status: "ended",
          ivrDigit: digit,
          hangupReason: `transfer:${terminal.data.transferSipUri}`,
          endedAt: new Date().toISOString(),
          metadata: {
            ...((call.metadata as Record<string, unknown>) ?? {}),
            ivrNodeId: terminal.id,
            transferSipUri: terminal.data.transferSipUri,
          },
        });
        return { call: ended, offeredUserIds: [], phase: "ended", message: "SIP transfer requested." };
      }
      const queues = await listQueues();
      const preferredQueueId = terminal.data.queueId ?? null;
      const fallbackQueueId = call.queueId;
      const queue =
        (preferredQueueId ? queues.find((q) => q.id === preferredQueueId) : null) ??
        (fallbackQueueId ? queues.find((q) => q.id === fallbackQueueId) : null);
      if (!queue) throw new Error("IVR queue node has no queue.");
      const updated = await updateCall(call.id, {
        ivrDigit: digit,
        eventId: terminal.data.eventId ?? call.eventId,
        queueId: queue.id,
        status: "queued",
        metadata: {
          ...((call.metadata as Record<string, unknown>) ?? {}),
          ivrNodeId: terminal.id,
        },
      });
      return offerToQueue({
        call: updated,
        queue,
        eventId: terminal.data.eventId ?? call.eventId,
      });
    }
    break;
  }

  return { call, offeredUserIds: [], phase: "ivr", message: "IVR path incomplete." };
}

/** Apply IVR digit selection and continue to queue / hangup / etc. */
export async function applyIvrDigit(callId: string, digit: string): Promise<InboundRouteResult> {
  const { getCall } = await import("./db");
  const call = await getCall(callId);
  if (!call || call.status !== "ivr" || !call.ivrMenuId) {
    throw new Error("Call is not waiting on IVR.");
  }

  const menus = await listIvrMenus();
  const menu = menus.find((m) => m.id === call.ivrMenuId);
  const flow = menu?.flowJson;
  const meta = (call.metadata as Record<string, unknown> | null) ?? {};

  if (flow && flowHasGraph(flow)) {
    const currentId =
      (typeof meta.ivrNodeId === "string" && meta.ivrNodeId) ||
      findEntryInteractiveNode(flow)?.id ||
      findStartNode(flow)?.id ||
      null;
    if (!currentId) {
      return { call, offeredUserIds: [], phase: "ivr", message: "IVR flow has no entry node." };
    }
    const current = flow.nodes.find((n) => n.id === currentId);
    if (!current) {
      return { call, offeredUserIds: [], phase: "ivr", message: "IVR node missing." };
    }
    const next = followDigitEdge(flow, current.id, digit);
    if (!next) {
      // repeat self-edge or invalid
      const self = flow.edges.find(
        (e) => e.source === current.id && e.sourceHandle === digit && e.target === current.id,
      );
      if (self || digit === "0") {
        return { call, offeredUserIds: [], phase: "ivr", message: "Repeat menu." };
      }
      return { call, offeredUserIds: [], phase: "ivr", message: "Invalid digit." };
    }
    if (next.id === current.id) {
      return { call, offeredUserIds: [], phase: "ivr", message: "Repeat menu." };
    }
    return resolveTerminalIvrNode({ call, node: next, digit, flow });
  }

  // Legacy flattened options path (no canvas graph yet)
  const options = await listIvrOptions(call.ivrMenuId);
  const option = options.find((o) => o.digit === digit);
  if (!option) {
    return {
      call,
      offeredUserIds: [],
      phase: "ivr",
      message: "Invalid digit.",
    };
  }

  if (option.action === "repeat") {
    return { call, offeredUserIds: [], phase: "ivr", message: "Repeat menu." };
  }
  if (option.action === "menu" && option.nextMenuId) {
    const nextMenu = menus.find((m) => m.id === option.nextMenuId && m.isActive);
    if (!nextMenu) throw new Error("Nested IVR menu not found.");
    const updated = await updateCall(call.id, {
      ivrDigit: digit,
      ivrMenuId: nextMenu.id,
      metadata: {
        ...meta,
        ivrNodeId: findEntryInteractiveNode(nextMenu.flowJson)?.id ?? null,
        ivrGreeting: nextMenu.greetingText,
      },
    });
    return {
      call: updated,
      offeredUserIds: [],
      phase: "ivr",
      message: nextMenu.greetingText || "Next menu.",
    };
  }
  if (option.action === "hangup") {
    const ended = await updateCall(call.id, {
      status: "ended",
      ivrDigit: digit,
      hangupReason: "IVR hangup",
      endedAt: new Date().toISOString(),
    });
    return { call: ended, offeredUserIds: [], phase: "ended", message: "Caller hung up via IVR." };
  }
  if (option.action === "voicemail") {
    const ended = await updateCall(call.id, {
      status: "voicemail",
      ivrDigit: digit,
      eventId: option.eventId ?? call.eventId,
      endedAt: new Date().toISOString(),
    });
    await createVoicemail({
      callId: ended.id,
      fromE164: call.fromE164,
      toE164: call.toE164,
      queueId: option.queueId ?? call.queueId,
      eventId: option.eventId ?? call.eventId,
      promptText: "Please leave a message after the tone.",
    });
    return { call: ended, offeredUserIds: [], phase: "ended", message: "Routed to voicemail." };
  }
  if (option.action === "agent") {
    const agentUserId = option.agentUserId;
    if (!agentUserId) throw new Error("IVR agent option has no agent.");
    const now = new Date().toISOString();
    const updated = await updateCall(call.id, {
      status: "offered",
      ivrDigit: digit,
      agentUserId,
      offeredAt: now,
      eventId: option.eventId ?? call.eventId,
    });
    return {
      call: updated,
      offeredUserIds: [agentUserId],
      phase: "queue",
      message: "Offered to agent via IVR.",
    };
  }
  if (option.action === "ai") {
    const settings = await loadSettingsRow();
    const livekitRoom = call.livekitRoom || roomNameForCall(call.id);
    const updated = await updateCall(call.id, {
      status: "answered",
      ivrDigit: digit,
      livekitRoom,
      answeredAt: new Date().toISOString(),
      queueId: option.queueId ?? call.queueId,
      metadata: {
        ...meta,
        ai_answered: true,
        livekitAgentsHandoff: true,
        aiHandoffEnabled: settings?.ai_handoff_enabled !== false,
        aiHandoffQueueId: option.queueId,
        targetNodeId: option.targetNodeId,
      },
    });
    return {
      call: updated,
      offeredUserIds: [],
      phase: "queue",
      message: "AI agent answering (LiveKit Agents stub). CDR: ai_answered=true.",
    };
  }
  if (option.action === "transfer_sip") {
    const ended = await updateCall(call.id, {
      status: "ended",
      ivrDigit: digit,
      hangupReason: `transfer:${option.transferSipUri}`,
      endedAt: new Date().toISOString(),
      metadata: { transferSipUri: option.transferSipUri },
    });
    return { call: ended, offeredUserIds: [], phase: "ended", message: "SIP transfer requested." };
  }

  const queues = await listQueues();
  const queue =
    (option.queueId ? queues.find((q) => q.id === option.queueId) : null) ??
    (call.queueId ? queues.find((q) => q.id === call.queueId) : null);
  if (!queue) {
    throw new Error("IVR option has no queue.");
  }
  const updated = await updateCall(call.id, {
    ivrDigit: digit,
    eventId: option.eventId ?? call.eventId,
    queueId: queue.id,
    status: "queued",
  });
  return offerToQueue({
    call: updated,
    queue,
    eventId: option.eventId ?? call.eventId,
  });
}

export async function answerCall(callId: string, agentUserId: string): Promise<{
  call: CallCenterCall;
  media: CallCenterMediaSession;
}> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (!["ringing", "offered", "queued"].includes(existing.status)) {
    throw new Error("Call is no longer available.");
  }
  if (existing.agentUserId && existing.agentUserId !== agentUserId) {
    throw new Error("Call already offered to another agent.");
  }

  const livekitRoom = existing.livekitRoom || roomNameForCall(callId);
  const now = new Date().toISOString();
  const call = await updateCall(callId, {
    status: "answered",
    agentUserId,
    livekitRoom,
    answeredAt: now,
  });
  await setAgentStatus(agentUserId, "busy", { lastCallAt: now });

  const media = await issueAgentMediaToken({
    roomName: livekitRoom,
    userId: agentUserId,
    displayName: "Agent",
  });
  return { call, media };
}

export async function declineCall(callId: string, agentUserId: string): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.agentUserId && existing.agentUserId !== agentUserId) {
    throw new Error("Call belongs to another agent.");
  }
  return updateCall(callId, {
    status: "declined",
    hangupReason: "Agent declined",
    endedAt: new Date().toISOString(),
  });
}

export async function hangupCall(callId: string, agentUserId: string): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.agentUserId && existing.agentUserId !== agentUserId) {
    throw new Error("Call belongs to another agent.");
  }
  const now = new Date().toISOString();
  let talkSeconds: number | null = null;
  if (existing.answeredAt) {
    talkSeconds = Math.max(
      0,
      Math.round((new Date(now).getTime() - new Date(existing.answeredAt).getTime()) / 1000),
    );
  }
  const call = await updateCall(callId, {
    status: "ended",
    hangupReason: "Agent hangup",
    endedAt: now,
    talkSeconds,
  });
  const status = await getAgentStatus(agentUserId);
  if (status && status.status === "busy") {
    await setAgentStatus(agentUserId, "acw", { lastCallAt: now });
  }
  return call;
}

export async function placeOutboundCall(input: {
  agentUserId: string;
  toE164: string;
  fromE164?: string;
  campaignId?: string | null;
  eventId?: string | null;
}): Promise<{ call: CallCenterCall; media: CallCenterMediaSession }> {
  const { findAgentByExtension, isNumberBlacklisted } = await import("./db");
  const settings = await loadSettingsRow();
  const rawTarget = input.toE164.trim();
  const extensionAgent =
    /^\d{2,6}$/.test(rawTarget) ? await findAgentByExtension(rawTarget) : null;
  if (extensionAgent) {
    if (extensionAgent.userId === input.agentUserId) {
      throw new Error("Cannot dial your own extension.");
    }
    const now = new Date().toISOString();
    const call = await createCall({
      direction: "outbound",
      status: "answered",
      fromE164: `ext:${input.agentUserId.slice(0, 8)}`,
      toE164: `ext:${extensionAgent.extension || rawTarget}`,
      agentUserId: input.agentUserId,
      provider: "test",
      offeredAt: now,
      answeredAt: now,
      metadata: {
        internalExtension: true,
        targetUserId: extensionAgent.userId,
        targetExtension: extensionAgent.extension || rawTarget,
      },
    });
    const livekitRoom = roomNameForCall(call.id);
    const updated = await updateCall(call.id, { livekitRoom });
    await setAgentStatus(input.agentUserId, "busy", { lastCallAt: now });
    const media = await issueAgentMediaToken({
      roomName: livekitRoom,
      userId: input.agentUserId,
      displayName: "Agent",
    });
    return { call: updated, media };
  }

  const toE164 = normalizeE164(input.toE164);
  if (!toE164 || toE164.length < 8) throw new Error("Enter a valid E.164 number or extension.");
  if (await isNumberBlacklisted(toE164)) {
    throw new Error("This number is on the Call Center blocklist.");
  }
  const fromE164 =
    normalizeE164(input.fromE164 || "") ||
    normalizeE164(settings?.outbound_caller_id_e164 || "") ||
    "outbound";
  const now = new Date().toISOString();
  const sipLikely = Boolean(
    settings &&
      (settings.telnyx_sip_uri.trim() ||
        settings.telnyx_api_key.trim() ||
        settings.livekit_sip_trunk_id.trim()),
  );
  const call = await createCall({
    direction: "outbound",
    status: "answered",
    fromE164,
    toE164,
    agentUserId: input.agentUserId,
    campaignId: input.campaignId ?? null,
    eventId: input.eventId ?? null,
    provider: sipLikely ? "telnyx" : "test",
    offeredAt: now,
    answeredAt: now,
    metadata: { outboundManual: true, sipOutboundPending: true },
  });
  const livekitRoom = roomNameForCall(call.id);
  const updated = await updateCall(call.id, { livekitRoom });
  await setAgentStatus(input.agentUserId, "busy", { lastCallAt: now });
  const media = await issueAgentMediaToken({
    roomName: livekitRoom,
    userId: input.agentUserId,
    displayName: "Agent",
  });
  return { call: updated, media };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function requestTransfer(input: {
  callId: string;
  agentUserId: string;
  type: "cold" | "warm";
  target: string;
}): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(input.callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.agentUserId !== input.agentUserId) {
    throw new Error("Call belongs to another agent.");
  }
  if (!["answered", "held"].includes(existing.status)) {
    throw new Error("Call is not active.");
  }
  const now = new Date().toISOString();
  const target = input.target.trim();
  const targetIsAgent = UUID_RE.test(target);

  if (input.type === "cold" && targetIsAgent) {
    // Re-offer same CDR to destination agent (in-app divert). SIP REFER still pending for PSTN.
    await setAgentStatus(input.agentUserId, "acw", { lastCallAt: now });
    return updateCall(input.callId, {
      transferType: "cold",
      transferTarget: target,
      transferredAt: now,
      hangupReason: `cold_transfer:${target}`,
      status: "offered",
      agentUserId: target,
      offeredAt: now,
      answeredAt: null,
      endedAt: null,
      metadata: {
        transferPendingSip: true,
        transferType: "cold",
        transferTarget: target,
        previousAgentUserId: input.agentUserId,
      },
    });
  }

  return updateCall(input.callId, {
    transferType: input.type,
    transferTarget: target,
    transferredAt: now,
    hangupReason:
      input.type === "cold" ? `cold_transfer:${target}` : `warm_transfer:${target}`,
    status: input.type === "cold" ? "ended" : "held",
    endedAt: input.type === "cold" ? now : null,
    metadata: {
      transferPendingSip: true,
      transferType: input.type,
      transferTarget: target,
      warmConsultRoom: input.type === "warm" ? existing.livekitRoom : undefined,
    },
  });
}

export async function issueSupervisorMediaToken(input: {
  roomName: string;
  userId: string;
  mode: "whisper" | "barge";
}): Promise<CallCenterMediaSession> {
  const provider = await getCallProvider();
  if (provider.name !== "livekit") {
    return {
      provider: "none",
      roomName: input.roomName,
      token: "",
      serverUrl: "",
      expiresAt: new Date().toISOString(),
    };
  }
  const session = await provider.issueToken({
    roomName: input.roomName,
    userId: `cc-supervisor-${input.mode}-${input.userId}`,
    displayName: input.mode === "whisper" ? "Whisper" : "Barge",
    canPublish: true,
    metadata: JSON.stringify({ ccRole: input.mode }),
  });
  return {
    provider: "livekit",
    roomName: session.roomName,
    token: session.token,
    serverUrl: session.serverUrl ?? "",
    expiresAt: session.expiresAt,
  };
}

export async function startSupervisorMonitor(input: {
  callId: string;
  supervisorUserId: string;
  mode: "whisper" | "barge";
}): Promise<{ call: CallCenterCall; media: CallCenterMediaSession }> {
  const { getCall } = await import("./db");
  const existing = await getCall(input.callId);
  if (!existing) throw new Error("Call not found.");
  if (!["answered", "held"].includes(existing.status)) {
    throw new Error("Call is not active.");
  }
  const livekitRoom = existing.livekitRoom || roomNameForCall(input.callId);
  const call = await updateCall(input.callId, {
    livekitRoom,
    metadata: {
      supervisorMode: input.mode,
      supervisorUserId: input.supervisorUserId,
    },
    whisperActive: input.mode === "whisper",
    bargeActive: input.mode === "barge",
  });
  const media = await issueSupervisorMediaToken({
    roomName: livekitRoom,
    userId: input.supervisorUserId,
    mode: input.mode,
  });
  return { call, media };
}

export async function saveCallTranscript(input: {
  callId: string;
  text: string;
  status: "partial" | "final" | "stub";
}): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(input.callId);
  if (!existing) throw new Error("Call not found.");
  return updateCall(input.callId, {
    transcriptText: input.text,
    transcriptStatus: input.status,
    transcriptUpdatedAt: new Date().toISOString(),
  });
}

export async function holdCall(callId: string, agentUserId: string, held: boolean): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.agentUserId !== agentUserId) throw new Error("Call belongs to another agent.");
  if (!["answered", "held"].includes(existing.status)) {
    throw new Error("Call is not active.");
  }
  return updateCall(callId, {
    status: held ? "held" : "answered",
    metadata: { ...existing.metadata, holdBestEffort: true },
    ...(held
      ? {}
      : { parkedSlot: "", parkedAt: null, parkedBy: null }),
  });
}

export async function parkCall(
  callId: string,
  agentUserId: string,
  slot?: string,
): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.agentUserId !== agentUserId) throw new Error("Call belongs to another agent.");
  if (!["answered", "held"].includes(existing.status)) {
    throw new Error("Call is not active.");
  }
  const parkSlot = (slot?.trim() || String(Math.floor(100 + Math.random() * 800))).slice(0, 8);
  return updateCall(callId, {
    status: "held",
    parkedSlot: parkSlot,
    parkedAt: new Date().toISOString(),
    parkedBy: agentUserId,
    metadata: { ...existing.metadata, parked: true, holdBestEffort: true },
  });
}

export async function retrieveParkedCall(
  callId: string,
  agentUserId: string,
): Promise<CallCenterCall> {
  const { getCall } = await import("./db");
  const existing = await getCall(callId);
  if (!existing) throw new Error("Call not found.");
  if (existing.status !== "held" || !existing.parkedSlot) {
    throw new Error("Call is not parked.");
  }
  return updateCall(callId, {
    status: "answered",
    agentUserId,
    parkedSlot: "",
    parkedAt: null,
    parkedBy: null,
    metadata: { ...existing.metadata, parked: false, retrievedBy: agentUserId },
  });
}

export async function issueAgentMediaToken(input: {
  roomName: string;
  userId: string;
  displayName: string;
}): Promise<CallCenterMediaSession> {
  const provider = await getCallProvider();
  if (provider.name !== "livekit") {
    return {
      provider: "none",
      roomName: input.roomName,
      token: "",
      serverUrl: "",
      expiresAt: new Date().toISOString(),
    };
  }
  const session = await provider.issueToken({
    roomName: input.roomName,
    userId: `cc-agent-${input.userId}`,
    displayName: input.displayName,
    canPublish: true,
  });
  return {
    provider: "livekit",
    roomName: session.roomName,
    token: session.token,
    serverUrl: session.serverUrl ?? "",
    expiresAt: session.expiresAt,
  };
}

