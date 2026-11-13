"use server";

import { z } from "zod";

import { generateText } from "@/lib/ai/gateway";
import { getCallProvider } from "@/lib/chat/call-provider";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";

import {
  assignWhatsappConversation,
  deleteBlacklistEntry,
  deleteCampaign,
  deleteCampaignContact,
  deleteDid,
  deleteHoliday,
  deleteIvrMenu,
  deleteIvrOption,
  deletePhoneContact,
  deleteQueue,
  deleteQueueMember,
  deleteWebhookEndpoint,
  getAgentPerformance,
  getAgentStatus,
  getAnalyticsSummary,
  getCall,
  getWhatsappConversation,
  insertWhatsappOutboundMessage,
  keepSecret,
  normalizeSipUriHost,
  listActiveCalls,
  listAgentStatuses,
  listBlacklist,
  listCampaignContacts,
  listCampaigns,
  listCallsFiltered,
  listDids,
  listHolidays,
  listIvrMenus,
  listIvrOptions,
  listParkedCalls,
  listPhoneContacts,
  listQueueMembers,
  listQueues,
  listRecentCalls,
  listRingingCallsForAgent,
  listSpeedDials,
  listTagCatalog,
  listWebhookEndpoints,
  listWhatsappConversations,
  listWhatsappMessages,
  loadSettingsRow,
  resolveWhatsappAccessToken,
  resolveWhatsappPhoneNumberId,
  saveCallAgentNotes,
  saveSettingsRow,
  setAgentExtension,
  setAgentStatus,
  updateCall,
  updateCallCenterAgentProfile,
  deleteSpeedDial,
  upsertBlacklistEntry,
  upsertCampaign,
  upsertCampaignContact,
  upsertDid,
  upsertHoliday,
  upsertPhoneContact,
  upsertTagCatalogItem,
  createVoicemail,
  listVoicemails,
  markVoicemailListened,
  saveIvrFlow,
  upsertIvrMenu,
  upsertIvrOption,
  upsertQueue,
  upsertQueueMember,
  upsertSpeedDial,
  upsertWebhookEndpoint,
} from "./db";
import {
  answerCall,
  applyIvrDigit,
  declineCall,
  hangupCall,
  holdCall,
  issueAgentMediaToken,
  parkCall,
  placeOutboundCall,
  requestTransfer,
  retrieveParkedCall,
  routeInboundCall,
  saveCallTranscript,
  startSupervisorMonitor,
} from "./routing";
import { buildFecVenuesTemplate } from "./ivr-flow";
import { toPublicSettings } from "./settings-public";
import {
  CALL_CENTER_VENUE_QUEUE_IDS,
  type CallCenterAgentStatusValue,
  type CallCenterAiProvider,
} from "./types";

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
    aiSystemPromptEn: z.string().max(8000).optional(),
    aiSystemPromptAr: z.string().max(8000).optional(),
    aiWelcomeEn: z.string().max(2000).optional(),
    aiWelcomeAr: z.string().max(2000).optional(),
    aiProvider: z.enum(["openai", "openai_compatible", "livekit_agents"]).optional(),
    aiModel: z.string().trim().max(120).optional(),
    aiApiKey: z.string().max(500).optional(),
    aiBaseUrl: z.string().trim().max(500).optional(),
    aiLanguages: z.array(z.string().trim().min(2).max(12)).max(12).optional(),
    aiHandoffAfterSeconds: z.number().int().min(0).max(600).optional(),
    aiHandoffKeywords: z.string().max(1000).optional(),
    aiHandoffQueueId: optionalUuid.optional(),
    aiLivekitAgentName: z.string().trim().max(120).optional(),
    whatsappEnabled: z.boolean().optional(),
    whatsappPhoneNumberId: z.string().trim().max(80).optional(),
    whatsappWabaId: z.string().trim().max(80).optional(),
    whatsappAccessToken: z.string().max(500).optional(),
    whatsappVerifyToken: z.string().max(200).optional(),
    outboundCallerIdE164: z.string().trim().max(20).optional(),
    // Full https:// URLs are allowed; never treat as a secret / write-only field
    webhookOutboundUrl: z.string().trim().max(2000).optional(),
    afterHoursGreeting: z.string().max(2000).optional(),
    afterHoursAction: z.enum(["voicemail", "hangup", "queue"]).optional(),
    welcomeGreeting: z.string().max(2000).optional(),
    welcomeAudioUrl: z.string().max(1000).optional(),
    holdMusicUrl: z.string().max(1000).optional(),
    ttsEnabled: z.boolean().optional(),
    ttsVoice: z.string().max(120).optional(),
    ttsGreetingText: z.string().max(2000).optional(),
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
        telnyx_sip_uri: normalizeSipUriHost(data.telnyxSipUri),
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
        ai_system_prompt_en: data.aiSystemPromptEn ?? existing?.ai_system_prompt_en ?? "",
        ai_system_prompt_ar: data.aiSystemPromptAr ?? existing?.ai_system_prompt_ar ?? "",
        ai_welcome_en:
          data.aiWelcomeEn ??
          existing?.ai_welcome_en ??
          "Hello, thank you for calling. How can I help you today?",
        ai_welcome_ar:
          data.aiWelcomeAr ??
          existing?.ai_welcome_ar ??
          "مرحباً، شكراً لاتصالك. كيف يمكنني مساعدتك؟",
        ai_provider: (data.aiProvider ?? existing?.ai_provider ?? "openai") as CallCenterAiProvider,
        ai_model: data.aiModel ?? existing?.ai_model ?? "gpt-4o-mini",
        ai_api_key: keepSecret(existing?.ai_api_key ?? "", data.aiApiKey ?? ""),
        ai_base_url: data.aiBaseUrl ?? existing?.ai_base_url ?? "",
        ai_languages: data.aiLanguages ?? existing?.ai_languages ?? ["en", "ar"],
        ai_handoff_after_seconds:
          data.aiHandoffAfterSeconds ?? existing?.ai_handoff_after_seconds ?? 45,
        ai_handoff_keywords:
          data.aiHandoffKeywords ??
          existing?.ai_handoff_keywords ??
          "agent,human,representative,مشغل,موظف",
        ai_handoff_queue_id:
          data.aiHandoffQueueId !== undefined
            ? data.aiHandoffQueueId
            : (existing?.ai_handoff_queue_id ?? null),
        ai_livekit_agent_name:
          data.aiLivekitAgentName ?? existing?.ai_livekit_agent_name ?? "",
        whatsapp_enabled: data.whatsappEnabled ?? existing?.whatsapp_enabled ?? false,
        whatsapp_phone_number_id:
          data.whatsappPhoneNumberId ?? existing?.whatsapp_phone_number_id ?? "",
        whatsapp_waba_id: data.whatsappWabaId ?? existing?.whatsapp_waba_id ?? "",
        whatsapp_access_token: keepSecret(
          existing?.whatsapp_access_token ?? "",
          data.whatsappAccessToken ?? "",
        ),
        whatsapp_verify_token: keepSecret(
          existing?.whatsapp_verify_token ?? "",
          data.whatsappVerifyToken ?? "",
        ),
        outbound_caller_id_e164: data.outboundCallerIdE164 ?? existing?.outbound_caller_id_e164 ?? "",
        after_hours_greeting:
          data.afterHoursGreeting ??
          existing?.after_hours_greeting ??
          "We are currently closed. Please leave a message or call back during business hours.",
        after_hours_action: data.afterHoursAction ?? existing?.after_hours_action ?? "voicemail",
        webhook_outbound_url: data.webhookOutboundUrl ?? existing?.webhook_outbound_url ?? "",
        welcome_greeting:
          data.welcomeGreeting ??
          existing?.welcome_greeting ??
          "Thank you for calling. Please hold while we connect you.",
        welcome_audio_url: data.welcomeAudioUrl ?? existing?.welcome_audio_url ?? "",
        hold_music_url: data.holdMusicUrl ?? existing?.hold_music_url ?? "",
        tts_enabled: data.ttsEnabled ?? existing?.tts_enabled ?? false,
        tts_voice: data.ttsVoice ?? existing?.tts_voice ?? "en-US-Neural2-A",
        tts_greeting_text:
          data.ttsGreetingText ??
          existing?.tts_greeting_text ??
          "Welcome. Press a digit from the menu or stay on the line.",
      },
      context.userId,
    );
    const provider = await getCallProvider();
    return toPublicSettings(saved, provider.name === "livekit");
  },
  { auth: ADMIN_AUTH },
);

