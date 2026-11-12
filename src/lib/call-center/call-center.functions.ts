"use server";

import { z } from "zod";

import { getCallProvider } from "@/lib/chat/call-provider";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import {
  deleteCampaign,
  deleteCampaignContact,
  deleteDid,
  deleteHoliday,
  deleteIvrMenu,
  deleteIvrOption,
  deleteQueue,
  deleteQueueMember,
  deleteWebhookEndpoint,
  getAgentStatus,
  getAnalyticsSummary,
  getCall,
  keepSecret,
  listActiveCalls,
  listAgentStatuses,
  listCampaignContacts,
  listCampaigns,
  listCallsFiltered,
  listDids,
  listHolidays,
  listIvrMenus,
  listIvrOptions,
  listQueueMembers,
  listQueues,
  listRecentCalls,
  listRingingCallsForAgent,
  listWebhookEndpoints,
  loadSettingsRow,
  saveSettingsRow,
  setAgentStatus,
  upsertCampaign,
  upsertCampaignContact,
  upsertDid,
  upsertHoliday,
  upsertIvrMenu,
  upsertIvrOption,
  upsertQueue,
  upsertQueueMember,
  upsertWebhookEndpoint,
} from "./db";
import {
  answerCall,
  applyIvrDigit,
  declineCall,
  hangupCall,
  holdCall,
  issueAgentMediaToken,
  placeOutboundCall,
  requestTransfer,
  routeInboundCall,
} from "./routing";
import { toPublicSettings } from "./settings-public";
import type { CallCenterAgentStatusValue } from "./types";

const ADMIN_AUTH = { capability: "admin.view" as const, minRoleLevel: 95 };
const AGENT_AUTH = { capability: "call_center.view" as const };

const optionalUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .transform((value) => (value === "" || value === null ? null : value));

