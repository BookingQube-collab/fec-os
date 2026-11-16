"use server";

import { z } from "zod";

import { generateCallCenterAiReply } from "@/lib/call-center/ai-reply";
import { getCallProvider } from "@/lib/chat/call-provider";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createSafeAuthenticatedAction } from "@/lib/server/create-action";
import { validateBase64Size } from "@/lib/server/upload-validation";

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
  assignOmniTicket,
  getOmniTicket,
  insertOmniMessage,
  listOmniMessages,
  listOmniTickets,
  listWhatsappConversations,
  listWhatsappMessages,
  resolveInstagramPageAccessToken,
  resolveInstagramPageId,
  resolveMessengerSettingsAccessToken,
  resolveMessengerSettingsPageId,
  saveM365SubscriptionMeta,
  listQaTemplates,
  upsertQaTemplate,
  deleteQaTemplate,
  listQaEvaluations,
  upsertQaEvaluation,
  listReportSchedules,
  upsertReportSchedule,
  deleteReportSchedule,
  markReportScheduleSent,
  listWhatsappTemplates,
  upsertWhatsappTemplate,
  deleteWhatsappTemplate,
  listKeywordAlerts,
  upsertKeywordAlert,
  deleteKeywordAlert,
  searchCallsByKeyword,
  loadSettingsRow,
  resolveWhatsappAccessToken,
  resolveWhatsappPhoneNumberId,
  sendWhatsappCloudText,
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
import { sendOutboundEmail } from "@/lib/email/send";
import { buildFecVenuesTemplate } from "./ivr-flow";
import { normalizeConfiguredTtsVoice } from "./ivr-tts-voice";
import { checkCarrierSetup } from "./livekit-sip";
import {
  CALL_CENTER_AUDIO_KINDS,
  CALL_CENTER_MEDIA_BUCKET,
  CALL_CENTER_MEDIA_MAX_BYTES,
  callCenterMediaStoragePath,
  normalizeCallCenterAudioMime,
} from "./media-audio";
import { toPublicSettings } from "./settings-public";
import {
  looksLikeSipHostNotId,
  recoverMisplacedOutboundSipHost,
  sipHostMistakenForIdMessage,
} from "./sip-ids";
import { resolveTelnyxApiKey } from "./telnyx";
import { synthesizeTelnyxTtsPreview } from "./tts-preview";
import type { CallCenterQaCriterion, CallCenterReportSchedule } from "./types";
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