/** Admin-only: return one stored secret so the settings form can reveal/edit it. */
export const revealCallCenterSettingSecret = createSafeAuthenticatedAction(
  z.object({
    field: z.enum([
      "telnyx_api_key",
      "telnyx_webhook_secret",
      "webhook_shared_secret",
      "ai_api_key",
      "whatsapp_access_token",
      "whatsapp_verify_token",
    ]),
  }),
  async (data) => {
    const row = await loadSettingsRow();
    const value = row?.[data.field]?.trim() ?? "";
    return { field: data.field, value };
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
    skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  }),
  async (data) =>
    upsertQueueMember({
      id: data.id,
      queueId: data.queueId,
      userId: data.userId,
      priority: data.priority,
      isActive: data.isActive,
      skills: data.skills ?? [],
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
    action: z.enum(["queue", "voicemail", "hangup", "transfer_sip", "repeat", "menu", "agent", "ai"]),
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

const ivrFlowNodeSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum([
    "start",
    "menu",
    "play",
    "queue",
    "agent",
    "ai",
    "hangup",
    "hours",
    "voicemail",
    "event",
  ]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z
    .object({
      label: z.string().max(120),
      greetingText: z.string().max(2000).optional(),
      messageText: z.string().max(2000).optional(),
      greetingEn: z.string().max(2000).optional(),
      greetingAr: z.string().max(2000).optional(),
      messageEn: z.string().max(2000).optional(),
      messageAr: z.string().max(2000).optional(),
      digits: z
        .array(
          z.object({
            digit: z.string().regex(/^[0-9*#]$/),
            label: z.string().max(120),
          }),
        )
        .optional(),
      queueId: optionalUuid.optional(),
      agentUserId: optionalUuid.optional(),
      eventId: optionalUuid.optional(),
      transferSipUri: z.string().max(500).optional(),
      timeoutSeconds: z.number().int().min(1).max(60).optional(),
      maxRetries: z.number().int().min(0).max(5).optional(),
      aiEnabled: z.boolean().optional(),
      aiSystemPrompt: z.string().max(4000).optional(),
      aiLanguage: z.enum(["en", "ar", "auto"]).optional(),
      aiHandoffQueueId: optionalUuid.optional(),
    })
    .passthrough(),
});

export const saveCallCenterIvrFlow = createSafeAuthenticatedAction(
  z.object({
    menuId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    greetingText: z.string().max(2000).optional(),
    timeoutSeconds: z.number().int().min(1).max(60).optional(),
    maxRetries: z.number().int().min(0).max(5).optional(),
    fallbackQueueId: optionalUuid.optional(),
    isActive: z.boolean().optional(),
    flow: z.object({
      version: z.literal(1),
      nodes: z.array(ivrFlowNodeSchema).max(80),
      edges: z
        .array(
          z.object({
            id: z.string().min(1).max(120),
            source: z.string().min(1).max(80),
            target: z.string().min(1).max(80),
            sourceHandle: z.string().max(40).nullable().optional(),
            targetHandle: z.string().max(40).nullable().optional(),
            label: z.string().max(40).optional(),
          }),
        )
        .max(160),
      viewport: z
        .object({
          x: z.number(),
          y: z.number(),
          zoom: z.number().min(0.2).max(2),
        })
        .optional(),
    }),
  }),
  async (data) =>
    saveIvrFlow({
      menuId: data.menuId,
      name: data.name,
      greetingText: data.greetingText,
      timeoutSeconds: data.timeoutSeconds,
      maxRetries: data.maxRetries,
      fallbackQueueId: data.fallbackQueueId,
      isActive: data.isActive,
      flow: data.flow,
    }),
  { auth: ADMIN_AUTH },
);

const VENUE_QUEUE_DEFS = [
  {
    id: CALL_CENTER_VENUE_QUEUE_IDS.inflatapark,
    name: "InflataPark",
    sortOrder: 10,
  },
  {
    id: CALL_CENTER_VENUE_QUEUE_IDS.urbanArena,
    name: "Urban Arena",
    sortOrder: 11,
  },
  {
    id: CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving,
    name: "Kids Driving School",
    sortOrder: 12,
  },
  {
    id: CALL_CENTER_VENUE_QUEUE_IDS.birthday,
    name: "Birthday enquiry",
    sortOrder: 13,
  },
] as const;

/** Ensure venue queues exist and replace the menu canvas with the bilingual FEC template. */
export const applyCallCenterFecVenuesIvrTemplate = createSafeAuthenticatedAction(
  z.object({
    menuId: z.string().uuid(),
  }),
  async (data) => {
    const existingQueues = await listQueues();
    const byName = new Map(existingQueues.map((q) => [q.name.toLowerCase(), q]));
    const resolved: Record<string, string> = {};

    for (const def of VENUE_QUEUE_DEFS) {
      const named = byName.get(def.name.toLowerCase());
      if (named) {
        resolved[def.id] = named.id;
        continue;
      }
      const created = await upsertQueue({
        id: def.id,
        name: def.name,
        strategy: "simultaneous",
        eventId: null,
        wrapUpSeconds: 30,
        maxWaitSeconds: 120,
        isActive: true,
        sortOrder: def.sortOrder,
      });
      resolved[def.id] = created.id;
    }

    const flow = buildFecVenuesTemplate({
      inflatapark: resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark]!,
      urbanArena: resolved[CALL_CENTER_VENUE_QUEUE_IDS.urbanArena]!,
      kidsDriving: resolved[CALL_CENTER_VENUE_QUEUE_IDS.kidsDriving]!,
      birthday: resolved[CALL_CENTER_VENUE_QUEUE_IDS.birthday]!,
    });

    const greeting =
      flow.nodes.find((n) => n.type === "start")?.data.greetingEn ||
      flow.nodes.find((n) => n.type === "start")?.data.greetingText ||
      "Thank you for calling FEC.";

    return saveIvrFlow({
      menuId: data.menuId,
      name: "Main menu",
      greetingText: greeting,
      fallbackQueueId: resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark] ?? null,
      isActive: true,
      timeoutSeconds: 10,
      maxRetries: 2,
      flow,
    });
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterAgentWorkspace = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const [status, ringing, recent, settings, provider, dids, queues, members, agents] =
      await Promise.all([
        getAgentStatus(context.userId),
        listRingingCallsForAgent(context.userId),
        listRecentCalls(25),
        loadSettingsRow(),
        getCallProvider(),
        listDids(),
        listQueues(),
        listQueueMembers(),
        listAgentStatuses(),
      ]);
    let speedDials: Awaited<ReturnType<typeof listSpeedDials>> = [];
    try {
      speedDials = await listSpeedDials(context.userId);
    } catch {
      speedDials = [];
    }
    const myMemberships = members.filter((m) => m.userId === context.userId && m.isActive);
    const myQueueIds = new Set(myMemberships.map((m) => m.queueId));
    const myQueues = queues.filter((q) => q.isActive && myQueueIds.has(q.id));
    const wrapUpSeconds =
      myQueues.length > 0
        ? Math.max(...myQueues.map((q) => q.wrapUpSeconds || 30))
        : 30;
    return {
      status: status ?? {
        userId: context.userId,
        status: "offline" as CallCenterAgentStatusValue,
        statusSince: new Date().toISOString(),
        lastCallAt: null,
        extension: "",
        displayNameOverride: "",
        maxConcurrentCalls: 1,
        canWhisper: false,
        canBarge: false,
        isActive: true,
        skills: [],
      },
      ringing,
      recentCalls: recent,
      settings: toPublicSettings(settings, provider.name === "livekit"),
      dids: dids.filter((d) => d.isActive),
      myQueues,
      myMemberships,
      wrapUpSeconds,
      speedDials,
      availableAgents: agents.filter((a) => a.status === "available" && a.userId !== context.userId),
      agents,
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
    toE164: z.string().trim().min(2).max(20),
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

export const joinCallCenterMonitor = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    mode: z.enum(["whisper", "barge"]),
  }),
  async (data, context) =>
    startSupervisorMonitor({
      callId: data.callId,
      supervisorUserId: context.userId,
      mode: data.mode,
    }),
  { auth: ADMIN_AUTH },
);

export const saveCallCenterTranscript = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    text: z.string().max(50_000),
    status: z.enum(["partial", "final", "stub"]).optional(),
  }),
  async (data) =>
    saveCallTranscript({
      callId: data.callId,
      text: data.text,
      status: data.status ?? "final",
    }),
  { auth: AGENT_AUTH },
);