export const loadCallCenterAdminBundle = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [settings, queues, members, dids, menus, options, recentCalls, holidays, campaigns, webhooks] =
      await Promise.all([
        loadSettingsRow(),
        listQueues(),
        listQueueMembers(),
        listDids(),
        listIvrMenus(),
        listIvrOptions(),
        listRecentCalls(30),
        listHolidays(),
        listCampaigns(),
        listWebhookEndpoints(),
      ]);
    const provider = await getCallProvider();
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      queues,
      members,
      dids,
      menus,
      options,
      recentCalls,
      holidays,
      campaigns,
      webhooks,
    };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterSettings = createSafeAuthenticatedAction(
  z.object({
    enabled: z.boolean(),
    ivrEnabled: z.boolean(),
    businessHoursEnabled: z.boolean(),
    businessHoursJson: z.record(z.unknown()).optional(),
    timezone: z.string().trim().max(80),
    defaultQueueId: z.string().uuid().nullable().optional(),
    telnyxSipUri: z.string().trim().max(500),
    telnyxConnectionId: z.string().trim().max(200),
    telnyxApiKey: z.string().max(500),
    telnyxWebhookSecret: z.string().max(500),
    livekitSipTrunkId: z.string().trim().max(200),
    livekitSipDispatchRuleId: z.string().trim().max(200),
    webhookSharedSecret: z.string().max(500),
    notes: z.string().max(2000),
    aiFirstAnswerEnabled: z.boolean().optional(),
    aiHandoffEnabled: z.boolean().optional(),
    aiNotes: z.string().max(2000).optional(),
    outboundCallerIdE164: z.string().trim().max(20).optional(),
    webhookOutboundUrl: z.string().trim().max(500).optional(),
  }),
  async (data, context) => {
    const existing = await loadSettingsRow();
    const saved = await saveSettingsRow(
      {
        enabled: data.enabled,
        ivr_enabled: data.ivrEnabled,
        business_hours_enabled: data.businessHoursEnabled,
        business_hours_json: data.businessHoursJson ?? existing?.business_hours_json ?? {},
        timezone: data.timezone || "Asia/Qatar",
        default_queue_id: data.defaultQueueId ?? existing?.default_queue_id ?? null,
        telnyx_sip_uri: data.telnyxSipUri,
        telnyx_connection_id: data.telnyxConnectionId,
        telnyx_api_key: keepSecret(existing?.telnyx_api_key ?? "", data.telnyxApiKey),
        telnyx_webhook_secret: keepSecret(
          existing?.telnyx_webhook_secret ?? "",
          data.telnyxWebhookSecret,
        ),
        livekit_sip_trunk_id: data.livekitSipTrunkId,
        livekit_sip_dispatch_rule_id: data.livekitSipDispatchRuleId,
        webhook_shared_secret: keepSecret(
          existing?.webhook_shared_secret ?? "",
          data.webhookSharedSecret,
        ),
        notes: data.notes,
        ai_first_answer_enabled: data.aiFirstAnswerEnabled ?? existing?.ai_first_answer_enabled ?? false,
        ai_handoff_enabled: data.aiHandoffEnabled ?? existing?.ai_handoff_enabled ?? true,
        ai_notes: data.aiNotes ?? existing?.ai_notes ?? "",
        outbound_caller_id_e164: data.outboundCallerIdE164 ?? existing?.outbound_caller_id_e164 ?? "",
        webhook_outbound_url: data.webhookOutboundUrl ?? existing?.webhook_outbound_url ?? "",
      },
      context.userId,
    );
    const provider = await getCallProvider();
    return toPublicSettings(saved, provider.name === "livekit");
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterQueue = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    strategy: z.enum(["simultaneous", "round_robin", "longest_idle"]),
    eventId: optionalUuid.optional(),
    wrapUpSeconds: z.number().int().min(0).max(600),
    maxWaitSeconds: z.number().int().min(0).max(3600),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(9999),
  }),
  async (data) =>
    upsertQueue({
      id: data.id,
      name: data.name,
      strategy: data.strategy,
      eventId: data.eventId ?? null,
      wrapUpSeconds: data.wrapUpSeconds,
      maxWaitSeconds: data.maxWaitSeconds,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterQueue = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteQueue(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterQueueMember = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    queueId: z.string().uuid(),
    userId: z.string().uuid(),
    priority: z.number().int().min(0).max(9999),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertQueueMember({
      id: data.id,
      queueId: data.queueId,
      userId: data.userId,
      priority: data.priority,
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterQueueMember = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteQueueMember(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterDid = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    e164: z.string().trim().min(4).max(20),
    label: z.string().trim().max(120),
    queueId: optionalUuid.optional(),
    eventId: optionalUuid.optional(),
    ivrMenuId: optionalUuid.optional(),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertDid({
      id: data.id,
      e164: data.e164,
      label: data.label,
      queueId: data.queueId ?? null,
      eventId: data.eventId ?? null,
      ivrMenuId: data.ivrMenuId ?? null,
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterDid = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteDid(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterIvrMenu = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    greetingText: z.string().max(2000),
    timeoutSeconds: z.number().int().min(1).max(60),
    maxRetries: z.number().int().min(0).max(5),
    fallbackQueueId: optionalUuid.optional(),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertIvrMenu({
      id: data.id,
      name: data.name,
      greetingText: data.greetingText,
      timeoutSeconds: data.timeoutSeconds,
      maxRetries: data.maxRetries,
      fallbackQueueId: data.fallbackQueueId ?? null,
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterIvrMenu = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteIvrMenu(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterIvrOption = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    menuId: z.string().uuid(),
    digit: z.string().regex(/^[0-9*#]$/),
    label: z.string().trim().max(120),
    action: z.enum(["queue", "voicemail", "hangup", "transfer_sip", "repeat"]),
    queueId: optionalUuid.optional(),
    eventId: optionalUuid.optional(),
    transferSipUri: z.string().trim().max(500),
    sortOrder: z.number().int().min(0).max(99),
  }),
  async (data) =>
    upsertIvrOption({
      id: data.id,
      menuId: data.menuId,
      digit: data.digit,
      label: data.label,
      action: data.action,
      queueId: data.queueId ?? null,
      eventId: data.eventId ?? null,
      transferSipUri: data.transferSipUri,
      sortOrder: data.sortOrder,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterIvrOption = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteIvrOption(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterAgentWorkspace = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const [status, ringing, recent, settings, provider, dids] = await Promise.all([
      getAgentStatus(context.userId),
      listRingingCallsForAgent(context.userId),
      listRecentCalls(25),
      loadSettingsRow(),
      getCallProvider(),
      listDids(),
    ]);
    return {
      status: status ?? {
        userId: context.userId,
        status: "offline" as CallCenterAgentStatusValue,
        statusSince: new Date().toISOString(),
        lastCallAt: null,
      },
      ringing,
      recentCalls: recent,
      settings: toPublicSettings(settings, provider.name === "livekit"),
      dids: dids.filter((d) => d.isActive),
    };
  },
  { auth: AGENT_AUTH },
);

export const setCallCenterAgentStatus = createSafeAuthenticatedAction(
  z.object({
    status: z.enum(["available", "busy", "away", "acw", "offline"]),
  }),
  async (data, context) => setAgentStatus(context.userId, data.status),
  { auth: AGENT_AUTH },
);

export const pollCallCenterIncoming = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => listRingingCallsForAgent(context.userId),
  { auth: AGENT_AUTH },
);

export const testCallCenterRing = createSafeAuthenticatedAction(
  z.object({
    fromE164: z.string().trim().max(20).optional(),
  }),
  async (data, context) => {
    const settings = await loadSettingsRow();
    if (!settings) throw new Error("Call Center is not set up. Run the migration first.");
    // Ensure the agent is available so routing can offer (test forces agent anyway).
    await setAgentStatus(context.userId, "available");
    return routeInboundCall({
      fromE164: data.fromE164?.trim() || "+97400000000",
      toE164: "test",
      provider: "test",
      forceAgentUserId: context.userId,
      skipIvr: true,
    });
  },
  { auth: AGENT_AUTH },
);

export const answerCallCenterCall = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data, context) => answerCall(data.callId, context.userId),
  { auth: AGENT_AUTH },
);

export const declineCallCenterCall = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data, context) => declineCall(data.callId, context.userId),
  { auth: AGENT_AUTH },
);

export const hangupCallCenterCall = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data, context) => hangupCall(data.callId, context.userId),
  { auth: AGENT_AUTH },
);

export const holdCallCenterCall = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid(), held: z.boolean() }),
  async (data, context) => holdCall(data.callId, context.userId, data.held),
  { auth: AGENT_AUTH },
);

export const sendCallCenterDtmf = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    digit: z.string().regex(/^[0-9*#]$/),
  }),
  async (data, context) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    if (call.status === "ivr") {
      return applyIvrDigit(data.callId, data.digit);
    }
    if (call.agentUserId !== context.userId) {
      throw new Error("Call belongs to another agent.");
    }
    // Best-effort DTMF log while LiveKit SIP DTMF publish is wired later.
    return {
      call,
      offeredUserIds: [],
      phase: "queue" as const,
      message: `DTMF ${data.digit} recorded.`,
    };
  },
  { auth: AGENT_AUTH },
);

export const refreshCallCenterMedia = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data, context) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    if (call.agentUserId !== context.userId) throw new Error("Call belongs to another agent.");
    const media = await issueAgentMediaToken({
      roomName: call.livekitRoom || `cc-${call.id.slice(0, 8)}`,
      userId: context.userId,
      displayName: "Agent",
    });
    return { call, media };
  },
  { auth: AGENT_AUTH },
);