/** Telnyx / LiveKit SIP readiness check (trunk + dispatch rule lookups). */
export const checkCallCenterCarrier = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    let settings = await loadSettingsRow();
    let sipHostRecovered = false;
    if (settings) {
      const fixed = recoverMisplacedOutboundSipHost({
        outboundTrunkId: settings.livekit_sip_trunk_id ?? "",
        sipUri: settings.telnyx_sip_uri ?? "",
      });
      if (fixed.recovered) {
        sipHostRecovered = true;
        settings = await saveSettingsRow(
          {
            ...settings,
            livekit_sip_trunk_id: fixed.outboundTrunkId,
            telnyx_sip_uri: normalizeSipUriHost(fixed.sipUri),
          },
          context.userId,
        );
      }
    }
    const provider = await getCallProvider();
    return {
      checks: await checkCarrierSetup(settings),
      sipHostRecovered,
      settings: toPublicSettings(settings, provider.name === "livekit"),
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
    livekitSipInboundTrunkId: z.string().trim().max(200).optional(),
    livekitSipDispatchRuleId: z.string().trim().max(200),
    inboundMode: z.enum(["telnyx_sip_trunk", "telnyx_call_control"]).optional(),
    telnyxDtmfMode: z.enum(["rfc2833", "inband", "sip_info"]).optional(),
    qatarDidE164: z.string().trim().max(20).optional(),
    webhookSharedSecret: z.string().max(500),
    notes: z.string().max(2000),
    aiFirstAnswerEnabled: z.boolean().optional(),
    aiHandoffEnabled: z.boolean().optional(),
    aiNotes: z.string().max(2000).optional(),
    aiSystemPromptEn: z.string().max(8000).optional(),
    aiSystemPromptAr: z.string().max(8000).optional(),
    aiWelcomeEn: z.string().max(2000).optional(),
    aiWelcomeAr: z.string().max(2000).optional(),
    aiProvider: z.enum(["admin_gateway", "openai", "openai_compatible", "livekit_agents"]).optional(),
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
    whatsappAutoReplyEnabled: z.boolean().optional(),
    whatsappAutoReplyText: z.string().max(4096).optional(),
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
    recordAllCalls: z.boolean().optional(),
    recordingStorageBaseUrl: z.string().trim().max(2000).optional(),
    instagramEnabled: z.boolean().optional(),
    instagramPageId: z.string().trim().max(80).optional(),
    instagramIgUserId: z.string().trim().max(80).optional(),
    instagramPageAccessToken: z.string().max(500).optional(),
    instagramVerifyToken: z.string().max(200).optional(),
    messengerEnabled: z.boolean().optional(),
    messengerPageId: z.string().trim().max(80).optional(),
    messengerPageAccessToken: z.string().max(500).optional(),
    messengerVerifyToken: z.string().max(200).optional(),
    m365Enabled: z.boolean().optional(),
    m365Mailbox: z.string().trim().max(320).optional(),
    m365TenantId: z.string().trim().max(80).optional(),
    m365ClientId: z.string().trim().max(80).optional(),
    m365ClientSecret: z.string().max(500).optional(),
    m365WebhookClientState: z.string().max(200).optional(),
  }),
  async (data, context) => {
    const existing = await loadSettingsRow();
    // Pasted LiveKit SIP host into outbound trunk id → move into SIP URI; never accept host as ST_…
    const recoveredOutbound = recoverMisplacedOutboundSipHost({
      outboundTrunkId: data.livekitSipTrunkId,
      sipUri: data.telnyxSipUri,
    });
    if (looksLikeSipHostNotId(recoveredOutbound.outboundTrunkId)) {
      throw new Error(sipHostMistakenForIdMessage("outbound_trunk"));
    }
    const inboundTrunkIncoming = data.livekitSipInboundTrunkId?.trim() ?? "";
    if (inboundTrunkIncoming && looksLikeSipHostNotId(inboundTrunkIncoming)) {
      throw new Error(sipHostMistakenForIdMessage("inbound_trunk"));
    }
    if (looksLikeSipHostNotId(data.livekitSipDispatchRuleId)) {
      throw new Error(sipHostMistakenForIdMessage("dispatch_rule"));
    }
    const saved = await saveSettingsRow(
      {
        enabled: data.enabled,
        ivr_enabled: data.ivrEnabled,
        business_hours_enabled: data.businessHoursEnabled,
        business_hours_json: data.businessHoursJson ?? existing?.business_hours_json ?? {},
        timezone: data.timezone || "Asia/Qatar",
        default_queue_id: data.defaultQueueId ?? existing?.default_queue_id ?? null,
        telnyx_sip_uri: normalizeSipUriHost(recoveredOutbound.sipUri),
        telnyx_connection_id: data.telnyxConnectionId,
        telnyx_api_key: keepSecret(existing?.telnyx_api_key ?? "", data.telnyxApiKey),
        telnyx_webhook_secret: keepSecret(
          existing?.telnyx_webhook_secret ?? "",
          data.telnyxWebhookSecret,
        ),
        livekit_sip_trunk_id: recoveredOutbound.outboundTrunkId.trim(),
        livekit_sip_inbound_trunk_id:
          data.livekitSipInboundTrunkId?.trim() ?? existing?.livekit_sip_inbound_trunk_id ?? "",
        livekit_sip_dispatch_rule_id: data.livekitSipDispatchRuleId.trim(),
        inbound_mode: data.inboundMode ?? existing?.inbound_mode ?? "telnyx_sip_trunk",
        telnyx_dtmf_mode: data.telnyxDtmfMode ?? existing?.telnyx_dtmf_mode ?? "rfc2833",
        qatar_did_e164: data.qatarDidE164 ?? existing?.qatar_did_e164 ?? "",
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
        ai_provider: (data.aiProvider ?? existing?.ai_provider ?? "admin_gateway") as CallCenterAiProvider,
        ai_model: data.aiModel ?? existing?.ai_model ?? "gemini-flash-latest",
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
        whatsapp_auto_reply_enabled:
          data.whatsappAutoReplyEnabled ?? existing?.whatsapp_auto_reply_enabled ?? false,
        whatsapp_auto_reply_text:
          data.whatsappAutoReplyText ?? existing?.whatsapp_auto_reply_text ?? "",
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
        tts_voice: normalizeConfiguredTtsVoice(data.ttsVoice ?? existing?.tts_voice ?? ""),
        tts_greeting_text:
          data.ttsGreetingText ??
          existing?.tts_greeting_text ??
          "Welcome. Press a digit from the menu or stay on the line.",
        record_all_calls: data.recordAllCalls ?? existing?.record_all_calls ?? true,
        recording_storage_base_url:
          data.recordingStorageBaseUrl ?? existing?.recording_storage_base_url ?? "",
        instagram_enabled: data.instagramEnabled ?? existing?.instagram_enabled ?? false,
        instagram_page_id: data.instagramPageId ?? existing?.instagram_page_id ?? "",
        instagram_ig_user_id: data.instagramIgUserId ?? existing?.instagram_ig_user_id ?? "",
        instagram_page_access_token: keepSecret(
          existing?.instagram_page_access_token ?? "",
          data.instagramPageAccessToken ?? "",
        ),
        instagram_verify_token: keepSecret(
          existing?.instagram_verify_token ?? "",
          data.instagramVerifyToken ?? "",
        ),
        messenger_enabled: data.messengerEnabled ?? existing?.messenger_enabled ?? false,
        messenger_page_id: data.messengerPageId ?? existing?.messenger_page_id ?? "",
        messenger_page_access_token: keepSecret(
          existing?.messenger_page_access_token ?? "",
          data.messengerPageAccessToken ?? "",
        ),
        messenger_verify_token: keepSecret(
          existing?.messenger_verify_token ?? "",
          data.messengerVerifyToken ?? "",
        ),
        m365_enabled: data.m365Enabled ?? existing?.m365_enabled ?? false,
        m365_mailbox: data.m365Mailbox ?? existing?.m365_mailbox ?? "",
        m365_tenant_id: data.m365TenantId ?? existing?.m365_tenant_id ?? "",
        m365_client_id: data.m365ClientId ?? existing?.m365_client_id ?? "",
        m365_client_secret: keepSecret(
          existing?.m365_client_secret ?? "",
          data.m365ClientSecret ?? "",
        ),
        m365_webhook_client_state: keepSecret(
          existing?.m365_webhook_client_state ?? "",
          data.m365WebhookClientState ?? "",
        ),
        m365_subscription_id: existing?.m365_subscription_id ?? "",
        m365_subscription_expires_at: existing?.m365_subscription_expires_at ?? null,
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
      "instagram_page_access_token",
      "instagram_verify_token",
      "messenger_page_access_token",
      "messenger_verify_token",
      "m365_client_secret",
      "m365_webhook_client_state",
    ]),
  }),
  async (data) => {
    const row = await loadSettingsRow();
    const value = row?.[data.field]?.trim() ?? "";
    return { field: data.field, value };
  },
  { auth: ADMIN_AUTH },
);