export const generateCallCenterTranscriptStub = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    const stub = [
      `[Stub transcript — ${new Date().toISOString()}]`,
      `Direction: ${call.direction}`,
      `From: ${call.fromE164 || "—"}`,
      `To: ${call.toE164 || "—"}`,
      `Status: ${call.status}`,
      call.transferType
        ? `Transfer: ${call.transferType} → ${call.transferTarget}`
        : "Transfer: none",
      "",
      "No STT provider configured. Replace via saveCallCenterTranscript or wire LiveKit egress / speech service.",
    ].join("\n");
    return saveCallTranscript({
      callId: data.callId,
      text: stub,
      status: "stub",
    });
  },
  { auth: AGENT_AUTH },
);

export const saveCallCenterAgentNotes = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    notes: z.string().max(4000),
  }),
  async (data, context) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    if (call.agentUserId && call.agentUserId !== context.userId) {
      throw new Error("Call belongs to another agent.");
    }
    return saveCallAgentNotes(data.callId, data.notes);
  },
  { auth: AGENT_AUTH },
);

export const saveCallCenterSpeedDial = createSafeAuthenticatedAction(
  z.object({
    id: optionalUuid.optional(),
    label: z.string().trim().min(1).max(80),
    e164: z.string().trim().min(3).max(32),
    sortOrder: z.number().int().min(0).max(999).optional(),
  }),
  async (data, context) =>
    upsertSpeedDial({
      id: data.id ?? undefined,
      userId: context.userId,
      label: data.label,
      e164: data.e164,
      sortOrder: data.sortOrder,
    }),
  { auth: AGENT_AUTH },
);