export const placeCallCenterOutbound = createSafeAuthenticatedAction(
  z.object({
    toE164: z.string().trim().min(4).max(20),
    fromE164: z.string().trim().max(20).optional(),
    campaignId: optionalUuid.optional(),
    eventId: optionalUuid.optional(),
  }),
  async (data, context) =>
    placeOutboundCall({
      agentUserId: context.userId,
      toE164: data.toE164,
      fromE164: data.fromE164,
      campaignId: data.campaignId ?? null,
      eventId: data.eventId ?? null,
    }),
  { auth: AGENT_AUTH },
);

export const transferCallCenterCall = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    type: z.enum(["cold", "warm"]),
    target: z.string().trim().min(1).max(200),
  }),
  async (data, context) =>
    requestTransfer({
      callId: data.callId,
      agentUserId: context.userId,
      type: data.type,
      target: data.target,
    }),
  { auth: AGENT_AUTH },
);

export const loadCallCenterWallboard = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [agents, activeCalls, queues, members] = await Promise.all([
      listAgentStatuses(),
      listActiveCalls(),
      listQueues(),
      listQueueMembers(),
    ]);
    return { agents, activeCalls, queues, members };
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterCdr = createSafeAuthenticatedAction(
  z.object({
    fromDate: z.string().optional().nullable(),
    toDate: z.string().optional().nullable(),
    agentUserId: optionalUuid.optional(),
    queueId: optionalUuid.optional(),
    eventId: optionalUuid.optional(),
    direction: z.enum(["inbound", "outbound", "internal_test"]).optional().nullable(),
    status: z
      .enum([
        "ringing",
        "queued",
        "ivr",
        "offered",
        "answered",
        "held",
        "ended",
        "missed",
        "declined",
        "failed",
        "voicemail",
      ])
      .optional()
      .nullable(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  async (data) =>
    listCallsFiltered({
      fromDate: data.fromDate ?? null,
      toDate: data.toDate ?? null,
      agentUserId: data.agentUserId ?? null,
      queueId: data.queueId ?? null,
      eventId: data.eventId ?? null,
      direction: data.direction ?? null,
      status: data.status ?? null,
      limit: data.limit ?? 100,
    }),
  { auth: AGENT_AUTH },
);

export const loadCallCenterAnalytics = createSafeAuthenticatedAction(
  z.object({}),
  async () => getAnalyticsSummary(),
  { auth: AGENT_AUTH },
);

export const saveCallCenterHoliday = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    isClosed: z.boolean(),
    notes: z.string().max(500),
  }),
  async (data) =>
    upsertHoliday({
      id: data.id,
      name: data.name,
      holidayDate: data.holidayDate,
      isClosed: data.isClosed,
      notes: data.notes,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterHoliday = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteHoliday(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterCampaign = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    status: z.enum(["draft", "active", "paused", "completed", "cancelled"]),
    callerIdE164: z.string().trim().max(20),
    queueId: optionalUuid.optional(),
    eventId: optionalUuid.optional(),
    scriptText: z.string().max(4000),
    scheduledStart: z.string().nullable().optional(),
    scheduledEnd: z.string().nullable().optional(),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertCampaign({
      id: data.id,
      name: data.name,
      status: data.status,
      callerIdE164: data.callerIdE164,
      queueId: data.queueId ?? null,
      eventId: data.eventId ?? null,
      scriptText: data.scriptText,
      scheduledStart: data.scheduledStart ?? null,
      scheduledEnd: data.scheduledEnd ?? null,
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterCampaign = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteCampaign(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterCampaignContacts = createSafeAuthenticatedAction(
  z.object({ campaignId: z.string().uuid() }),
  async (data) => listCampaignContacts(data.campaignId),
  { auth: AGENT_AUTH },
);

export const saveCallCenterCampaignContact = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    campaignId: z.string().uuid(),
    e164: z.string().trim().min(4).max(20),
    displayName: z.string().trim().max(120),
    notes: z.string().max(500).optional(),
  }),
  async (data) =>
    upsertCampaignContact({
      id: data.id,
      campaignId: data.campaignId,
      e164: data.e164,
      displayName: data.displayName,
      notes: data.notes,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterCampaignContact = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteCampaignContact(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterWebhookEndpoint = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    url: z.string().trim().url().max(500),
    events: z.array(z.string().max(80)).min(1).max(20),
    isActive: z.boolean(),
    secretHint: z.string().max(80),
  }),
  async (data) =>
    upsertWebhookEndpoint({
      id: data.id,
      name: data.name,
      url: data.url,
      events: data.events,
      isActive: data.isActive,
      secretHint: data.secretHint,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterWebhookEndpoint = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteWebhookEndpoint(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterConfigBundle = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [settings, queues, members, dids, menus, options, holidays, campaigns, webhooks, analytics] =
      await Promise.all([
        loadSettingsRow(),
        listQueues(),
        listQueueMembers(),
        listDids(),
        listIvrMenus(),
        listIvrOptions(),
        listHolidays(),
        listCampaigns(),
        listWebhookEndpoints(),
        getAnalyticsSummary(),
      ]);
    const provider = await getCallProvider();
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      queues,
      members,
      dids,
      menus,
      options,
      holidays,
      campaigns,
      webhooks,
      analytics,
    };
  },
  { auth: AGENT_AUTH },
);