/** Upload welcome/hold audio to public Supabase storage; returns HTTPS URL for Telnyx. */
export const uploadCallCenterMediaAudio = createSafeAuthenticatedAction(
  z.object({
    kind: z.enum(CALL_CENTER_AUDIO_KINDS),
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(120),
    dataBase64: z.string().min(32).max(12 * 1024 * 1024),
  }),
  async (data) => {
    const mime = normalizeCallCenterAudioMime(data.contentType, data.filename);
    validateBase64Size(data.dataBase64, CALL_CENTER_MEDIA_MAX_BYTES);
    const cleaned = data.dataBase64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
    const bytes = Buffer.from(cleaned, "base64");
    if (bytes.length < 64) throw new Error("Audio file is empty or too small.");
    if (bytes.length > CALL_CENTER_MEDIA_MAX_BYTES) {
      throw new Error("Audio must be 8 MB or smaller.");
    }
    const path = callCenterMediaStoragePath(data.kind, data.filename, mime);
    const { error: upErr } = await supabaseAdmin.storage
      .from(CALL_CENTER_MEDIA_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upErr) {
      const msg = upErr.message || "Storage upload failed";
      if (/bucket|not found|does not exist/i.test(msg)) {
        throw new Error(
          "Call Center media storage is not ready. Apply migration 20261115200000_call_center_media_storage.sql (supabase db push).",
        );
      }
      throw new Error(msg);
    }
    const { data: publicData } = supabaseAdmin.storage.from(CALL_CENTER_MEDIA_BUCKET).getPublicUrl(path);
    const url = publicData.publicUrl?.trim() ?? "";
    if (!url.startsWith("https://")) {
      throw new Error("Uploaded audio did not produce a public HTTPS URL.");
    }
    return { url, path, kind: data.kind };
  },
  { auth: ADMIN_AUTH },
);

/** Preview IVR TTS voice via Telnyx REST TTS (returns base64 audio for in-browser playback). */
export const previewCallCenterTtsVoice = createSafeAuthenticatedAction(
  z.object({
    voice: z.string().trim().min(1).max(120),
    text: z.string().max(2000).optional(),
  }),
  async (data) => {
    const settings = await loadSettingsRow();
    const apiKey = resolveTelnyxApiKey(settings);
    if (!apiKey) {
      throw new Error(
        "Telnyx API key is not set. Add it in Call Center → Settings (or TELNYX_API_KEY) to preview voices.",
      );
    }
    const voice = normalizeConfiguredTtsVoice(data.voice);
    const sample =
      data.text?.trim() ||
      settings?.tts_greeting_text?.trim() ||
      "Welcome. Thank you for calling. This is a sample of the selected voice.";
    return synthesizeTelnyxTtsPreview({ apiKey, voice, text: sample });
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
    requiredSkills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    serviceLevelSeconds: z.number().int().min(1).max(600).optional(),
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
      requiredSkills: data.requiredSkills ?? [],
      serviceLevelSeconds: data.serviceLevelSeconds ?? 20,
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
  {
    id: CALL_CENTER_VENUE_QUEUE_IDS.general,
    name: "E3 General Support",
    sortOrder: 14,
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
      general: resolved[CALL_CENTER_VENUE_QUEUE_IDS.general]!,
    });

    const greeting =
      flow.nodes.find((n) => n.type === "start")?.data.greetingEn ||
      flow.nodes.find((n) => n.type === "start")?.data.greetingText ||
      "Thank you for calling E3, Events and Entertainment Enterprises.";

    return saveIvrFlow({
      menuId: data.menuId,
      name: "E3 Main menu",
      greetingText: greeting,
      fallbackQueueId: resolved[CALL_CENTER_VENUE_QUEUE_IDS.general] ?? resolved[CALL_CENTER_VENUE_QUEUE_IDS.inflatapark] ?? null,
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
    const { enforceQueueWaitTimeouts } = await import("./routing");
    await enforceQueueWaitTimeouts().catch(() => undefined);
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
        displayName: "Agent",
        maxConcurrentCalls: 1,
        canWhisper: false,
        canBarge: false,
        isActive: true,
        skills: [],
        autoAnswer: false,
        awayReason: "",
      },
      ringing,
      recentCalls: recent,
      settings: toPublicSettings(settings, provider.name === "livekit"),
      dids: dids.filter((d) => d.isActive),
      myQueues,
      myMemberships,
      wrapUpSeconds,
      speedDials,
      // Presence list for the dialer — include the current agent when available.
      // Transfer targets still exclude self in softphone-provider.
      availableAgents: agents.filter((a) => a.status === "available"),
      agents,
    };
  },
  { auth: AGENT_AUTH },
);