export const deleteCallCenterSpeedDial = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    await deleteSpeedDial(data.id, context.userId);
    return { ok: true as const };
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterWallboard = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [agents, activeCalls, queues, members, analytics] = await Promise.all([
      listAgentStatuses(),
      listActiveCalls(),
      listQueues(),
      listQueueMembers(),
      getAnalyticsSummary(),
    ]);
    return {
      agents,
      activeCalls,
      queues,
      members,
      metrics: {
        agentsAvailable: analytics.agentsAvailable,
        agentsInCall: analytics.agentsInCall,
        activeCalls: analytics.activeCalls,
        avgSpeedAnswerSeconds: analytics.avgSpeedAnswerSeconds,
        abandonRate: analytics.abandonRate,
        missedToday: analytics.missedToday,
        voicemailsPending: analytics.voicemailsPending,
      },
    };
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
    const [
      settings,
      queues,
      members,
      dids,
      menus,
      options,
      holidays,
      campaigns,
      webhooks,
      analytics,
      agents,
    ] = await Promise.all([
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
      listAgentStatuses(),
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
      agents,
    };
  },
  { auth: AGENT_AUTH },
);


export const saveCallCenterDisposition = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    dispositionCode: z.string().trim().max(60),
    dispositionNotes: z.string().trim().max(2000).optional(),
  }),
  async (data) =>
    updateCall(data.callId, {
      dispositionCode: data.dispositionCode,
      dispositionNotes: data.dispositionNotes ?? "",
    }),
  { auth: AGENT_AUTH },
);

