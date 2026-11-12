import "server-only";

import { getCallProvider } from "@/lib/chat/call-provider";

import {
  createCall,
  findDidByE164,
  getAgentStatus,
  listAvailableAgents,
  listIvrMenus,
  listIvrOptions,
  listQueueMembers,
  listQueues,
  loadSettingsRow,
  normalizeE164,
  setAgentStatus,
  updateCall,
} from "./db";
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

  const useIvr =
    !input.skipIvr &&
    Boolean(settings?.ivr_enabled) &&
    Boolean(did?.ivrMenuId) &&
    !forceQueue;

  if (useIvr && did?.ivrMenuId) {
    const menus = await listIvrMenus();
    const menu = menus.find((m) => m.id === did.ivrMenuId && m.isActive);
    if (menu) {
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
      const updated = await updateCall(call.id, { livekitRoom });
      return {
        call: updated,
        offeredUserIds: [],
        phase: "ivr",
        message: menu.greetingText || "IVR menu active.",
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

/** Apply IVR digit selection and continue to queue / hangup / etc. */
export async function applyIvrDigit(callId: string, digit: string): Promise<InboundRouteResult> {
  const { getCall } = await import("./db");
  const call = await getCall(callId);
  if (!call || call.status !== "ivr" || !call.ivrMenuId) {
    throw new Error("Call is not waiting on IVR.");
  }
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
    return { call: ended, offeredUserIds: [], phase: "ended", message: "Routed to voicemail." };
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
  const call = await updateCall(callId, {
    status: "ended",
    hangupReason: "Agent hangup",
    endedAt: new Date().toISOString(),
  });
  const status = await getAgentStatus(agentUserId);
  // Move to ACW briefly if they were on a call; admin can tune wrap-up later.
  if (status && status.status === "busy") {
    await setAgentStatus(agentUserId, "acw", { lastCallAt: new Date().toISOString() });
  }
  return call;
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
    metadata: { holdBestEffort: true },
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