export const setCallCenterAgentStatus = createSafeAuthenticatedAction(
  z.object({
    status: z.enum(["available", "busy", "away", "acw", "offline"]),
    awayReason: z.string().trim().max(80).optional(),
    autoAnswer: z.boolean().optional(),
    /** Supervisor remote control — only honored for admin roles. */
    targetUserId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const targetId = data.targetUserId ?? context.userId;
    if (targetId !== context.userId) {
      const { requireCapability, requireRoleLevel } = await import("@/lib/server/authorize");
      await requireCapability(context, "admin.view");
      await requireRoleLevel(context, 95);
    }
    return setAgentStatus(targetId, data.status, {
      awayReason: data.status === "away" ? data.awayReason ?? "" : "",
      autoAnswer: data.autoAnswer,
    });
  },
  { auth: AGENT_AUTH },
);

export const pollCallCenterIncoming = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const { enforceQueueWaitTimeouts } = await import("./routing");
    await enforceQueueWaitTimeouts().catch(() => undefined);
    return listRingingCallsForAgent(context.userId);
  },
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
    // Softphone publishes DTMF to the LiveKit room (RFC 2833 toward SIP). Server logs only.
    const meta = (call.metadata as Record<string, unknown> | null) ?? {};
    const digits = Array.isArray(meta.agentDtmfLog) ? (meta.agentDtmfLog as string[]) : [];
    const updated = await updateCall(data.callId, {
      metadata: {
        ...meta,
        agentDtmfLog: [...digits, data.digit].slice(-32),
        agentDtmfAt: new Date().toISOString(),
      },
    });
    return {
      call: updated,
      offeredUserIds: [],
      phase: "queue" as const,
      message: `DTMF ${data.digit} sent (LiveKit publishDtmf + CDR log).`,
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
    const { generateCallTranscriptContent } = await import("./transcribe-call");
    const generated = await generateCallTranscriptContent(call);
    const saved = await saveCallTranscript({
      callId: data.callId,
      text: generated.text,
      status: generated.status,
    });
    return {
      ...saved,
      transcriptSource: generated.source,
      transcriptMessage: generated.message,
    };
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
    maxAttempts: z.number().int().min(1).max(20).optional(),
    dialIntervalSeconds: z.number().int().min(0).max(3600).optional(),
    amdEnabled: z.boolean().optional(),
    playRecordingUrl: z.string().trim().max(2000).optional(),
    autoStart: z.boolean().optional(),
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
      maxAttempts: data.maxAttempts,
      dialIntervalSeconds: data.dialIntervalSeconds,
      amdEnabled: data.amdEnabled,
      playRecordingUrl: data.playRecordingUrl,
      autoStart: data.autoStart,
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
    const { getSendPulseBridgePublicStatus } = await import("./sendpulse");
    const { getMessengerPublicStatus, getM365PublicStatus } = await import("./omni");
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      sendpulseBridge: getSendPulseBridgePublicStatus(settings?.webhook_shared_secret),
      messenger: getMessengerPublicStatus({
        enabled: settings?.messenger_enabled,
        pageId: settings?.messenger_page_id,
        accessToken: settings?.messenger_page_access_token,
        verifyToken: settings?.messenger_verify_token,
      }),
      m365: getM365PublicStatus({
        enabled: settings?.m365_enabled,
        mailbox: settings?.m365_mailbox,
        tenantId: settings?.m365_tenant_id,
        clientId: settings?.m365_client_id,
        clientSecret: settings?.m365_client_secret,
        clientState: settings?.m365_webhook_client_state,
      }),
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
    if (data.enabled) {
      if (data.recordingUrl != null) {
        return updateCall(data.callId, {
          recordingEnabled: true,
          recordingUrl: data.recordingUrl,
          metadata: {
            ...existing.metadata,
            recordingRequested: true,
            recordingNote: "Recording enabled with provided URL.",
          },
        });
      }
      const { startCallRecordingEgress } = await import("./recording-egress");
      const result = await startCallRecordingEgress(existing);
      return result.call;
    }
    return updateCall(data.callId, {
      recordingEnabled: false,
      metadata: {
        ...existing.metadata,
        recordingRequested: false,
        recordingNote: "Recording disabled",
        egressStarted: false,
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
    const [campaigns, contacts] = await Promise.all([
      listCampaigns(),
      listCampaignContacts(data.campaignId),
    ]);
    const campaign = campaigns.find((c) => c.id === data.campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const maxAttempts = campaign.maxAttempts || 3;
    const next = contacts.find(
      (c) => c.status === "pending" || (c.status === "no_answer" && c.attemptCount < maxAttempts),
    );
    if (!next) throw new Error("No pending contacts left in this campaign.");
    if (next.attemptCount >= maxAttempts) {
      await upsertCampaignContact({
        id: next.id,
        campaignId: data.campaignId,
        e164: next.e164,
        displayName: next.displayName,
        status: "skipped",
        notes: next.notes,
        attemptCount: next.attemptCount,
      });
      throw new Error("Contact reached max dial attempts.");
    }
    const attemptCount = next.attemptCount + 1;
    const now = new Date().toISOString();
    await upsertCampaignContact({
      id: next.id,
      campaignId: data.campaignId,
      e164: next.e164,
      displayName: next.displayName,
      status: "dialing",
      notes: next.notes,
      attemptCount,
      lastAttemptAt: now,
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
      attemptCount,
      lastAttemptAt: now,
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
    isPriority: z.boolean().optional(),
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
      isPriority: data.isPriority,
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
    autoAnswer: z.boolean().optional(),
    awayReason: z.string().trim().max(80).optional(),
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
      autoAnswer: data.autoAnswer,
      awayReason: data.awayReason,
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
    const result = await generateCallCenterAiReply({
      settings,
      utterance: data.prompt,
      language: data.language ?? "en",
      moduleSource: "call_center_ai_test",
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
    const { getSendPulseBridgePublicStatus } = await import("./sendpulse");
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      sendpulseBridge: getSendPulseBridgePublicStatus(settings?.webhook_shared_secret),
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

export const loadCallCenterOmniTickets = createSafeAuthenticatedAction(
  z.object({
    source: z
      .enum([
        "sendpulse",
        "facebook_messenger",
        "instagram",
        "microsoft365_email",
        "whatsapp",
      ])
      .optional(),
    status: z.enum(["open", "pending", "closed"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  async (data) => {
    const tickets = await listOmniTickets({
      source: data.source,
      status: data.status,
      limit: data.limit,
    });
    return { tickets };
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterOmniInbox = createSafeAuthenticatedAction(
  z.object({
    source: z.enum(["facebook_messenger", "instagram", "microsoft365_email"]),
    ticketId: z.string().uuid().optional().nullable(),
  }),
  async (data) => {
    const [settings, tickets, agents] = await Promise.all([
      loadSettingsRow(),
      listOmniTickets({ source: data.source, limit: 80 }),
      listAgentStatuses(),
    ]);
    const provider = await getCallProvider();
    const selectedId = data.ticketId || tickets[0]?.id || null;
    const messages = selectedId ? await listOmniMessages(selectedId) : [];
    const { getSendPulseBridgePublicStatus } = await import("./sendpulse");
    const { getMessengerPublicStatus, getM365PublicStatus } = await import("./omni");
    return {
      settings: toPublicSettings(settings, provider.name === "livekit"),
      sendpulseBridge: getSendPulseBridgePublicStatus(settings?.webhook_shared_secret),
      messenger: getMessengerPublicStatus({
        enabled: settings?.messenger_enabled,
        pageId: settings?.messenger_page_id,
        accessToken: settings?.messenger_page_access_token,
        verifyToken: settings?.messenger_verify_token,
      }),
      m365: getM365PublicStatus({
        enabled: settings?.m365_enabled,
        mailbox: settings?.m365_mailbox,
        tenantId: settings?.m365_tenant_id,
        clientId: settings?.m365_client_id,
        clientSecret: settings?.m365_client_secret,
        clientState: settings?.m365_webhook_client_state,
      }),
      tickets,
      messages,
      selectedTicketId: selectedId,
      agents,
    };
  },
  { auth: AGENT_AUTH },
);

export const assignCallCenterOmniTicket = createSafeAuthenticatedAction(
  z.object({
    ticketId: z.string().uuid(),
    agentUserId: optionalUuid,
  }),
  async (data) => assignOmniTicket(data.ticketId, data.agentUserId),
  { auth: AGENT_AUTH },
);

export const replyCallCenterOmniMessage = createSafeAuthenticatedAction(
  z.object({
    ticketId: z.string().uuid(),
    body: z.string().trim().min(1).max(8000),
  }),
  async (data, context) => {
    const [settings, ticket] = await Promise.all([
      loadSettingsRow(),
      getOmniTicket(data.ticketId),
    ]);
    if (!ticket) throw new Error("Ticket not found.");

    const body = data.body.trim();
    let sent = false;
    let externalMessageId = "";
    let errorText = "";

    if (ticket.source === "facebook_messenger") {
      const { sendMessengerText } = await import("@/lib/meta/messenger");
      const accessToken = resolveMessengerSettingsAccessToken(settings);
      const pageId = resolveMessengerSettingsPageId(settings) || "me";
      const recipientId = ticket.customerExternalId || ticket.externalThreadId;
      if (!accessToken || !recipientId) {
        errorText =
          "Messenger is not configured. Set Page ID + access token in Settings → Messenger.";
      } else {
        const result = await sendMessengerText({
          recipientId,
          body,
          pageId,
          accessToken,
        });
        if (result.ok) {
          sent = true;
          externalMessageId = result.messageId;
        } else {
          errorText = result.error;
        }
      }
    } else if (ticket.source === "instagram") {
      const { sendInstagramText } = await import("@/lib/meta/instagram");
      const accessToken = resolveInstagramPageAccessToken(settings);
      const pageId = resolveInstagramPageId(settings) || "me";
      const recipientId = ticket.customerExternalId || ticket.externalThreadId;
      if (!accessToken || !recipientId) {
        errorText =
          "Instagram is not configured. Set Page ID + access token in Settings → Instagram.";
      } else {
        const result = await sendInstagramText({
          recipientId,
          body,
          pageId,
          accessToken,
        });
        if (result.ok) {
          sent = true;
          externalMessageId = result.messageId;
        } else {
          errorText = result.error;
        }
      }
    } else if (ticket.source === "microsoft365_email") {
      const { resolveM365GraphConfig, sendM365Reply } = await import("./m365-graph");
      const config = resolveM365GraphConfig({
        tenantId: settings?.m365_tenant_id,
        clientId: settings?.m365_client_id,
        clientSecret: settings?.m365_client_secret,
        mailbox: settings?.m365_mailbox,
        clientState: settings?.m365_webhook_client_state,
      });
      const messageId = ticket.externalMessageId || ticket.externalThreadId;
      if (!config || !messageId) {
        errorText =
          "Microsoft 365 is not configured. Set mailbox + Azure AD app credentials in Settings → Microsoft 365.";
      } else {
        const result = await sendM365Reply({ config, messageId, body });
        if (result.ok) {
          sent = true;
          externalMessageId = result.id;
        } else {
          errorText = result.error;
        }
      }
    } else {
      errorText = `Replies are not supported for source ${ticket.source}.`;
    }

    const saved = await insertOmniMessage({
      ticketId: ticket.id,
      direction: "outbound",
      body,
      subject: ticket.summary,
      externalMessageId: externalMessageId || `out:${Date.now()}`,
      status: sent ? "sent" : "failed",
      errorText,
      sentBy: context.userId,
    });

    if (sent && !ticket.assignedAgentId) {
      await assignOmniTicket(ticket.id, context.userId);
    }

    return {
      message: saved.message,
      sent,
      error: sent ? null : errorText || "Send failed",
    };
  },
  { auth: AGENT_AUTH },
);

export const syncCallCenterM365Inbox = createSafeAuthenticatedAction(
  z.object({ limit: z.number().int().min(1).max(50).optional() }),
  async (data) => {
    const settings = await loadSettingsRow();
    const { resolveM365GraphConfig, listRecentM365Messages } = await import("./m365-graph");
    const { ingestOmniInboundHandoff } = await import("./omni-bridge");
    const config = resolveM365GraphConfig({
      tenantId: settings?.m365_tenant_id,
      clientId: settings?.m365_client_id,
      clientSecret: settings?.m365_client_secret,
      mailbox: settings?.m365_mailbox,
      clientState: settings?.m365_webhook_client_state,
    });
    if (!config) {
      return { synced: 0, error: "Microsoft 365 credentials are not configured." };
    }
    const messages = await listRecentM365Messages(config, data.limit ?? 25);
    let synced = 0;
    for (const mail of messages) {
      await ingestOmniInboundHandoff({
        source: "microsoft365_email",
        channel: "email",
        eventTitle: "inbox_sync",
        externalThreadId: mail.conversationId || mail.id,
        externalMessageId: mail.id,
        customerEmail: mail.fromEmail,
        customerName: mail.fromName || mail.fromEmail.split("@")[0] || mail.fromEmail,
        summary: mail.subject || "Microsoft 365 inbound",
        subject: mail.subject,
        lastMessage: mail.bodyText || mail.bodyPreview,
        metadata: { sync: true, receivedAt: mail.receivedAt },
      });
      synced += 1;
    }
    return { synced, error: null as string | null };
  },
  { auth: AGENT_AUTH },
);

export const ensureCallCenterM365Subscription = createSafeAuthenticatedAction(
  z.object({
    notificationUrl: z.string().url().max(2000).optional(),
  }),
  async (data, context) => {
    const settings = await loadSettingsRow();
    const { resolveM365GraphConfig, ensureM365MailSubscription } = await import("./m365-graph");
    const config = resolveM365GraphConfig({
      tenantId: settings?.m365_tenant_id,
      clientId: settings?.m365_client_id,
      clientSecret: settings?.m365_client_secret,
      mailbox: settings?.m365_mailbox,
      clientState: settings?.m365_webhook_client_state,
    });
    if (!config) throw new Error("Microsoft 365 credentials are not configured.");
    const origin =
      data.notificationUrl?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.APP_URL?.trim() ||
      "";
    if (!origin) {
      throw new Error("Set notificationUrl or NEXT_PUBLIC_APP_URL / APP_URL for Graph subscriptions.");
    }
    const notificationUrl = data.notificationUrl?.trim()
      ? data.notificationUrl.trim()
      : `${origin.replace(/\/$/, "")}/api/public/call-center/microsoft365`;
    const sub = await ensureM365MailSubscription({
      config,
      notificationUrl,
      existingSubscriptionId: settings?.m365_subscription_id,
    });
    await saveM365SubscriptionMeta({
      subscriptionId: sub.id,
      expiresAt: sub.expirationDateTime,
      updatedBy: context.userId,
    });
    return { subscriptionId: sub.id, expiresAt: sub.expirationDateTime, notificationUrl };
  },
  { auth: ADMIN_AUTH },
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
          "FEC agent WhatsApp (Meta) is not configured. Set Phone number ID + access token in Settings → FEC WhatsApp (or WHATSAPP_* env). SendPulse chatbot uses a separate number/bridge.",
        sentBy: context.userId,
      });
      return {
        message: saved,
        sent: false,
        error: saved.errorText,
      };
    }

    const sent = await sendWhatsappCloudText({
      phoneNumberId,
      accessToken: token,
      toDigits: to,
      body: data.body,
    });
    if (!sent.ok) {
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: data.body,
        waMessageId: "",
        status: "failed",
        errorText: sent.error,
        sentBy: context.userId,
      });
      return { message: saved, sent: false, error: sent.error };
    }
    const saved = await insertWhatsappOutboundMessage({
      conversationId: data.conversationId,
      body: data.body,
      waMessageId: sent.waMessageId,
      status: "sent",
      sentBy: context.userId,
    });
    if (!conversation.assignedAgentId) {
      await assignWhatsappConversation(data.conversationId, context.userId);
    }
    return { message: saved, sent: true as const };
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

function parseQaCriteriaLabels(criteriaLabels: string): CallCenterQaCriterion[] {
  const labels = criteriaLabels
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return labels.map((label) => ({
    id: crypto.randomUUID(),
    label,
    maxScore: 5,
    aiScored: false,
  }));
}

function computeReportNextRun(
  frequency: CallCenterReportSchedule["frequency"],
  from = new Date(),
): string | null {
  if (frequency === "once") return null;
  const next = new Date(from);
  if (frequency === "hourly") next.setHours(next.getHours() + 1);
  else if (frequency === "daily") next.setDate(next.getDate() + 1);
  else if (frequency === "weekly") next.setDate(next.getDate() + 7);
  else if (frequency === "monthly") next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

function buildReportEmailHtml(
  scheduleName: string,
  summary: Awaited<ReturnType<typeof getAnalyticsSummary>>,
  agents?: Awaited<ReturnType<typeof getAgentPerformance>>,
  includeWhatsapp?: boolean,
): string {
  const rows = [
    ["Calls today", String(summary.callsToday)],
    ["Answer rate", `${summary.answerRate}%`],
    ["Avg handle (s)", String(summary.avgHandleSeconds)],
    ["Service level", `${summary.serviceLevelPercent}%`],
    ["Active calls", String(summary.activeCalls)],
    ["Agents available", String(summary.agentsAvailable)],
  ];
  if (includeWhatsapp) {
    rows.push(["WhatsApp open", String(summary.whatsappOpen)]);
    rows.push(["WhatsApp msgs today", String(summary.whatsappMessagesToday)]);
  }
  const metricRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb">${label}</td><td style="padding:6px 12px;border:1px solid #e5e7eb"><strong>${value}</strong></td></tr>`,
    )
    .join("");
  let agentBlock = "";
  if (agents?.length) {
    const agentRows = agents
      .slice(0, 40)
      .map(
        (a) =>
          `<tr><td style="padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px">${a.userId.slice(0, 8)}…</td><td style="padding:4px 8px;border:1px solid #e5e7eb">${a.callsHandled}</td><td style="padding:4px 8px;border:1px solid #e5e7eb">${a.answered}</td><td style="padding:4px 8px;border:1px solid #e5e7eb">${a.missed}</td></tr>`,
      )
      .join("");
    agentBlock = `<h3 style="margin-top:24px">Agents (today)</h3><table style="border-collapse:collapse;width:100%;max-width:560px"><thead><tr><th align="left">Agent</th><th>Handled</th><th>Answered</th><th>Missed</th></tr></thead><tbody>${agentRows}</tbody></table>`;
  }
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#111827"><h2>FEC Call Center — ${scheduleName}</h2><p>Generated ${new Date().toLocaleString()}</p><table style="border-collapse:collapse;max-width:420px">${metricRows}</table>${agentBlock}</body></html>`;
}

export const loadCallCenterQualityBundle = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [templates, evaluations] = await Promise.all([listQaTemplates(), listQaEvaluations(80)]);
    return { templates, evaluations };
  },
  { auth: AGENT_AUTH },
);

export const saveCallCenterQaTemplate = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    criteriaLabels: z.string().max(4000),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertQaTemplate({
      id: data.id,
      name: data.name,
      criteria: parseQaCriteriaLabels(data.criteriaLabels),
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterQaTemplate = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteQaTemplate(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterQaEvaluation = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    callId: z.string().uuid(),
    templateId: optionalUuid,
    scores: z.record(z.string(), z.number().min(0).max(100)),
    notes: z.string().max(4000).optional(),
  }),
  async (data, context) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    const totalScore = Object.values(data.scores).reduce((sum, n) => sum + n, 0);
    return upsertQaEvaluation({
      id: data.id,
      callId: data.callId,
      templateId: data.templateId ?? null,
      agentUserId: call.agentUserId,
      evaluatorUserId: context.userId,
      scores: data.scores,
      totalScore,
      notes: data.notes ?? "",
    });
  },
  { auth: AGENT_AUTH },
);

export const loadCallCenterReportSchedules = createSafeAuthenticatedAction(
  z.object({}),
  async () => {
    const [schedules, keywordAlerts] = await Promise.all([
      listReportSchedules(),
      listKeywordAlerts(),
    ]);
    return { schedules, keywordAlerts };
  },
  { auth: ADMIN_AUTH },
);

export const saveCallCenterReportSchedule = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    frequency: z.enum(["hourly", "daily", "weekly", "monthly", "once"]),
    emails: z.string().max(2000),
    includeWhatsapp: z.boolean(),
    includeAgents: z.boolean(),
    isActive: z.boolean(),
  }),
  async (data) => {
    const emails = data.emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    if (!emails.length) throw new Error("At least one email is required.");
    return upsertReportSchedule({
      id: data.id,
      name: data.name,
      frequency: data.frequency,
      emails,
      includeWhatsapp: data.includeWhatsapp,
      includeAgents: data.includeAgents,
      isActive: data.isActive,
      nextRunAt: computeReportNextRun(data.frequency),
    });
  },
  { auth: ADMIN_AUTH },
);

export const removeCallCenterReportSchedule = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteReportSchedule(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const runCallCenterReportNow = createSafeAuthenticatedAction(
  z.object({ scheduleId: z.string().uuid() }),
  async (data) => {
    const schedules = await listReportSchedules();
    const schedule = schedules.find((s) => s.id === data.scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    const summary = await getAnalyticsSummary();
    const agents = schedule.includeAgents
      ? await getAgentPerformance(new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
      : undefined;
    const html = buildReportEmailHtml(
      schedule.name,
      summary,
      agents,
      schedule.includeWhatsapp,
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const results: { email: string; sent: boolean; reason?: string }[] = [];
    for (const email of schedule.emails) {
      const result = await sendOutboundEmail({
        to: email,
        subject: `FEC Call Center report — ${schedule.name}`,
        html,
        text,
        template: "call_center_report",
        channel: "call_center",
      });
      results.push({ email, sent: result.sent, reason: result.reason });
    }
    const nextRunAt = computeReportNextRun(schedule.frequency);
    await markReportScheduleSent(schedule.id, nextRunAt);
    return { results, nextRunAt };
  },
  { auth: ADMIN_AUTH },
);

export const loadCallCenterWhatsappTemplates = createSafeAuthenticatedAction(
  z.object({}),
  async () => listWhatsappTemplates(),
  { auth: AGENT_AUTH },
);

export const saveCallCenterWhatsappTemplate = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    language: z.string().trim().max(12),
    body: z.string().max(4000),
    category: z.string().trim().max(40).optional(),
    isActive: z.boolean(),
  }),
  async (data) =>
    upsertWhatsappTemplate({
      id: data.id,
      name: data.name,
      language: data.language || "en",
      body: data.body,
      category: data.category ?? "utility",
      isActive: data.isActive,
    }),
  { auth: ADMIN_AUTH },
);

export const removeCallCenterWhatsappTemplate = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteWhatsappTemplate(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const sendCallCenterWhatsappTemplate = createSafeAuthenticatedAction(
  z.object({
    conversationId: z.string().uuid(),
    templateId: z.string().uuid(),
  }),
  async (data, context) => {
    const [settings, conversation, templates] = await Promise.all([
      loadSettingsRow(),
      getWhatsappConversation(data.conversationId),
      listWhatsappTemplates(),
    ]);
    if (!conversation) throw new Error("Conversation not found.");
    const template = templates.find((t) => t.id === data.templateId);
    if (!template) throw new Error("Template not found.");

    const token = resolveWhatsappAccessToken(settings);
    const phoneNumberId = resolveWhatsappPhoneNumberId(settings);
    const to = conversation.customerE164.replace(/\D/g, "") || conversation.waId;
    const bodyPreview = template.body;

    if (!token || !phoneNumberId) {
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: bodyPreview,
        waMessageId: "",
        status: "failed",
        errorText: "WhatsApp is not configured.",
        sentBy: context.userId,
      });
      return { message: saved, sent: false, error: saved.errorText };
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
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language || "en" },
            },
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
          body: bodyPreview,
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
        body: bodyPreview,
        waMessageId,
        status: "sent",
        sentBy: context.userId,
      });
      return { message: saved, sent: true as const };
    } catch (error) {
      const errText = error instanceof Error ? error.message : "Send failed";
      const saved = await insertWhatsappOutboundMessage({
        conversationId: data.conversationId,
        body: bodyPreview,
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

export const loadCallCenterKeywordAlerts = createSafeAuthenticatedAction(
  z.object({}),
  async () => listKeywordAlerts(),
  { auth: ADMIN_AUTH },
);

export const saveCallCenterKeywordAlert = createSafeAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    keyword: z.string().trim().min(1).max(120),
    notifyEmails: z.string().max(2000),
    isActive: z.boolean(),
  }),
  async (data) => {
    const notifyEmails = data.notifyEmails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    return upsertKeywordAlert({
      id: data.id,
      keyword: data.keyword,
      notifyEmails,
      isActive: data.isActive,
    });
  },
  { auth: ADMIN_AUTH },
);

export const removeCallCenterKeywordAlert = createSafeAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data) => {
    await deleteKeywordAlert(data.id);
    return { ok: true as const };
  },
  { auth: ADMIN_AUTH },
);

export const searchCallCenterKeywords = createSafeAuthenticatedAction(
  z.object({
    keyword: z.string().trim().min(1).max(120),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  async (data) => ({
    calls: await searchCallsByKeyword(data.keyword, data.limit ?? 40),
  }),
  { auth: AGENT_AUTH },
);

export const startCallCenterConference = createSafeAuthenticatedAction(
  z.object({
    callId: z.string().uuid(),
    targetUserId: z.string().uuid(),
  }),
  async (data, context) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    if (call.agentUserId !== context.userId) {
      throw new Error("Only the assigned agent can start a conference.");
    }
    if (!["answered", "held"].includes(call.status)) {
      throw new Error("Call is not active.");
    }
  const room = call.livekitRoom || `cc-${call.id}`;
    const agents = await listAgentStatuses();
    const target = agents.find((a) => a.userId === data.targetUserId);
    const displayName = target?.displayNameOverride?.trim() || "Agent";
    const invite = await issueAgentMediaToken({
      roomName: room,
      userId: data.targetUserId,
      displayName,
    });
    const updated = await updateCall(call.id, {
      conferenceActive: true,
      metadata: {
        ...call.metadata,
        conferenceWith: data.targetUserId,
        conferenceStartedBy: context.userId,
      },
    });
    return { call: updated, invite };
  },
  { auth: AGENT_AUTH },
);

export const startCallCenterRecordingEgress = createSafeAuthenticatedAction(
  z.object({ callId: z.string().uuid() }),
  async (data) => {
    const call = await getCall(data.callId);
    if (!call) throw new Error("Call not found.");
    const { startCallRecordingEgress } = await import("./recording-egress");
    const result = await startCallRecordingEgress(call);
    return result.call;
  },
  { auth: AGENT_AUTH },
);