export const setCallCenterRecording = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    enabled: z.boolean(),
    recordingUrl: z.string().trim().max(2000).optional(),
  }),
  async (data) => {
    const existing = await getCall(data.callId);
    if (!existing) throw new Error("Call not found.");
    return updateCall(data.callId, {
      recordingEnabled: data.enabled,
      ...(data.recordingUrl != null ? { recordingUrl: data.recordingUrl } : {}),
      metadata: {
        ...existing.metadata,
        recordingRequested: data.enabled,
        recordingNote: data.enabled
          ? "Recording flagged — LiveKit egress URL fills when media capture is wired."
          : "Recording disabled",
      },
    });
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterVoicemails = createSafeAuthenticatedAction(
  z.object({
    status: z.enum(["pending", "listened", "archived"]).optional(),
  }),
  async (data) => listVoicemails({ status: data.status, limit: 100 }),
  { auth: AGENT_AUTH },
);

export const markCallCenterVoicemailListened = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => markVoicemailListened(data.id, context.userId),
  { auth: AGENT_AUTH },
);

export const dialNextCampaignContact = createSafeAuthenticatedAction(
  z.object({ campaignId: z.string().uuid() }),
  async (data, context) => {
    const contacts = await listCampaignContacts(data.campaignId);
    const next = contacts.find((c) => c.status === "pending");
    if (!next) throw new Error("No pending contacts left in this campaign.");
    await upsertCampaignContact({
      id: next.id,
      campaignId: data.campaignId,
      e164: next.e164,
      displayName: next.displayName,
      status: "dialing",
      notes: next.notes,
    });
    const placed = await placeOutboundCall({
      agentUserId: context.userId,
      toE164: next.e164,
      campaignId: data.campaignId,
    });
    await upsertCampaignContact({
      id: next.id,
      campaignId: data.campaignId,
      e164: next.e164,
      displayName: next.displayName,
      status: "completed",
      notes: next.notes,
    });
    return { contact: next, call: placed.call, media: placed.media };
  },
  { auth: AGENT_AUTH },
);

export const createCallCenterTestVoicemail = createSafeAuthenticatedAction(
  z.object({
    fromE164: z.string().trim().min(4).max(20).optional(),
    promptText: z.string().max(500).optional(),
  }),
  async (data) =>
    createVoicemail({
      fromE164: data.fromE164 || "+97455550000",
      toE164: "after-hours",
      promptText: data.promptText || "Test voicemail — please call back.",
    }),
  { auth: ADMIN_AUTH },
);

export const loadCallCenterContacts = createSafeAuthenticatedAction(
  z.object({}),
  async () => ({ contacts: await listPhoneContacts(300) }),
  { auth: AGENT_AUTH },
);

export const saveCallCenterContact = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    displayName: z.string().trim().min(1).max(160),
    e164: z.string().trim().min(4).max(20),
    company: z.string().max(160).optional(),
    email: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.string().max(40)).max(20).optional(),
    isFavorite: z.boolean().optional(),
  }),
  async (data, context) =>
    upsertPhoneContact({
      id: data.id,
      displayName: data.displayName,
      e164: data.e164,
      company: data.company,
      email: data.email,
      notes: data.notes,
      tags: data.tags,
      isFavorite: data.isFavorite,
      createdBy: context.userId,
    }),
  { auth: AGENT_AUTH },
);

export const removeCallCenterContact = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deletePhoneContact(data.id);
    return { ok: true as const };
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterTagCatalog = createSafeAuthenticatedAction(
  z.object({}),
  async () => ({ tags: await listTagCatalog() }),
  { auth: AGENT_AUTH },
);

export const saveCallCenterTagCatalogItem = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(40),
    color: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }),
  async (data) =>
    upsertTagCatalogItem({
      id: data.id,
      name: data.name,
      color: data.color,
      isActive: data.isActive,
      sortOrder: data.sortOrder,
    }),
  { auth: ADMIN_AUTH },
);

export const saveCallCenterCallTags = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  }),
  async (data) => updateCall(data.callId, { tags: data.tags.map((t) => t.toLowerCase()) }),
  { auth: AGENT_AUTH },
);

export const loadCallCenterBlacklist = createSafeAuthenticatedAction(
  z.object({}),
  async () => ({ entries: await listBlacklist() }),
  { auth: AGENT_AUTH },
);

export const saveCallCenterBlacklistEntry = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    e164: z.string().trim().min(4).max(20),
    reason: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
  }),
  async (data, context) =>
    upsertBlacklistEntry({
      id: data.id,
      e164: data.e164,
      reason: data.reason,
      isActive: data.isActive,
      createdBy: context.userId,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterBlacklistEntry = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteBlacklistEntry(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const parkCallCenterCall = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    slot: z.string().trim().max(8).optional(),
  }),
  async (data, context) => parkCall(data.callId, context.userId, data.slot),
  { auth: AGENT_AUTH },
);

export const retrieveCallCenterParkedCall = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data, context) => retrieveParkedCall(data.callId, context.userId),
  { auth: AGENT_AUTH },
);

export const loadCallCenterParkedCalls = createSafeAuthenticatedAction(
  z.object({}),
  async () => ({ calls: await listParkedCalls() }),
  { auth: AGENT_AUTH },
);

export const saveCallCenterAgentExtension = createSafeAuthenticatedAction(
  z.object({ extension: z.string().trim().max(6) }),
  async (data, context) => setAgentExtension(context.userId, data.extension),
  { auth: AGENT_AUTH },
);

export const loadCallCenterAgentPerformance = createSafeAuthenticatedAction(
  z.object({
    fromDate: z.string().datetime().optional().nullable(),
  }),
  async (data) => {
    const from =
      data.fromDate ||
      (() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      })();
    const [rows, queues] = await Promise.all([getAgentPerformance(from), listQueues()]);
    return { rows, queues };
  },
  { auth: AGENT_AUTH },
);

export const saveCallCenterAgentProfile = createSafeAuthenticatedAction(
  z.object({
    userId: z.string().uuid(),
    extension: z.string().trim().max(6),
    displayNameOverride: z.string().trim().max(120),
    maxConcurrentCalls: z.number().int().min(1).max(10),
    canWhisper: z.boolean(),
    canBarge: z.boolean(),
    isActive: z.boolean(),
    skills: z.array(z.string().trim().min(1).max(40)).max(20),
    queueIds: z.array(z.string().uuid()).max(40),
    status: z.enum(["available", "busy", "away", "acw", "offline"]).optional(),
  }),
  async (data) =>
    updateCallCenterAgentProfile({
      userId: data.userId,
      extension: data.extension,
      displayNameOverride: data.displayNameOverride,
      maxConcurrentCalls: data.maxConcurrentCalls,
      canWhisper: data.canWhisper,
      canBarge: data.canBarge,
      isActive: data.isActive,
      skills: data.skills,
      queueIds: data.queueIds,
      status: data.status as CallCenterAgentStatusValue | undefined,
    }),
  { auth: ADMIN_AUTH },
);

export const testCallCenterAiPrompt = createSafeAuthenticatedAction(
  z.object({
    prompt: z.string().trim().min(1).max(4000),
    language: z.enum(["en", "ar"]).optional(),
  }),
  async (data) => {
    const settings = await loadSettingsRow();
    const lang = data.language ?? "en";
    const system =
      (lang === "ar" ? settings?.ai_system_prompt_ar : settings?.ai_system_prompt_en)?.trim() ||
      settings?.ai_notes?.trim() ||
      "You are a helpful call-center AI assistant for FEC.";
    const welcome =
      (lang === "ar" ? settings?.ai_welcome_ar : settings?.ai_welcome_en)?.trim() || "";
    const result = await generateText({
      moduleSource: "call_center_ai_test",
      model: settings?.ai_model || undefined,
      messages: [
        { role: "system", content: system },
        ...(welcome ? [{ role: "assistant" as const, content: welcome }] : []),
        { role: "user", content: data.prompt },
      ],
      temperature: 0.4,
    });
    return {
      text: result.text,
      model: result.model,
      provider: result.provider,
    };
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterWhatsappInbox = createSafeAuthenticatedAction(
  z.object({
    conversationId: z.string().uuid().optional().nullable(),
  }),
  async (data) => {
    const [settings, conversations, agents] = await Promise.all([
      loadSettingsRow(),
      listWhatsappConversations(),
      listAgentStatuses(),
    ]);
    const provider = await getCallProvider();
    const selectedId = data.conversationId || conversations[0]?.id || null;
    const messages = selectedId ? await listWhatsappMessages(selectedId) : [];
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      conversations,
      messages,
      selectedConversationId: selectedId,
      agents,
    };
  },
  { auth: AGENT_AUTH },
);

export const assignCallCenterWhatsappConversation = createSafeAuthenticatedAction(
  z.object({
    conversationId: z.string().uuid(),
    agentUserId: optionalUuid,
  }),
  async (data) => assignWhatsappConversation(data.conversationId, data.agentUserId),
  { auth: AGENT_AUTH },
);

export const replyCallCenterWhatsappMessage = createSafeAuthenticatedAction(
  z.object({
    conversationId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }),
  async (data, context) => {
    const [settings, conversation] = await Promise.all([
      loadSettingsRow(),
      getWhatsappConversation(data.conversationId),
    ]);
    if (!conversation) throw new Error("Conversation not found.");

    const token = resolveWhatsappAccessToken(settings);
    const phoneNumberId = resolveWhatsappPhoneNumberId(settings);
    const to = conversation.customerE164.replace(/\D/g, "") || conversation.waId;

    if (!token || !phoneNumberId) {
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: data.body,
        waMessageId: "",
        status: "failed",
        errorText:
          "WhatsApp is not configured. Set Phone number ID + access token in settings (or WHATSAPP_* env).",
        sentBy: context.userId,
      });
      return {
        message: saved,
        sent: false,
        error: saved.errorText,
      };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: data.body },
          }),
        },
      );
      const payload = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        const errText = payload.error?.message || `Meta API error (${res.status})`;
        const saved = await insertWhatsappOutboundMessage({
          conversationId: data.conversationId,
          body: data.body,
          waMessageId: "",
          status: "failed",
          errorText: errText,
          sentBy: context.userId,
        });
        return { message: saved, sent: false, error: errText };
      }
      const waMessageId = payload.messages?.[0]?.id ?? "";
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: data.body,
        waMessageId,
        status: "sent",
        sentBy: context.userId,
      });
      if (!conversation.assignedAgentId) {
        await assignWhatsappConversation(data.conversationId, context.userId);
      }
      return { message: saved, sent: true as const };
    } catch (error) {
      const errText = error instanceof Error ? error.message : "Send failed";
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: data.body,
        waMessageId: "",
        status: "failed",
        errorText: errText,
        sentBy: context.userId,
      });
      return { message: saved, sent: false, error: errText };
    }
  },
  { auth: AGENT_AUTH },
);

export const exportCallCenterCdrCsv = createSafeAuthenticatedAction(
  z.object({
    fromDate: z.string().datetime().optional().nullable(),
    toDate: z.string().datetime().optional().nullable(),
    queueId: optionalUuid.optional(),
    direction: z.enum(["inbound", "outbound", "internal_test"]).optional().nullable(),
  }),
  async (data) => {
    const calls = await listCallsFiltered({
      fromDate: data.fromDate ?? null,
      toDate: data.toDate ?? null,
      queueId: data.queueId ?? null,
      direction: data.direction ?? null,
      limit: 1000,
    });
    const header = [
      "id",
      "started_at",
      "direction",
      "status",
      "from",
      "to",
      "agent_user_id",
      "queue_id",
      "talk_seconds",
      "disposition",
      "tags",
      "recording_url",
    ];
    const lines = [
      header.join(","),
      ...calls.map((c) =>
        [
          c.id,
          c.startedAt,
          c.direction,
          c.status,
          c.fromE164,
          c.toE164,
          c.agentUserId ?? "",
          c.queueId ?? "",
          c.talkSeconds ?? "",
          c.dispositionCode,
          c.tags.join("|"),
          c.recordingUrl,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    return { csv: lines.join("\n"), count: calls.length };
  },
  { auth: AGENT_AUTH },
);
