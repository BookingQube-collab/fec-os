import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/ai/crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  flattenFlowToOptions,
  parseIvrFlowJson,
  type IvrFlowJson,
} from "./ivr-flow";
import {
  CALL_CENTER_SETTINGS_ID,
  type CallCenterAgentStatus,
  type CallCenterAgentStatusValue,
  type CallCenterAnalyticsSummary,
  type CallCenterCall,
  type CallCenterCallStatus,
  type CallCenterCampaign,
  type CallCenterCampaignContact,
  type CallCenterCampaignStatus,
  type CallCenterCdrFilters,
  type CallCenterContactStatus,
  type CallCenterDid,
  type CallCenterHoliday,
  type CallCenterIvrMenu,
  type CallCenterIvrOption,
  type CallCenterProvider,
  type CallCenterQueue,
  type CallCenterQueueMember,
  type CallCenterQueueStrategy,
  type CallCenterSettingsRow,
  type CallCenterIvrAction,
  type CallCenterSpeedDial,
  type CallCenterVoicemail,
  type CallCenterWebhookEndpoint,
  type CallCenterPhoneContact,
  type CallCenterTagCatalogItem,
  type CallCenterBlacklistEntry,
  type CallCenterAgentPerformanceRow,
  type CallCenterAiProvider,
  type CallCenterWhatsappConversation,
  type CallCenterWhatsappMessage,
  type CallCenterQaTemplate,
  type CallCenterQaCriterion,
  type CallCenterQaEvaluation,
  type CallCenterReportSchedule,
  type CallCenterWhatsappTemplate,
  type CallCenterKeywordAlert,
  type CallCenterSendpulseTicket,
  type CallCenterOmniTicket,
  type CallCenterOmniMessage,
} from "./types";
import {
  type CallCenterOmniSource,
  resolveM365ClientId,
  resolveM365ClientSecret,
  resolveM365ClientState,
  resolveM365Mailbox,
  resolveM365TenantId,
  resolveMessengerAccessToken,
  resolveMessengerPageId,
  resolveMessengerVerifyToken,
} from "./omni";

type DbError = { message: string } | null;

type MaybeSingle<T> = Promise<{ data: T | null; error: DbError }>;
/** Resolved list payload after awaiting a thenable filter builder. */
type ListResult<T> = { data: T[] | null; error: DbError };

type FilterBuilder<T> = {
  eq: (column: string, value: unknown) => FilterBuilder<T>;
  in: (column: string, values: unknown[]) => FilterBuilder<T>;
  is: (column: string, value: null) => FilterBuilder<T>;
  neq: (column: string, value: unknown) => FilterBuilder<T>;
  gte: (column: string, value: unknown) => FilterBuilder<T>;
  lte: (column: string, value: unknown) => FilterBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => FilterBuilder<T>;
  limit: (count: number) => FilterBuilder<T>;
  select: (columns?: string) => FilterBuilder<T>;
  maybeSingle: () => MaybeSingle<T>;
} & PromiseLike<ListResult<T>>;

type SelectBuilder<T> = {
  select: (columns?: string) => FilterBuilder<T>;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
    select: (columns?: string) => FilterBuilder<T>;
  };
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => {
    select: (columns?: string) => FilterBuilder<T>;
  };
  update: (values: Record<string, unknown>) => FilterBuilder<T>;
  delete: () => FilterBuilder<T>;
};

function table<T>(name: string): SelectBuilder<T> {
  const db = supabaseAdmin as unknown as { from: (tableName: string) => SelectBuilder<T> };
  return db.from(name);
}

function throwIfError(error: DbError) {
  if (error) throw new Error(error.message);
}

function mapQueue(row: Record<string, unknown>): CallCenterQueue {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    strategy: (row.strategy as CallCenterQueueStrategy) || "simultaneous",
    eventId: row.event_id ? String(row.event_id) : null,
    wrapUpSeconds: Number(row.wrap_up_seconds ?? 30),
    maxWaitSeconds: Number(row.max_wait_seconds ?? 120),
    requiredSkills: Array.isArray(row.required_skills) ? row.required_skills.map(String) : [],
    serviceLevelSeconds: Math.max(1, Number(row.service_level_seconds ?? 20) || 20),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapMember(row: Record<string, unknown>): CallCenterQueueMember {
  return {
    id: String(row.id),
    queueId: String(row.queue_id),
    userId: String(row.user_id),
    priority: Number(row.priority ?? 100),
    isActive: Boolean(row.is_active),
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
  };
}

function mapDid(row: Record<string, unknown>): CallCenterDid {
  return {
    id: String(row.id),
    e164: String(row.e164 ?? ""),
    label: String(row.label ?? ""),
    queueId: row.queue_id ? String(row.queue_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    ivrMenuId: row.ivr_menu_id ? String(row.ivr_menu_id) : null,
    isActive: Boolean(row.is_active),
  };
}

function mapIvrMenu(row: Record<string, unknown>): CallCenterIvrMenu {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    greetingText: String(row.greeting_text ?? ""),
    timeoutSeconds: Number(row.timeout_seconds ?? 10),
    maxRetries: Number(row.max_retries ?? 2),
    fallbackQueueId: row.fallback_queue_id ? String(row.fallback_queue_id) : null,
    isActive: Boolean(row.is_active),
    flowJson: parseIvrFlowJson(row.flow_json),
  };
}

function mapIvrOption(row: Record<string, unknown>): CallCenterIvrOption {
  return {
    id: String(row.id),
    menuId: String(row.menu_id),
    digit: String(row.digit ?? ""),
    label: String(row.label ?? ""),
    action: (row.action as CallCenterIvrAction) || "queue",
    queueId: row.queue_id ? String(row.queue_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    transferSipUri: String(row.transfer_sip_uri ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    nextMenuId: row.next_menu_id ? String(row.next_menu_id) : null,
    agentUserId: row.agent_user_id ? String(row.agent_user_id) : null,
    targetNodeId: String(row.target_node_id ?? ""),
  };
}

function mapAgentStatus(row: Record<string, unknown>): CallCenterAgentStatus {
  const userId = String(row.user_id);
  const displayNameOverride = String(row.display_name_override ?? "");
  return {
    userId,
    status: (row.status as CallCenterAgentStatusValue) || "offline",
    statusSince: String(row.status_since ?? new Date().toISOString()),
    lastCallAt: row.last_call_at ? String(row.last_call_at) : null,
    extension: String(row.extension ?? ""),
    displayNameOverride,
    displayName: displayNameOverride.trim() || userId.slice(0, 8),
    maxConcurrentCalls: Math.max(1, Number(row.max_concurrent_calls ?? 1) || 1),
    canWhisper: Boolean(row.can_whisper ?? false),
    canBarge: Boolean(row.can_barge ?? false),
    isActive: row.is_active !== false,
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    autoAnswer: Boolean(row.auto_answer ?? false),
    awayReason: String(row.away_reason ?? ""),
  };
}

async function withResolvedAgentDisplayNames(
  agents: CallCenterAgentStatus[],
): Promise<CallCenterAgentStatus[]> {
  if (agents.length === 0) return agents;
  const names = await resolveProfileNames(agents.map((a) => a.userId));
  return agents.map((agent) => ({
    ...agent,
    displayName:
      agent.displayNameOverride.trim() ||
      names.get(agent.userId) ||
      agent.userId.slice(0, 8),
  }));
}

async function withResolvedAgentDisplayName(
  agent: CallCenterAgentStatus,
): Promise<CallCenterAgentStatus> {
  const [resolved] = await withResolvedAgentDisplayNames([agent]);
  return resolved ?? agent;
}

function mapWhatsappConversation(row: Record<string, unknown>): CallCenterWhatsappConversation {
  return {
    id: String(row.id),
    waId: String(row.wa_id ?? ""),
    customerE164: String(row.customer_e164 ?? ""),
    customerName: String(row.customer_name ?? ""),
    assignedAgentId: row.assigned_agent_id ? String(row.assigned_agent_id) : null,
    status: (row.status as CallCenterWhatsappConversation["status"]) || "open",
    lastMessageAt: String(row.last_message_at ?? new Date().toISOString()),
    lastMessagePreview: String(row.last_message_preview ?? ""),
    unreadCount: Number(row.unread_count ?? 0),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapWhatsappMessage(row: Record<string, unknown>): CallCenterWhatsappMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    direction: (row.direction as CallCenterWhatsappMessage["direction"]) || "inbound",
    body: String(row.body ?? ""),
    waMessageId: String(row.wa_message_id ?? ""),
    status: (row.status as CallCenterWhatsappMessage["status"]) || "received",
    errorText: String(row.error_text ?? ""),
    sentBy: row.sent_by ? String(row.sent_by) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function resolveProfileNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return names;
  const result = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);
  throwIfError(result.error as DbError);
  for (const row of result.data ?? []) {
    const id = String((row as { id: string }).id);
    const name = String((row as { display_name?: string | null }).display_name ?? "").trim();
    if (name) names.set(id, name);
  }
  return names;
}

export function mapCall(row: Record<string, unknown>): CallCenterCall {
  return {
    id: String(row.id),
    direction: (row.direction as CallCenterCall["direction"]) || "inbound",
    status: (row.status as CallCenterCallStatus) || "ringing",
    fromE164: String(row.from_e164 ?? ""),
    toE164: String(row.to_e164 ?? ""),
    didId: row.did_id ? String(row.did_id) : null,
    queueId: row.queue_id ? String(row.queue_id) : null,
    agentUserId: row.agent_user_id ? String(row.agent_user_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    ivrMenuId: row.ivr_menu_id ? String(row.ivr_menu_id) : null,
    ivrDigit: row.ivr_digit ? String(row.ivr_digit) : null,
    livekitRoom: String(row.livekit_room ?? ""),
    provider: (row.provider as CallCenterProvider) || "none",
    providerCallId: String(row.provider_call_id ?? ""),
    hangupReason: String(row.hangup_reason ?? ""),
    startedAt: String(row.started_at ?? new Date().toISOString()),
    offeredAt: row.offered_at ? String(row.offered_at) : null,
    answeredAt: row.answered_at ? String(row.answered_at) : null,
    endedAt: row.ended_at ? String(row.ended_at) : null,
    recordingUrl: String(row.recording_url ?? ""),
    transferType: (row.transfer_type as CallCenterCall["transferType"]) ?? null,
    transferTarget: String(row.transfer_target ?? ""),
    transferredAt: row.transferred_at ? String(row.transferred_at) : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    talkSeconds: row.talk_seconds != null ? Number(row.talk_seconds) : null,
    transcriptText: String(row.transcript_text ?? ""),
    transcriptStatus:
      (row.transcript_status as CallCenterCall["transcriptStatus"]) || "none",
    transcriptUpdatedAt: row.transcript_updated_at ? String(row.transcript_updated_at) : null,
    whisperActive: Boolean(row.whisper_active ?? false),
    bargeActive: Boolean(row.barge_active ?? false),
    agentNotes: String(row.agent_notes ?? ""),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    dispositionCode: String(row.disposition_code ?? ""),
    dispositionNotes: String(row.disposition_notes ?? ""),
    recordingEnabled: Boolean(row.recording_enabled ?? false),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    parkedSlot: String(row.parked_slot ?? ""),
    parkedAt: row.parked_at ? String(row.parked_at) : null,
    parkedBy: row.parked_by ? String(row.parked_by) : null,
    conferenceActive: Boolean(row.conference_active ?? false),
    keywordHits: Array.isArray(row.keyword_hits) ? row.keyword_hits.map(String) : [],
  };
}

function mapVoicemail(row: Record<string, unknown>): CallCenterVoicemail {
  return {
    id: String(row.id),
    callId: row.call_id ? String(row.call_id) : null,
    fromE164: String(row.from_e164 ?? ""),
    toE164: String(row.to_e164 ?? ""),
    queueId: row.queue_id ? String(row.queue_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    promptText: String(row.prompt_text ?? ""),
    recordingUrl: String(row.recording_url ?? ""),
    transcriptText: String(row.transcript_text ?? ""),
    status: (row.status as CallCenterVoicemail["status"]) || "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
    listenedAt: row.listened_at ? String(row.listened_at) : null,
    listenedBy: row.listened_by ? String(row.listened_by) : null,
  };
}

function mapSpeedDial(row: Record<string, unknown>): CallCenterSpeedDial {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label ?? ""),
    e164: String(row.e164 ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapHoliday(row: Record<string, unknown>): CallCenterHoliday {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    holidayDate: String(row.holiday_date ?? ""),
    isClosed: Boolean(row.is_closed ?? true),
    notes: String(row.notes ?? ""),
  };
}

function mapCampaign(row: Record<string, unknown>): CallCenterCampaign {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    status: (row.status as CallCenterCampaignStatus) || "draft",
    callerIdE164: String(row.caller_id_e164 ?? ""),
    queueId: row.queue_id ? String(row.queue_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    scriptText: String(row.script_text ?? ""),
    scheduledStart: row.scheduled_start ? String(row.scheduled_start) : null,
    scheduledEnd: row.scheduled_end ? String(row.scheduled_end) : null,
    isActive: Boolean(row.is_active ?? true),
    maxAttempts: Math.max(1, Number(row.max_attempts ?? 3) || 3),
    dialIntervalSeconds: Math.max(0, Number(row.dial_interval_seconds ?? 5) || 5),
    amdEnabled: Boolean(row.amd_enabled ?? false),
    playRecordingUrl: String(row.play_recording_url ?? ""),
    autoStart: Boolean(row.auto_start ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapCampaignContact(row: Record<string, unknown>): CallCenterCampaignContact {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    e164: String(row.e164 ?? ""),
    displayName: String(row.display_name ?? ""),
    status: (row.status as CallCenterContactStatus) || "pending",
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
    attemptCount: Number(row.attempt_count ?? 0),
    notes: String(row.notes ?? ""),
  };
}

function mapWebhookEndpoint(row: Record<string, unknown>): CallCenterWebhookEndpoint {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    url: String(row.url ?? ""),
    events: Array.isArray(row.events) ? row.events.map(String) : ["call.ended"],
    isActive: Boolean(row.is_active ?? true),
    secretHint: String(row.secret_hint ?? ""),
  };
}

const SETTINGS_COLUMNS_PRE_SENDPULSE =
  "enabled, ivr_enabled, business_hours_enabled, business_hours_json, timezone, default_queue_id, telnyx_sip_uri, telnyx_connection_id, telnyx_api_key, telnyx_webhook_secret, livekit_sip_trunk_id, livekit_sip_inbound_trunk_id, livekit_sip_dispatch_rule_id, inbound_mode, telnyx_dtmf_mode, qatar_did_e164, webhook_shared_secret, notes, ai_first_answer_enabled, ai_handoff_enabled, ai_notes, ai_system_prompt_en, ai_system_prompt_ar, ai_welcome_en, ai_welcome_ar, ai_provider, ai_model, ai_api_key, ai_base_url, ai_languages, ai_handoff_after_seconds, ai_handoff_keywords, ai_handoff_queue_id, ai_livekit_agent_name, whatsapp_enabled, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_verify_token, whatsapp_auto_reply_enabled, whatsapp_auto_reply_text, outbound_caller_id_e164, webhook_outbound_url, after_hours_greeting, after_hours_action, welcome_greeting, welcome_audio_url, hold_music_url, tts_enabled, tts_voice, tts_greeting_text, record_all_calls, recording_storage_base_url, instagram_enabled, instagram_page_id, instagram_ig_user_id, instagram_page_access_token, instagram_verify_token, messenger_enabled, messenger_page_id, messenger_page_access_token, messenger_verify_token, m365_enabled, m365_mailbox, m365_tenant_id, m365_client_id, m365_client_secret, m365_webhook_client_state, m365_subscription_id, m365_subscription_expires_at";

const SETTINGS_COLUMNS = `${SETTINGS_COLUMNS_PRE_SENDPULSE}, sendpulse_webhook_secret, sendpulse_whatsapp_number`;

const SETTINGS_COLUMNS_LEGACY_OMNI =
  "enabled, ivr_enabled, business_hours_enabled, business_hours_json, timezone, default_queue_id, telnyx_sip_uri, telnyx_connection_id, telnyx_api_key, telnyx_webhook_secret, livekit_sip_trunk_id, livekit_sip_inbound_trunk_id, livekit_sip_dispatch_rule_id, inbound_mode, telnyx_dtmf_mode, qatar_did_e164, webhook_shared_secret, notes, ai_first_answer_enabled, ai_handoff_enabled, ai_notes, ai_system_prompt_en, ai_system_prompt_ar, ai_welcome_en, ai_welcome_ar, ai_provider, ai_model, ai_api_key, ai_base_url, ai_languages, ai_handoff_after_seconds, ai_handoff_keywords, ai_handoff_queue_id, ai_livekit_agent_name, whatsapp_enabled, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_verify_token, whatsapp_auto_reply_enabled, whatsapp_auto_reply_text, outbound_caller_id_e164, webhook_outbound_url, after_hours_greeting, after_hours_action, welcome_greeting, welcome_audio_url, hold_music_url, tts_enabled, tts_voice, tts_greeting_text, record_all_calls, recording_storage_base_url, instagram_enabled, instagram_page_id, instagram_ig_user_id, instagram_page_access_token, instagram_verify_token, messenger_enabled, messenger_page_id, messenger_page_access_token, messenger_verify_token, m365_enabled, m365_mailbox, m365_tenant_id, m365_client_id, m365_client_secret, m365_webhook_client_state";

function normalizeInboundMode(value: unknown): CallCenterSettingsRow["inbound_mode"] {
  return value === "telnyx_call_control" ? "telnyx_call_control" : "telnyx_sip_trunk";
}

function normalizeDtmfMode(value: unknown): CallCenterSettingsRow["telnyx_dtmf_mode"] {
  if (value === "inband" || value === "sip_info" || value === "rfc2833") return value;
  return "rfc2833";
}

function normalizeAiProvider(value: unknown): CallCenterAiProvider {
  if (
    value === "admin_gateway" ||
    value === "openai_compatible" ||
    value === "livekit_agents" ||
    value === "openai"
  ) {
    return value;
  }
  return "admin_gateway";
}

function mapSettingsRow(row: Record<string, unknown>): CallCenterSettingsRow {
  return {
    enabled: Boolean(row.enabled),
    ivr_enabled: Boolean(row.ivr_enabled),
    business_hours_enabled: Boolean(row.business_hours_enabled),
    business_hours_json:
      row.business_hours_json && typeof row.business_hours_json === "object"
        ? (row.business_hours_json as Record<string, unknown>)
        : {},
    timezone: String(row.timezone ?? "Asia/Qatar"),
    default_queue_id: row.default_queue_id ? String(row.default_queue_id) : null,
    telnyx_sip_uri: String(row.telnyx_sip_uri ?? ""),
    telnyx_connection_id: String(row.telnyx_connection_id ?? ""),
    telnyx_api_key: String(row.telnyx_api_key ?? ""),
    telnyx_webhook_secret: String(row.telnyx_webhook_secret ?? ""),
    livekit_sip_trunk_id: String(row.livekit_sip_trunk_id ?? ""),
    livekit_sip_inbound_trunk_id: String(row.livekit_sip_inbound_trunk_id ?? ""),
    livekit_sip_dispatch_rule_id: String(row.livekit_sip_dispatch_rule_id ?? ""),
    inbound_mode: normalizeInboundMode(row.inbound_mode),
    telnyx_dtmf_mode: normalizeDtmfMode(row.telnyx_dtmf_mode),
    qatar_did_e164: String(row.qatar_did_e164 ?? ""),
    webhook_shared_secret: String(row.webhook_shared_secret ?? ""),
    notes: String(row.notes ?? ""),
    ai_first_answer_enabled: Boolean(row.ai_first_answer_enabled),
    ai_handoff_enabled: row.ai_handoff_enabled !== false,
    ai_notes: String(row.ai_notes ?? ""),
    ai_system_prompt_en: String(row.ai_system_prompt_en ?? ""),
    ai_system_prompt_ar: String(row.ai_system_prompt_ar ?? ""),
    ai_welcome_en: String(
      row.ai_welcome_en ?? "Hello, thank you for calling. How can I help you today?",
    ),
    ai_welcome_ar: String(
      row.ai_welcome_ar ?? "مرحبا، شكراً لاتصالك. كيف نقدر نساعدك؟",
    ),
    ai_provider: normalizeAiProvider(row.ai_provider),
    ai_model: String(row.ai_model ?? "gemini-flash-latest"),
    ai_api_key: String(row.ai_api_key ?? ""),
    ai_base_url: String(row.ai_base_url ?? ""),
    ai_languages: Array.isArray(row.ai_languages)
      ? row.ai_languages.map(String)
      : ["en", "ar"],
    ai_handoff_after_seconds: Number(row.ai_handoff_after_seconds ?? 45),
    ai_handoff_keywords: String(
      row.ai_handoff_keywords ?? "agent,human,representative,مشغل,موظف",
    ),
    ai_handoff_queue_id: row.ai_handoff_queue_id ? String(row.ai_handoff_queue_id) : null,
    ai_livekit_agent_name: String(row.ai_livekit_agent_name ?? ""),
    whatsapp_enabled: Boolean(row.whatsapp_enabled),
    whatsapp_phone_number_id: String(row.whatsapp_phone_number_id ?? ""),
    whatsapp_waba_id: String(row.whatsapp_waba_id ?? ""),
    whatsapp_access_token: String(row.whatsapp_access_token ?? ""),
    whatsapp_verify_token: String(row.whatsapp_verify_token ?? ""),
    whatsapp_auto_reply_enabled: Boolean(row.whatsapp_auto_reply_enabled),
    whatsapp_auto_reply_text: String(row.whatsapp_auto_reply_text ?? ""),
    outbound_caller_id_e164: String(row.outbound_caller_id_e164 ?? ""),
    webhook_outbound_url: String(row.webhook_outbound_url ?? ""),
    after_hours_greeting: String(
      row.after_hours_greeting ??
        "We are currently closed. Please leave a message or call back during business hours.",
    ),
    after_hours_action:
      (row.after_hours_action as CallCenterSettingsRow["after_hours_action"]) || "voicemail",
    welcome_greeting: String(
      row.welcome_greeting ?? "Thank you for calling. Please hold while we connect you.",
    ),
    welcome_audio_url: String(row.welcome_audio_url ?? ""),
    hold_music_url: String(row.hold_music_url ?? ""),
    tts_enabled: Boolean(row.tts_enabled ?? false),
    tts_voice: String(row.tts_voice ?? "Polly.Joanna-Neural"),
    tts_greeting_text: String(
      row.tts_greeting_text ?? "Welcome. Press a digit from the menu or stay on the line.",
    ),
    // Default ON for compliance when column is absent / null.
    record_all_calls: row.record_all_calls !== false,
    recording_storage_base_url: String(row.recording_storage_base_url ?? ""),
    instagram_enabled: Boolean(row.instagram_enabled),
    instagram_page_id: String(row.instagram_page_id ?? ""),
    instagram_ig_user_id: String(row.instagram_ig_user_id ?? ""),
    instagram_page_access_token: String(row.instagram_page_access_token ?? ""),
    instagram_verify_token: String(row.instagram_verify_token ?? ""),
    messenger_enabled: Boolean(row.messenger_enabled),
    messenger_page_id: String(row.messenger_page_id ?? ""),
    messenger_page_access_token: String(row.messenger_page_access_token ?? ""),
    messenger_verify_token: String(row.messenger_verify_token ?? ""),
    m365_enabled: Boolean(row.m365_enabled),
    m365_mailbox: String(row.m365_mailbox ?? ""),
    m365_tenant_id: String(row.m365_tenant_id ?? ""),
    m365_client_id: String(row.m365_client_id ?? ""),
    m365_client_secret: String(row.m365_client_secret ?? ""),
    m365_webhook_client_state: String(row.m365_webhook_client_state ?? ""),
    m365_subscription_id: String(row.m365_subscription_id ?? ""),
    m365_subscription_expires_at: row.m365_subscription_expires_at
      ? String(row.m365_subscription_expires_at)
      : null,
    sendpulse_webhook_secret: String(row.sendpulse_webhook_secret ?? ""),
    sendpulse_whatsapp_number: String(row.sendpulse_whatsapp_number ?? ""),
  };
}

export async function loadSettingsRow(): Promise<CallCenterSettingsRow | null> {
  let result = await table<Record<string, unknown>>("call_center_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", CALL_CENTER_SETTINGS_ID)
    .maybeSingle();

  // Before migration 20261115140000 / 20261116140000 / 20261116150000 / 20261116180000 / 20261116200000, newer columns may be missing — fall back.
  if (
    result.error &&
    /inbound_mode|livekit_sip_inbound|telnyx_dtmf|qatar_did|record_all_calls|whatsapp_auto_reply|recording_storage|instagram_|messenger_|m365_|sendpulse_/i.test(
      result.error.message,
    )
  ) {
    if (/sendpulse_/i.test(result.error.message)) {
      result = await table<Record<string, unknown>>("call_center_settings")
        .select(SETTINGS_COLUMNS_PRE_SENDPULSE)
        .eq("id", CALL_CENTER_SETTINGS_ID)
        .maybeSingle();
    } else if (/messenger_|m365_/i.test(result.error.message)) {
      result = await table<Record<string, unknown>>("call_center_settings")
        .select(SETTINGS_COLUMNS_LEGACY_OMNI)
        .eq("id", CALL_CENTER_SETTINGS_ID)
        .maybeSingle();
    } else {
      const legacy =
        "enabled, ivr_enabled, business_hours_enabled, business_hours_json, timezone, default_queue_id, telnyx_sip_uri, telnyx_connection_id, telnyx_api_key, telnyx_webhook_secret, livekit_sip_trunk_id, livekit_sip_dispatch_rule_id, webhook_shared_secret, notes, ai_first_answer_enabled, ai_handoff_enabled, ai_notes, ai_system_prompt_en, ai_system_prompt_ar, ai_welcome_en, ai_welcome_ar, ai_provider, ai_model, ai_api_key, ai_base_url, ai_languages, ai_handoff_after_seconds, ai_handoff_keywords, ai_handoff_queue_id, ai_livekit_agent_name, whatsapp_enabled, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_access_token, whatsapp_verify_token, outbound_caller_id_e164, webhook_outbound_url, after_hours_greeting, after_hours_action, welcome_greeting, welcome_audio_url, hold_music_url, tts_enabled, tts_voice, tts_greeting_text";
      result = await table<Record<string, unknown>>("call_center_settings")
        .select(legacy)
        .eq("id", CALL_CENTER_SETTINGS_ID)
        .maybeSingle();
    }
  }

  throwIfError(result.error);
  if (!result.data) return null;
  return mapSettingsRow(result.data);
}

export async function saveSettingsRow(
  row: CallCenterSettingsRow,
  updatedBy: string,
): Promise<CallCenterSettingsRow> {
  const result = await table<Record<string, unknown>>("call_center_settings")
    .upsert(
      {
        id: CALL_CENTER_SETTINGS_ID,
        enabled: row.enabled,
        ivr_enabled: row.ivr_enabled,
        business_hours_enabled: row.business_hours_enabled,
        business_hours_json: row.business_hours_json,
        timezone: row.timezone,
        default_queue_id: row.default_queue_id,
        telnyx_sip_uri: row.telnyx_sip_uri,
        telnyx_connection_id: row.telnyx_connection_id,
        telnyx_api_key: row.telnyx_api_key,
        telnyx_webhook_secret: row.telnyx_webhook_secret,
        livekit_sip_trunk_id: row.livekit_sip_trunk_id,
        livekit_sip_inbound_trunk_id: row.livekit_sip_inbound_trunk_id,
        livekit_sip_dispatch_rule_id: row.livekit_sip_dispatch_rule_id,
        inbound_mode: row.inbound_mode,
        telnyx_dtmf_mode: row.telnyx_dtmf_mode,
        qatar_did_e164: row.qatar_did_e164,
        webhook_shared_secret: row.webhook_shared_secret,
        notes: row.notes,
        ai_first_answer_enabled: row.ai_first_answer_enabled,
        ai_handoff_enabled: row.ai_handoff_enabled,
        ai_notes: row.ai_notes,
        ai_system_prompt_en: row.ai_system_prompt_en,
        ai_system_prompt_ar: row.ai_system_prompt_ar,
        ai_welcome_en: row.ai_welcome_en,
        ai_welcome_ar: row.ai_welcome_ar,
        ai_provider: row.ai_provider,
        ai_model: row.ai_model,
        ai_api_key: row.ai_api_key,
        ai_base_url: row.ai_base_url,
        ai_languages: row.ai_languages,
        ai_handoff_after_seconds: row.ai_handoff_after_seconds,
        ai_handoff_keywords: row.ai_handoff_keywords,
        ai_handoff_queue_id: row.ai_handoff_queue_id,
        ai_livekit_agent_name: row.ai_livekit_agent_name,
        whatsapp_enabled: row.whatsapp_enabled,
        whatsapp_phone_number_id: row.whatsapp_phone_number_id,
        whatsapp_waba_id: row.whatsapp_waba_id,
        whatsapp_access_token: row.whatsapp_access_token,
        whatsapp_verify_token: row.whatsapp_verify_token,
        whatsapp_auto_reply_enabled: row.whatsapp_auto_reply_enabled,
        whatsapp_auto_reply_text: row.whatsapp_auto_reply_text,
        outbound_caller_id_e164: row.outbound_caller_id_e164,
        webhook_outbound_url: row.webhook_outbound_url,
        after_hours_greeting: row.after_hours_greeting,
        after_hours_action: row.after_hours_action,
        welcome_greeting: row.welcome_greeting,
        welcome_audio_url: row.welcome_audio_url,
        hold_music_url: row.hold_music_url,
        tts_enabled: row.tts_enabled,
        tts_voice: row.tts_voice,
        tts_greeting_text: row.tts_greeting_text,
        record_all_calls: row.record_all_calls !== false,
        recording_storage_base_url: row.recording_storage_base_url ?? "",
        instagram_enabled: row.instagram_enabled ?? false,
        instagram_page_id: row.instagram_page_id ?? "",
        instagram_ig_user_id: row.instagram_ig_user_id ?? "",
        instagram_page_access_token: row.instagram_page_access_token ?? "",
        instagram_verify_token: row.instagram_verify_token ?? "",
        messenger_enabled: row.messenger_enabled ?? false,
        messenger_page_id: row.messenger_page_id ?? "",
        messenger_page_access_token: row.messenger_page_access_token ?? "",
        messenger_verify_token: row.messenger_verify_token ?? "",
        m365_enabled: row.m365_enabled ?? false,
        m365_mailbox: row.m365_mailbox ?? "",
        m365_tenant_id: row.m365_tenant_id ?? "",
        m365_client_id: row.m365_client_id ?? "",
        m365_client_secret: row.m365_client_secret ?? "",
        m365_webhook_client_state: row.m365_webhook_client_state ?? "",
        m365_subscription_id: row.m365_subscription_id ?? "",
        m365_subscription_expires_at: row.m365_subscription_expires_at ?? null,
        sendpulse_webhook_secret: row.sendpulse_webhook_secret ?? "",
        sendpulse_whatsapp_number: row.sendpulse_whatsapp_number ?? "",
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "id" },
    )
    .select(SETTINGS_COLUMNS)
    .maybeSingle();
  if (
    result.error &&
    /inbound_mode|livekit_sip_inbound|telnyx_dtmf|qatar_did|record_all_calls|whatsapp_auto_reply|recording_storage|instagram_|messenger_|m365_|sendpulse_/i.test(
      result.error.message,
    )
  ) {
    throw new Error(
      "Call Center settings columns are missing. Apply pending call_center migrations (supabase db push), then save again.",
    );
  }
  throwIfError(result.error);
  if (!result.data) throw new Error("Call Center settings could not be saved.");
  return (await loadSettingsRow())!;
}

export async function listQueues(): Promise<CallCenterQueue[]> {
  const result = (await table<Record<string, unknown>>("call_center_queues")
    .select("*")
    .order("sort_order", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapQueue);
}

export async function upsertQueue(input: {
  id?: string;
  name: string;
  strategy: CallCenterQueueStrategy;
  eventId: string | null;
  wrapUpSeconds: number;
  maxWaitSeconds: number;
  requiredSkills?: string[];
  serviceLevelSeconds?: number;
  isActive: boolean;
  sortOrder: number;
}): Promise<CallCenterQueue> {
  const payload: Record<string, unknown> = {
    name: input.name,
    strategy: input.strategy,
    event_id: input.eventId,
    wrap_up_seconds: input.wrapUpSeconds,
    max_wait_seconds: input.maxWaitSeconds,
    required_skills: (input.requiredSkills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean),
    service_level_seconds: Math.max(1, input.serviceLevelSeconds ?? 20),
    is_active: input.isActive,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const existing = await table<Record<string, unknown>>("call_center_queues")
      .select("id")
      .eq("id", input.id)
      .maybeSingle();
    throwIfError(existing.error);
    if (existing.data) {
      const result = await table<Record<string, unknown>>("call_center_queues")
        .update(payload)
        .eq("id", input.id)
        .select("*")
        .maybeSingle();
      throwIfError(result.error);
      if (!result.data) throw new Error("Queue could not be saved.");
      return mapQueue(result.data);
    }
    const inserted = await table<Record<string, unknown>>("call_center_queues")
      .insert({ ...payload, id: input.id })
      .select("*")
      .maybeSingle();
    throwIfError(inserted.error);
    if (!inserted.data) throw new Error("Queue could not be saved.");
    return mapQueue(inserted.data);
  }
  const result = await table<Record<string, unknown>>("call_center_queues")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Queue could not be saved.");
  return mapQueue(result.data);
}

export async function deleteQueue(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_queues").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listQueueMembers(queueId?: string): Promise<CallCenterQueueMember[]> {
  let query = table<Record<string, unknown>>("call_center_queue_members").select("*");
  if (queueId) query = query.eq("queue_id", queueId);
  const result = (await query.order("priority", { ascending: true })) as ListResult<
    Record<string, unknown>
  >;
  throwIfError(result.error);
  return (result.data ?? []).map(mapMember);
}

export async function upsertQueueMember(input: {
  id?: string;
  queueId: string;
  userId: string;
  priority: number;
  isActive: boolean;
  skills?: string[];
}): Promise<CallCenterQueueMember> {
  const payload: Record<string, unknown> = {
    queue_id: input.queueId,
    user_id: input.userId,
    priority: input.priority,
    is_active: input.isActive,
    skills: input.skills ?? [],
  };
  if (input.id) payload.id = input.id;
  const result = await table<Record<string, unknown>>("call_center_queue_members")
    .upsert(payload, { onConflict: "queue_id,user_id" })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Queue member could not be saved.");
  return mapMember(result.data);
}

export async function deleteQueueMember(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_queue_members").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listDids(): Promise<CallCenterDid[]> {
  const result = (await table<Record<string, unknown>>("call_center_dids")
    .select("*")
    .order("e164", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapDid);
}

export async function findDidByE164(e164: string): Promise<CallCenterDid | null> {
  const normalized = normalizeE164(e164);
  const result = await table<Record<string, unknown>>("call_center_dids")
    .select("*")
    .eq("e164", normalized)
    .eq("is_active", true)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapDid(result.data) : null;
}

export async function upsertDid(input: {
  id?: string;
  e164: string;
  label: string;
  queueId: string | null;
  eventId: string | null;
  ivrMenuId: string | null;
  isActive: boolean;
}): Promise<CallCenterDid> {
  const payload: Record<string, unknown> = {
    e164: normalizeE164(input.e164),
    label: input.label,
    queue_id: input.queueId,
    event_id: input.eventId,
    ivr_menu_id: input.ivrMenuId,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_dids")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("DID could not be saved.");
    return mapDid(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_dids")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("DID could not be saved.");
  return mapDid(result.data);
}

export async function deleteDid(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_dids").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listIvrMenus(): Promise<CallCenterIvrMenu[]> {
  const result = (await table<Record<string, unknown>>("call_center_ivr_menus")
    .select("*")
    .order("name", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapIvrMenu);
}

export async function upsertIvrMenu(input: {
  id?: string;
  name: string;
  greetingText: string;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueueId: string | null;
  isActive: boolean;
}): Promise<CallCenterIvrMenu> {
  const payload: Record<string, unknown> = {
    name: input.name,
    greeting_text: input.greetingText,
    timeout_seconds: input.timeoutSeconds,
    max_retries: input.maxRetries,
    fallback_queue_id: input.fallbackQueueId,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_ivr_menus")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("IVR menu could not be saved.");
    return mapIvrMenu(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_ivr_menus")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("IVR menu could not be saved.");
  return mapIvrMenu(result.data);
}

export async function deleteIvrMenu(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_ivr_menus").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listIvrOptions(menuId?: string): Promise<CallCenterIvrOption[]> {
  let query = table<Record<string, unknown>>("call_center_ivr_options").select("*");
  if (menuId) query = query.eq("menu_id", menuId);
  const result = (await query.order("sort_order", { ascending: true })) as ListResult<
    Record<string, unknown>
  >;
  throwIfError(result.error);
  return (result.data ?? []).map(mapIvrOption);
}

export async function upsertIvrOption(input: {
  id?: string;
  menuId: string;
  digit: string;
  label: string;
  action: CallCenterIvrAction;
  queueId: string | null;
  eventId: string | null;
  transferSipUri: string;
  sortOrder: number;
  nextMenuId?: string | null;
  agentUserId?: string | null;
  targetNodeId?: string;
}): Promise<CallCenterIvrOption> {
  const payload: Record<string, unknown> = {
    menu_id: input.menuId,
    digit: input.digit,
    label: input.label,
    action: input.action,
    queue_id: input.queueId,
    event_id: input.eventId,
    transfer_sip_uri: input.transferSipUri,
    sort_order: input.sortOrder,
    next_menu_id: input.nextMenuId ?? null,
    agent_user_id: input.agentUserId ?? null,
    target_node_id: input.targetNodeId ?? "",
  };
  if (input.id) payload.id = input.id;
  const result = await table<Record<string, unknown>>("call_center_ivr_options")
    .upsert(payload, { onConflict: "menu_id,digit" })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("IVR option could not be saved.");
  return mapIvrOption(result.data);
}

export async function deleteIvrOption(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_ivr_options").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function replaceIvrOptionsForMenu(
  menuId: string,
  options: Array<{
    digit: string;
    label: string;
    action: CallCenterIvrAction;
    queueId: string | null;
    eventId: string | null;
    transferSipUri: string;
    nextMenuId: string | null;
    agentUserId: string | null;
    targetNodeId: string;
    sortOrder: number;
  }>,
): Promise<CallCenterIvrOption[]> {
  const del = await table<Record<string, unknown>>("call_center_ivr_options")
    .delete()
    .eq("menu_id", menuId);
  throwIfError(del.error);
  if (options.length === 0) return [];
  const rows = options.map((o) => ({
    menu_id: menuId,
    digit: o.digit,
    label: o.label,
    action: o.action,
    queue_id: o.queueId,
    event_id: o.eventId,
    transfer_sip_uri: o.transferSipUri,
    next_menu_id: o.nextMenuId,
    agent_user_id: o.agentUserId,
    target_node_id: o.targetNodeId,
    sort_order: o.sortOrder,
  }));
  const result = await table<Record<string, unknown>>("call_center_ivr_options")
    .insert(rows)
    .select("*");
  throwIfError(result.error);
  return (result.data ?? []).map(mapIvrOption);
}

/** Persist visual flow + sync flattened digit options for inbound runtime. */
export async function saveIvrFlow(input: {
  menuId: string;
  name?: string;
  greetingText?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
  fallbackQueueId?: string | null;
  isActive?: boolean;
  flow: IvrFlowJson;
}): Promise<{ menu: CallCenterIvrMenu; options: CallCenterIvrOption[] }> {
  const flow = parseIvrFlowJson(input.flow);
  const entryMenu = flow.nodes.find((n) => n.type === "menu");
  const start = flow.nodes.find((n) => n.type === "start");
  const greeting =
    input.greetingText ??
    start?.data.greetingText ??
    entryMenu?.data.greetingText ??
    "";
  const payload: Record<string, unknown> = {
    flow_json: flow,
    greeting_text: greeting,
    updated_at: new Date().toISOString(),
  };
  if (input.name != null) payload.name = input.name;
  if (input.timeoutSeconds != null) payload.timeout_seconds = input.timeoutSeconds;
  else if (entryMenu?.data.timeoutSeconds != null) {
    payload.timeout_seconds = entryMenu.data.timeoutSeconds;
  }
  if (input.maxRetries != null) payload.max_retries = input.maxRetries;
  else if (entryMenu?.data.maxRetries != null) {
    payload.max_retries = entryMenu.data.maxRetries;
  }
  if (input.fallbackQueueId !== undefined) payload.fallback_queue_id = input.fallbackQueueId;
  if (input.isActive != null) payload.is_active = input.isActive;

  const result = await table<Record<string, unknown>>("call_center_ivr_menus")
    .update(payload)
    .eq("id", input.menuId)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("IVR flow could not be saved.");

  const flat = flattenFlowToOptions(flow, input.menuId);
  const options = await replaceIvrOptionsForMenu(
    input.menuId,
    flat.map((o) => ({
      digit: o.digit,
      label: o.label,
      action: o.action,
      queueId: o.queueId,
      eventId: o.eventId,
      transferSipUri: o.transferSipUri,
      nextMenuId: o.nextMenuId,
      agentUserId: o.agentUserId,
      targetNodeId: o.targetNodeId,
      sortOrder: o.sortOrder,
    })),
  );
  return { menu: mapIvrMenu(result.data), options };
}

export async function getAgentStatus(userId: string): Promise<CallCenterAgentStatus | null> {
  const result = await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? withResolvedAgentDisplayName(mapAgentStatus(result.data)) : null;
}

export async function setAgentStatus(
  userId: string,
  status: CallCenterAgentStatusValue,
  extras?: {
    lastCallAt?: string | null;
    extension?: string;
    displayNameOverride?: string;
    maxConcurrentCalls?: number;
    canWhisper?: boolean;
    canBarge?: boolean;
    isActive?: boolean;
    skills?: string[];
    autoAnswer?: boolean;
    awayReason?: string;
  },
): Promise<CallCenterAgentStatus> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: userId,
    status,
    status_since: now,
    updated_at: now,
  };
  if (extras?.lastCallAt !== undefined) payload.last_call_at = extras.lastCallAt;
  if (extras?.extension !== undefined) payload.extension = extras.extension.trim();
  if (extras?.displayNameOverride !== undefined) {
    payload.display_name_override = extras.displayNameOverride.trim();
  }
  if (extras?.autoAnswer !== undefined) payload.auto_answer = extras.autoAnswer;
  if (extras?.awayReason !== undefined) payload.away_reason = extras.awayReason.trim().slice(0, 80);
  if (extras?.maxConcurrentCalls !== undefined) {
    payload.max_concurrent_calls = extras.maxConcurrentCalls;
  }
  if (extras?.canWhisper !== undefined) payload.can_whisper = extras.canWhisper;
  if (extras?.canBarge !== undefined) payload.can_barge = extras.canBarge;
  if (extras?.isActive !== undefined) payload.is_active = extras.isActive;
  if (extras?.skills !== undefined) payload.skills = extras.skills;
  const result = await table<Record<string, unknown>>("call_center_agent_status")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Agent status could not be saved.");
  return withResolvedAgentDisplayName(mapAgentStatus(result.data));
}

export async function updateCallCenterAgentProfile(input: {
  userId: string;
  extension: string;
  displayNameOverride: string;
  maxConcurrentCalls: number;
  canWhisper: boolean;
  canBarge: boolean;
  isActive: boolean;
  skills: string[];
  queueIds: string[];
  status?: CallCenterAgentStatusValue;
  autoAnswer?: boolean;
  awayReason?: string;
}): Promise<CallCenterAgentStatus> {
  const existing = await getAgentStatus(input.userId);
  const saved = await setAgentStatus(input.userId, input.status ?? existing?.status ?? "offline", {
    lastCallAt: existing?.lastCallAt ?? null,
    extension: input.extension,
    displayNameOverride: input.displayNameOverride,
    maxConcurrentCalls: input.maxConcurrentCalls,
    canWhisper: input.canWhisper,
    canBarge: input.canBarge,
    isActive: input.isActive,
    skills: input.skills,
    autoAnswer: input.autoAnswer ?? existing?.autoAnswer ?? false,
    awayReason: input.awayReason ?? existing?.awayReason ?? "",
  });

  const members = await listQueueMembers();
  const mine = members.filter((m) => m.userId === input.userId);
  const desired = new Set(input.queueIds);
  for (const member of mine) {
    if (!desired.has(member.queueId)) {
      await deleteQueueMember(member.id);
    }
  }
  for (const queueId of input.queueIds) {
    const existingMember = mine.find((m) => m.queueId === queueId);
    await upsertQueueMember({
      id: existingMember?.id,
      queueId,
      userId: input.userId,
      priority: existingMember?.priority ?? 100,
      isActive: true,
      skills: input.skills,
    });
  }
  return saved;
}

export async function setAgentExtension(
  userId: string,
  extension: string,
): Promise<CallCenterAgentStatus> {
  const existing = await getAgentStatus(userId);
  return setAgentStatus(userId, existing?.status ?? "offline", {
    lastCallAt: existing?.lastCallAt ?? null,
    extension,
  });
}

export async function listAvailableAgents(userIds: string[]): Promise<CallCenterAgentStatus[]> {
  if (userIds.length === 0) return [];
  const result = (await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")
    .in("user_id", userIds)
    .eq("status", "available")) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return withResolvedAgentDisplayNames((result.data ?? []).map(mapAgentStatus));
}

export async function createCall(input: {
  direction: CallCenterCall["direction"];
  status: CallCenterCallStatus;
  fromE164: string;
  toE164: string;
  didId?: string | null;
  queueId?: string | null;
  agentUserId?: string | null;
  eventId?: string | null;
  ivrMenuId?: string | null;
  ivrDigit?: string | null;
  livekitRoom?: string;
  provider: CallCenterProvider;
  providerCallId?: string;
  offeredAt?: string | null;
  answeredAt?: string | null;
  campaignId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<CallCenterCall> {
  const now = new Date().toISOString();
  const result = await table<Record<string, unknown>>("call_center_calls")
    .insert({
      direction: input.direction,
      status: input.status,
      from_e164: input.fromE164,
      to_e164: input.toE164,
      did_id: input.didId ?? null,
      queue_id: input.queueId ?? null,
      agent_user_id: input.agentUserId ?? null,
      event_id: input.eventId ?? null,
      ivr_menu_id: input.ivrMenuId ?? null,
      ivr_digit: input.ivrDigit ?? null,
      livekit_room: input.livekitRoom ?? "",
      provider: input.provider,
      provider_call_id: input.providerCallId ?? "",
      offered_at: input.offeredAt ?? null,
      answered_at: input.answeredAt ?? null,
      campaign_id: input.campaignId ?? null,
      metadata: input.metadata ?? {},
      started_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Call could not be created.");
  return mapCall(result.data);
}

export async function updateCall(
  id: string,
  patch: Partial<{
    status: CallCenterCallStatus;
    agentUserId: string | null;
    queueId: string | null;
    eventId: string | null;
    ivrDigit: string | null;
    ivrMenuId: string | null;
    livekitRoom: string;
    hangupReason: string;
    offeredAt: string | null;
    answeredAt: string | null;
    endedAt: string | null;
    metadata: Record<string, unknown>;
    recordingUrl: string;
    transferType: "cold" | "warm" | null;
    transferTarget: string;
    transferredAt: string | null;
    campaignId: string | null;
    talkSeconds: number | null;
    transcriptText: string;
    transcriptStatus: CallCenterCall["transcriptStatus"];
    transcriptUpdatedAt: string | null;
    whisperActive: boolean;
    bargeActive: boolean;
    agentNotes: string;
    dispositionCode: string;
    dispositionNotes: string;
    recordingEnabled: boolean;
    tags: string[];
    parkedSlot: string;
    parkedAt: string | null;
    parkedBy: string | null;
    conferenceActive: boolean;
    keywordHits: string[];
  }>,
): Promise<CallCenterCall> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.agentUserId !== undefined) payload.agent_user_id = patch.agentUserId;
  if (patch.queueId !== undefined) payload.queue_id = patch.queueId;
  if (patch.eventId !== undefined) payload.event_id = patch.eventId;
  if (patch.ivrDigit !== undefined) payload.ivr_digit = patch.ivrDigit;
  if (patch.ivrMenuId !== undefined) payload.ivr_menu_id = patch.ivrMenuId;
  if (patch.livekitRoom !== undefined) payload.livekit_room = patch.livekitRoom;
  if (patch.hangupReason !== undefined) payload.hangup_reason = patch.hangupReason;
  if (patch.offeredAt !== undefined) payload.offered_at = patch.offeredAt;
  if (patch.answeredAt !== undefined) payload.answered_at = patch.answeredAt;
  if (patch.endedAt !== undefined) payload.ended_at = patch.endedAt;
  if (patch.metadata !== undefined) payload.metadata = patch.metadata;
  if (patch.recordingUrl !== undefined) payload.recording_url = patch.recordingUrl;
  if (patch.transferType !== undefined) payload.transfer_type = patch.transferType;
  if (patch.transferTarget !== undefined) payload.transfer_target = patch.transferTarget;
  if (patch.transferredAt !== undefined) payload.transferred_at = patch.transferredAt;
  if (patch.campaignId !== undefined) payload.campaign_id = patch.campaignId;
  if (patch.talkSeconds !== undefined) payload.talk_seconds = patch.talkSeconds;
  if (patch.transcriptText !== undefined) payload.transcript_text = patch.transcriptText;
  if (patch.transcriptStatus !== undefined) payload.transcript_status = patch.transcriptStatus;
  if (patch.transcriptUpdatedAt !== undefined) {
    payload.transcript_updated_at = patch.transcriptUpdatedAt;
  }
  if (patch.whisperActive !== undefined) payload.whisper_active = patch.whisperActive;
  if (patch.bargeActive !== undefined) payload.barge_active = patch.bargeActive;
  if (patch.agentNotes !== undefined) payload.agent_notes = patch.agentNotes;
  if (patch.dispositionCode !== undefined) payload.disposition_code = patch.dispositionCode;
  if (patch.dispositionNotes !== undefined) payload.disposition_notes = patch.dispositionNotes;
  if (patch.recordingEnabled !== undefined) payload.recording_enabled = patch.recordingEnabled;
  if (patch.tags !== undefined) payload.tags = patch.tags;
  if (patch.parkedSlot !== undefined) payload.parked_slot = patch.parkedSlot;
  if (patch.parkedAt !== undefined) payload.parked_at = patch.parkedAt;
  if (patch.parkedBy !== undefined) payload.parked_by = patch.parkedBy;
  if (patch.conferenceActive !== undefined) payload.conference_active = patch.conferenceActive;
  if (patch.keywordHits !== undefined) payload.keyword_hits = patch.keywordHits;

  const result = await table<Record<string, unknown>>("call_center_calls")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Call could not be updated.");
  return mapCall(result.data);
}

/**
 * Atomically claim a waiting call for an agent before bridging media.
 * Returns null when another agent already claimed it (simultaneous race).
 */
/** Inbound legs an agent can Accept / Connect — after IVR digit routes to queue (not during menu). */
const CLAIMABLE_CALL_STATUSES = ["ringing", "offered", "queued"] as const;

export async function claimCallForAnswer(
  callId: string,
  agentUserId: string,
  livekitRoom: string,
): Promise<CallCenterCall | null> {
  const now = new Date().toISOString();
  const existing = await getCall(callId);
  if (!existing) return null;
  if (!(CLAIMABLE_CALL_STATUSES as readonly string[]).includes(existing.status)) return null;
  if (existing.agentUserId && existing.agentUserId !== agentUserId) return null;

  const meta = {
    ...((existing.metadata as Record<string, unknown> | null) ?? {}),
    answerClaimedBy: agentUserId,
    answerClaimedAt: now,
  };

  // Prefer unclaimed rows (simultaneous / IVR). Filter agent in a second path for directed offers.
  let result = await table<Record<string, unknown>>("call_center_calls")
    .update({
      agent_user_id: agentUserId,
      livekit_room: livekitRoom,
      metadata: meta,
      updated_at: now,
    })
    .eq("id", callId)
    .in("status", [...CLAIMABLE_CALL_STATUSES])
    .is("agent_user_id", null)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (result.data) return mapCall(result.data);

  result = await table<Record<string, unknown>>("call_center_calls")
    .update({
      agent_user_id: agentUserId,
      livekit_room: livekitRoom,
      metadata: meta,
      updated_at: now,
    })
    .eq("id", callId)
    .eq("agent_user_id", agentUserId)
    .in("status", [...CLAIMABLE_CALL_STATUSES])
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapCall(result.data) : null;
}

/** Waiting inbound legs that may exceed queue max_wait_seconds. */
export async function listWaitingCallsForTimeout(limit = 50): Promise<CallCenterCall[]> {
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .in("status", ["ringing", "queued", "offered", "ivr"])
    .order("started_at", { ascending: true })
    .limit(limit)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCall);
}

export async function getCall(id: string): Promise<CallCenterCall | null> {
  const result = await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapCall(result.data) : null;
}

/** Carrier call id (Telnyx `call_control_id`, LiveKit SIP call id) → CDR. */
export async function findCallByProviderCallId(
  providerCallId: string,
): Promise<CallCenterCall | null> {
  const id = providerCallId.trim();
  if (!id) return null;
  const result = await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("provider_call_id", id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapCall(result.data) : null;
}

/** Most recent CDR attached to a LiveKit room (rooms are one-per-call). */
export async function findCallByLivekitRoom(roomName: string): Promise<CallCenterCall | null> {
  const room = roomName.trim();
  if (!room) return null;
  const result = await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("livekit_room", room)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapCall(result.data) : null;
}

export async function listRecentCalls(limit = 40): Promise<CallCenterCall[]> {
  // Over-fetch slightly so phantom DID bridge rows can be filtered without thinning the list.
  const fetchLimit = Math.min(Math.max(limit * 2, limit + 10), 80);
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(fetchLimit)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  const calls = (result.data ?? []).map(mapCall);
  const settings = await loadSettingsRow().catch(() => null);
  const dids = await listDids().catch(() => []);
  const { collectOwnedE164s, isPhantomDidInbound } = await import("./call-party");
  const owned = collectOwnedE164s({
    outboundCallerIdE164: settings?.outbound_caller_id_e164,
    qatarDidE164: settings?.qatar_did_e164,
    didE164s: dids.map((d) => d.e164),
  });
  return calls.filter((c) => !isPhantomDidInbound(c, owned)).slice(0, limit);
}

export async function listRingingCallsForAgent(userId: string): Promise<CallCenterCall[]> {
  const membership = await listQueueMembers();
  const queueIds = membership.filter((m) => m.userId === userId && m.isActive).map((m) => m.queueId);

  const offered = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("agent_user_id", userId)
    .in("status", ["ringing", "offered"])
    .order("started_at", { ascending: false })
    .limit(10)) as ListResult<Record<string, unknown>>;
  throwIfError(offered.error);

  const simultaneous: CallCenterCall[] = [];
  if (queueIds.length > 0) {
    const queued = (await table<Record<string, unknown>>("call_center_calls")
      .select("*")
      .in("queue_id", queueIds)
      .is("agent_user_id", null)
      .in("status", ["ringing", "offered", "queued"])
      .order("started_at", { ascending: false })
      .limit(10)) as ListResult<Record<string, unknown>>;
    throwIfError(queued.error);
    simultaneous.push(...(queued.data ?? []).map(mapCall));
  }

  const settings = await loadSettingsRow().catch(() => null);
  const dids = await listDids().catch(() => []);
  const { collectOwnedE164s, isPhantomDidInbound } = await import("./call-party");
  const owned = collectOwnedE164s({
    outboundCallerIdE164: settings?.outbound_caller_id_e164,
    qatarDidE164: settings?.qatar_did_e164,
    didE164s: dids.map((d) => d.e164),
  });

  const byId = new Map<string, CallCenterCall>();
  for (const call of [...(offered.data ?? []).map(mapCall), ...simultaneous]) {
    // Agents who declined a shared (simultaneous) PSTN offer should not be re-rung for it.
    const declinedBy = (call.metadata as Record<string, unknown> | null)?.declinedBy;
    if (Array.isArray(declinedBy) && declinedBy.includes(userId)) continue;
    // Bridge leftovers (DID-as-caller / cc-_+DID_random) must not ring or show as QUEUED.
    if (isPhantomDidInbound(call, owned)) continue;
    byId.set(call.id, call);
  }
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}


export async function listAgentStatuses(): Promise<CallCenterAgentStatus[]> {
  const result = (await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")
    .order("updated_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return withResolvedAgentDisplayNames((result.data ?? []).map(mapAgentStatus));
}

export async function listActiveCalls(): Promise<CallCenterCall[]> {
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .in("status", ["ringing", "queued", "ivr", "offered", "answered", "held"])
    .order("started_at", { ascending: false })
    .limit(100)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCall);
}

export async function listCallsFiltered(filters: CallCenterCdrFilters = {}): Promise<CallCenterCall[]> {
  let query = table<Record<string, unknown>>("call_center_calls").select("*");
  if (filters.fromDate) query = query.gte("started_at", filters.fromDate);
  if (filters.toDate) query = query.lte("started_at", filters.toDate);
  if (filters.agentUserId) query = query.eq("agent_user_id", filters.agentUserId);
  if (filters.queueId) query = query.eq("queue_id", filters.queueId);
  if (filters.eventId) query = query.eq("event_id", filters.eventId);
  if (filters.direction) query = query.eq("direction", filters.direction);
  if (filters.status) query = query.eq("status", filters.status);
  const result = (await query
    .order("started_at", { ascending: false })
    .limit(filters.limit ?? 100)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCall);
}

export async function getAnalyticsSummary(): Promise<CallCenterAnalyticsSummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const fromIso = startOfDay.toISOString();
  const [todayCalls, agents, active, queues, vmPending] = await Promise.all([
    listCallsFiltered({ fromDate: fromIso, limit: 500 }),
    listAgentStatuses(),
    listActiveCalls(),
    listQueues(),
    listVoicemails({ status: "pending", limit: 50 }),
  ]);
  const answeredToday = todayCalls.filter(
    (c) => c.answeredAt || c.status === "answered" || c.status === "ended",
  ).length;
  const missedToday = todayCalls.filter((c) =>
    ["missed", "declined", "failed"].includes(c.status),
  ).length;
  const abandonedToday = todayCalls.filter((c) =>
    ["missed", "declined", "voicemail"].includes(c.status),
  ).length;
  const inboundToday = todayCalls.filter((c) => c.direction === "inbound").length;
  const outboundToday = todayCalls.filter((c) => c.direction === "outbound").length;
  const handled = todayCalls.filter((c) => c.answeredAt && c.endedAt);
  let avgHandleSeconds = 0;
  if (handled.length > 0) {
    const total = handled.reduce((sum, call) => {
      if (call.talkSeconds != null) return sum + call.talkSeconds;
      const start = new Date(call.answeredAt!).getTime();
      const end = new Date(call.endedAt!).getTime();
      return sum + Math.max(0, Math.round((end - start) / 1000));
    }, 0);
    avgHandleSeconds = Math.round(total / handled.length);
  }
  const offered = todayCalls.filter((c) => c.offeredAt && c.answeredAt);
  let avgSpeedAnswerSeconds = 0;
  if (offered.length > 0) {
    const total = offered.reduce((sum, call) => {
      const start = new Date(call.offeredAt!).getTime();
      const ans = new Date(call.answeredAt!).getTime();
      return sum + Math.max(0, Math.round((ans - start) / 1000));
    }, 0);
    avgSpeedAnswerSeconds = Math.round(total / offered.length);
  }
  const queueSl = new Map(queues.map((q) => [q.id, q.serviceLevelSeconds]));
  const slCandidates = todayCalls.filter((c) => c.offeredAt && c.answeredAt);
  let serviceLevelPercent = 0;
  if (slCandidates.length > 0) {
    const within = slCandidates.filter((c) => {
      const target = (c.queueId && queueSl.get(c.queueId)) || 20;
      const sec = Math.round(
        (new Date(c.answeredAt!).getTime() - new Date(c.offeredAt!).getTime()) / 1000,
      );
      return sec <= target;
    }).length;
    serviceLevelPercent = Math.round((within / slCandidates.length) * 100);
  }

  let whatsappOpen = 0;
  let whatsappMessagesToday = 0;
  try {
    const waOpen = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
      .select("id")
      .eq("status", "open")
      .limit(200);
    whatsappOpen = (waOpen.data ?? []).length;
    const waMsgs = await table<Record<string, unknown>>("call_center_whatsapp_messages")
      .select("id")
      .gte("created_at", fromIso)
      .limit(500);
    whatsappMessagesToday = (waMsgs.data ?? []).length;
  } catch {
    // tables may be empty / unavailable
  }

  return {
    callsToday: todayCalls.length,
    answeredToday,
    missedToday,
    inboundToday,
    outboundToday,
    answerRate: todayCalls.length === 0 ? 0 : Math.round((answeredToday / todayCalls.length) * 100),
    avgHandleSeconds,
    avgSpeedAnswerSeconds,
    abandonRate:
      todayCalls.length === 0 ? 0 : Math.round((abandonedToday / todayCalls.length) * 100),
    serviceLevelPercent,
    agentsAvailable: agents.filter((a) => a.status === "available").length,
    agentsBusy: agents.filter((a) => a.status === "busy").length,
    agentsAway: agents.filter((a) => a.status === "away" || a.status === "acw").length,
    agentsOffline: agents.filter((a) => a.status === "offline").length,
    agentsInCall: agents.filter((a) => a.status === "busy").length,
    activeCalls: active.length,
    voicemailsPending: vmPending.length,
    whatsappOpen,
    whatsappMessagesToday,
  };
}

export async function createVoicemail(input: {
  callId?: string | null;
  fromE164: string;
  toE164: string;
  queueId?: string | null;
  eventId?: string | null;
  promptText?: string;
  recordingUrl?: string;
}): Promise<CallCenterVoicemail> {
  const result = await table<Record<string, unknown>>("call_center_voicemails")
    .insert({
      call_id: input.callId ?? null,
      from_e164: input.fromE164,
      to_e164: input.toE164,
      queue_id: input.queueId ?? null,
      event_id: input.eventId ?? null,
      prompt_text: input.promptText ?? "",
      recording_url: input.recordingUrl ?? "",
      status: "pending",
    })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Voicemail could not be created.");
  return mapVoicemail(result.data);
}

export async function listVoicemails(filters?: {
  status?: "pending" | "listened" | "archived";
  limit?: number;
}): Promise<CallCenterVoicemail[]> {
  let query = table<Record<string, unknown>>("call_center_voicemails").select("*");
  if (filters?.status) query = query.eq("status", filters.status);
  const result = (await query
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 100)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapVoicemail);
}

export async function markVoicemailListened(
  id: string,
  userId: string,
): Promise<CallCenterVoicemail> {
  const result = await table<Record<string, unknown>>("call_center_voicemails")
    .update({
      status: "listened",
      listened_at: new Date().toISOString(),
      listened_by: userId,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Voicemail not found.");
  return mapVoicemail(result.data);
}

export async function listHolidays(): Promise<CallCenterHoliday[]> {
  const result = (await table<Record<string, unknown>>("call_center_holidays")
    .select("*")
    .order("holiday_date", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapHoliday);
}

export async function upsertHoliday(input: {
  id?: string;
  name: string;
  holidayDate: string;
  isClosed: boolean;
  notes: string;
}): Promise<CallCenterHoliday> {
  const payload: Record<string, unknown> = {
    name: input.name,
    holiday_date: input.holidayDate,
    is_closed: input.isClosed,
    notes: input.notes,
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_holidays")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Holiday could not be saved.");
    return mapHoliday(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_holidays")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Holiday could not be saved.");
  return mapHoliday(result.data);
}

export async function deleteHoliday(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_holidays").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listCampaigns(): Promise<CallCenterCampaign[]> {
  const result = (await table<Record<string, unknown>>("call_center_campaigns")
    .select("*")
    .order("updated_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCampaign);
}

export async function upsertCampaign(input: {
  id?: string;
  name: string;
  status: CallCenterCampaignStatus;
  callerIdE164: string;
  queueId?: string | null;
  eventId?: string | null;
  scriptText: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  isActive: boolean;
  maxAttempts?: number;
  dialIntervalSeconds?: number;
  amdEnabled?: boolean;
  playRecordingUrl?: string;
  autoStart?: boolean;
}): Promise<CallCenterCampaign> {
  const payload: Record<string, unknown> = {
    name: input.name,
    status: input.status,
    caller_id_e164: normalizeE164(input.callerIdE164) || input.callerIdE164,
    queue_id: input.queueId ?? null,
    event_id: input.eventId ?? null,
    script_text: input.scriptText,
    scheduled_start: input.scheduledStart ?? null,
    scheduled_end: input.scheduledEnd ?? null,
    is_active: input.isActive,
    max_attempts: Math.max(1, input.maxAttempts ?? 3),
    dial_interval_seconds: Math.max(0, input.dialIntervalSeconds ?? 5),
    amd_enabled: Boolean(input.amdEnabled),
    play_recording_url: input.playRecordingUrl ?? "",
    auto_start: Boolean(input.autoStart),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_campaigns")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Campaign could not be saved.");
    return mapCampaign(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_campaigns")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Campaign could not be saved.");
  return mapCampaign(result.data);
}

export async function deleteCampaign(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_campaigns").delete().eq("id", id);
  throwIfError((await result).error);
}

export async function listCampaignContacts(campaignId: string): Promise<CallCenterCampaignContact[]> {
  const result = (await table<Record<string, unknown>>("call_center_campaign_contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCampaignContact);
}

export async function upsertCampaignContact(input: {
  id?: string;
  campaignId: string;
  e164: string;
  displayName: string;
  status?: CallCenterContactStatus;
  notes?: string;
  attemptCount?: number;
  lastAttemptAt?: string | null;
}): Promise<CallCenterCampaignContact> {
  const payload: Record<string, unknown> = {
    campaign_id: input.campaignId,
    e164: normalizeE164(input.e164),
    display_name: input.displayName,
    status: input.status ?? "pending",
    notes: input.notes ?? "",
    updated_at: new Date().toISOString(),
  };
  if (input.attemptCount !== undefined) payload.attempt_count = input.attemptCount;
  if (input.lastAttemptAt !== undefined) payload.last_attempt_at = input.lastAttemptAt;
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_campaign_contacts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Contact could not be saved.");
    return mapCampaignContact(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_campaign_contacts")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Contact could not be saved.");
  return mapCampaignContact(result.data);
}

export async function deleteCampaignContact(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_campaign_contacts")
    .delete()
    .eq("id", id);
  throwIfError((await result).error);
}

export async function listWebhookEndpoints(): Promise<CallCenterWebhookEndpoint[]> {
  const result = (await table<Record<string, unknown>>("call_center_webhook_endpoints")
    .select("*")
    .order("created_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapWebhookEndpoint);
}

export async function upsertWebhookEndpoint(input: {
  id?: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secretHint: string;
}): Promise<CallCenterWebhookEndpoint> {
  const payload: Record<string, unknown> = {
    name: input.name,
    url: input.url,
    events: input.events,
    is_active: input.isActive,
    secret_hint: input.secretHint,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_webhook_endpoints")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Webhook could not be saved.");
    return mapWebhookEndpoint(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_webhook_endpoints")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Webhook could not be saved.");
  return mapWebhookEndpoint(result.data);
}

export async function deleteWebhookEndpoint(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_webhook_endpoints")
    .delete()
    .eq("id", id);
  throwIfError((await result).error);
}

export async function listSpeedDials(userId: string): Promise<CallCenterSpeedDial[]> {
  const result = (await table<Record<string, unknown>>("call_center_speed_dials")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .limit(40)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapSpeedDial);
}

export async function upsertSpeedDial(input: {
  id?: string;
  userId: string;
  label: string;
  e164: string;
  sortOrder?: number;
}): Promise<CallCenterSpeedDial> {
  const payload: Record<string, unknown> = {
    user_id: input.userId,
    label: input.label.trim().slice(0, 80),
    e164: normalizeE164(input.e164),
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_speed_dials")
      .update(payload)
      .eq("id", input.id)
      .eq("user_id", input.userId)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Speed dial could not be saved.");
    return mapSpeedDial(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_speed_dials")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Speed dial could not be saved.");
  return mapSpeedDial(result.data);
}

export async function deleteSpeedDial(id: string, userId: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_speed_dials")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwIfError((await result).error);
}

export async function saveCallAgentNotes(callId: string, notes: string): Promise<CallCenterCall> {
  return updateCall(callId, { agentNotes: notes.trim().slice(0, 4000) });
}

/** Store LiveKit/Telnyx SIP host only — strip pasted sip:/sips:/ws(s)://http(s):// prefixes. */
export function normalizeSipUriHost(value: string): string {
  let v = value.trim();
  if (!v) return "";
  v = v.replace(/^(sips?:|wss:\/\/|ws:\/\/|https?:\/\/)/i, "");
  // Drop path / params / fragment if a full URI was pasted
  v = v.split(/[/;?#]/)[0] ?? v;
  return v.trim();
}

export function normalizeE164(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  return `+${digits.replace(/\D/g, "")}`;
}

export function secretLast4(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "";
  return v.slice(-4);
}

export function keepSecret(previous: string, submitted: string): string {
  const incoming = submitted.trim();
  return incoming.length > 0 ? incoming : previous;
}

/** Ciphertext from `@/lib/ai/crypto` encryptSecret (`v1:iv:tag:data`). */
export function isSealedCallCenterSecret(value: string): boolean {
  const parts = value.trim().split(":");
  return parts[0] === "v1" && parts.length >= 4 && Boolean(parts[1] && parts[2] && parts[3]);
}

/**
 * Encrypt a call-center secret at rest using the shared AI credentials key
 * (`encryptSecret` / `AI_CREDENTIALS_ENCRYPTION_KEY`).
 */
export function sealCallCenterSecret(plaintext: string): string {
  const incoming = plaintext.trim();
  if (!incoming) return "";
  return encryptSecret(incoming);
}

/** Decrypt sealed secrets; pass through legacy plaintext for older rows. */
export function unsealCallCenterSecret(stored: string): string {
  const trimmed = stored.trim();
  if (!trimmed) return "";
  if (!isSealedCallCenterSecret(trimmed)) return trimmed;
  return decryptSecret(trimmed);
}

/** Blank submitted value keeps the previous sealed (or plain) secret. */
export function keepSealedSecret(previous: string, submitted: string): string {
  const incoming = submitted.trim();
  if (!incoming) return previous;
  return sealCallCenterSecret(incoming);
}

function mapPhoneContact(row: Record<string, unknown>): CallCenterPhoneContact {
  return {
    id: String(row.id),
    displayName: String(row.display_name ?? ""),
    e164: String(row.e164 ?? ""),
    company: String(row.company ?? ""),
    email: String(row.email ?? ""),
    notes: String(row.notes ?? ""),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    isFavorite: Boolean(row.is_favorite ?? false),
    isPriority: Boolean(row.is_priority ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapTagCatalog(row: Record<string, unknown>): CallCenterTagCatalogItem {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    color: String(row.color ?? "#64748b"),
    isActive: Boolean(row.is_active ?? true),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapBlacklist(row: Record<string, unknown>): CallCenterBlacklistEntry {
  return {
    id: String(row.id),
    e164: String(row.e164 ?? ""),
    reason: String(row.reason ?? ""),
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function listPhoneContacts(limit = 200): Promise<CallCenterPhoneContact[]> {
  const result = (await table<Record<string, unknown>>("call_center_contacts")
    .select("*")
    .order("display_name", { ascending: true })
    .limit(limit)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? [])
    .map(mapPhoneContact)
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.displayName.localeCompare(b.displayName));
}

export async function findPriorityContactByE164(e164: string): Promise<CallCenterPhoneContact | null> {
  const normalized = normalizeE164(e164);
  if (!normalized) return null;
  const result = await table<Record<string, unknown>>("call_center_contacts")
    .select("*")
    .eq("e164", normalized)
    .eq("is_priority", true)
    .limit(1)
    .maybeSingle();
  if (result.error) return null;
  return result.data ? mapPhoneContact(result.data) : null;
}

export async function upsertPhoneContact(input: {
  id?: string;
  displayName: string;
  e164: string;
  company?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  isFavorite?: boolean;
  isPriority?: boolean;
  createdBy?: string | null;
}): Promise<CallCenterPhoneContact> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    display_name: input.displayName.trim(),
    e164: normalizeE164(input.e164),
    company: (input.company ?? "").trim(),
    email: (input.email ?? "").trim(),
    notes: (input.notes ?? "").trim().slice(0, 2000),
    tags: input.tags ?? [],
    is_favorite: Boolean(input.isFavorite),
    is_priority: Boolean(input.isPriority),
    updated_at: now,
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_contacts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Contact could not be updated.");
    return mapPhoneContact(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_contacts")
    .insert({
      ...payload,
      created_by: input.createdBy ?? null,
      created_at: now,
    })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Contact could not be created.");
  return mapPhoneContact(result.data);
}

export async function deletePhoneContact(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_contacts").delete().eq("id", id);
  throwIfError(result.error);
}

export async function listTagCatalog(): Promise<CallCenterTagCatalogItem[]> {
  const result = (await table<Record<string, unknown>>("call_center_tag_catalog")
    .select("*")
    .order("sort_order", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapTagCatalog);
}

export async function upsertTagCatalogItem(input: {
  id?: string;
  name: string;
  color?: string;
  isActive?: boolean;
  sortOrder?: number;
}): Promise<CallCenterTagCatalogItem> {
  const payload = {
    name: input.name.trim().toLowerCase(),
    color: input.color?.trim() || "#64748b",
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? 0,
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_tag_catalog")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Tag could not be updated.");
    return mapTagCatalog(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_tag_catalog")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Tag could not be created.");
  return mapTagCatalog(result.data);
}

export async function listBlacklist(): Promise<CallCenterBlacklistEntry[]> {
  const result = (await table<Record<string, unknown>>("call_center_blacklist")
    .select("*")
    .order("created_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapBlacklist);
}

export async function isNumberBlacklisted(e164: string): Promise<boolean> {
  const normalized = normalizeE164(e164);
  if (!normalized) return false;
  const result = await table<Record<string, unknown>>("call_center_blacklist")
    .select("id")
    .eq("e164", normalized)
    .eq("is_active", true)
    .maybeSingle();
  throwIfError(result.error);
  return Boolean(result.data);
}

export async function upsertBlacklistEntry(input: {
  id?: string;
  e164: string;
  reason?: string;
  isActive?: boolean;
  createdBy?: string | null;
}): Promise<CallCenterBlacklistEntry> {
  const payload: Record<string, unknown> = {
    e164: normalizeE164(input.e164),
    reason: (input.reason ?? "").trim().slice(0, 500),
    is_active: input.isActive ?? true,
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_blacklist")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Blacklist entry could not be updated.");
    return mapBlacklist(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_blacklist")
    .upsert(
      { ...payload, created_by: input.createdBy ?? null },
      { onConflict: "e164" },
    )
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Blacklist entry could not be saved.");
  return mapBlacklist(result.data);
}

export async function deleteBlacklistEntry(id: string): Promise<void> {
  const result = await table<Record<string, unknown>>("call_center_blacklist").delete().eq("id", id);
  throwIfError(result.error);
}

export async function listParkedCalls(): Promise<CallCenterCall[]> {
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("status", "held")
    .neq("parked_slot", "")
    .order("parked_at", { ascending: true })
    .limit(50)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCall);
}

export async function findAgentByExtension(extension: string): Promise<CallCenterAgentStatus | null> {
  const ext = extension.trim();
  if (!ext) return null;
  const result = await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")
    .eq("extension", ext)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? withResolvedAgentDisplayName(mapAgentStatus(result.data)) : null;
}

export async function getAgentPerformance(fromIso: string): Promise<CallCenterAgentPerformanceRow[]> {
  const agents = (await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")) as ListResult<Record<string, unknown>>;
  throwIfError(agents.error);
  const calls = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .gte("started_at", fromIso)
    .limit(2000)) as ListResult<Record<string, unknown>>;
  throwIfError(calls.error);
  const members = await listQueueMembers();
  const queueIdsByUser = new Map<string, string[]>();
  for (const member of members) {
    if (!member.isActive) continue;
    const list = queueIdsByUser.get(member.userId) ?? [];
    list.push(member.queueId);
    queueIdsByUser.set(member.userId, list);
  }

  const byAgent = new Map<string, CallCenterAgentPerformanceRow>();
  for (const row of agents.data ?? []) {
    const mapped = mapAgentStatus(row);
    byAgent.set(mapped.userId, {
      userId: mapped.userId,
      displayName: mapped.displayName,
      extension: mapped.extension,
      status: mapped.status,
      callsHandled: 0,
      answered: 0,
      missed: 0,
      outbound: 0,
      avgHandleSeconds: 0,
      totalTalkSeconds: 0,
      displayNameOverride: mapped.displayNameOverride,
      maxConcurrentCalls: mapped.maxConcurrentCalls,
      canWhisper: mapped.canWhisper,
      canBarge: mapped.canBarge,
      isActive: mapped.isActive,
      skills: mapped.skills,
      queueIds: queueIdsByUser.get(mapped.userId) ?? [],
      autoAnswer: mapped.autoAnswer,
      awayReason: mapped.awayReason,
    });
  }

  for (const row of calls.data ?? []) {
    const call = mapCall(row);
    if (!call.agentUserId) continue;
    let entry = byAgent.get(call.agentUserId);
    if (!entry) {
      entry = {
        userId: call.agentUserId,
        displayName: call.agentUserId.slice(0, 8),
        extension: "",
        status: "offline",
        callsHandled: 0,
        answered: 0,
        missed: 0,
        outbound: 0,
        avgHandleSeconds: 0,
        totalTalkSeconds: 0,
        displayNameOverride: "",
        maxConcurrentCalls: 1,
        canWhisper: false,
        canBarge: false,
        isActive: true,
        skills: [],
        queueIds: queueIdsByUser.get(call.agentUserId) ?? [],
        autoAnswer: false,
        awayReason: "",
      };
      byAgent.set(call.agentUserId, entry);
    }
    entry.callsHandled += 1;
    if (call.status === "answered" || call.answeredAt) entry.answered += 1;
    if (call.status === "missed" || call.status === "declined") entry.missed += 1;
    if (call.direction === "outbound") entry.outbound += 1;
    if (call.talkSeconds != null && call.talkSeconds > 0) {
      entry.totalTalkSeconds += call.talkSeconds;
    }
  }

  const names = await resolveProfileNames([...byAgent.keys()]);
  return [...byAgent.values()]
    .map((row) => ({
      ...row,
      displayName:
        row.displayNameOverride.trim() ||
        names.get(row.userId) ||
        row.userId.slice(0, 8),
      avgHandleSeconds:
        row.answered > 0 ? Math.round(row.totalTalkSeconds / row.answered) : 0,
    }))
    .sort((a, b) => b.callsHandled - a.callsHandled);
}

export async function listWhatsappConversations(): Promise<CallCenterWhatsappConversation[]> {
  const result = (await table<Record<string, unknown>>("call_center_whatsapp_conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(100)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapWhatsappConversation);
}

export async function listWhatsappMessages(
  conversationId: string,
): Promise<CallCenterWhatsappMessage[]> {
  const result = (await table<Record<string, unknown>>("call_center_whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapWhatsappMessage);
}

export async function getWhatsappConversation(
  id: string,
): Promise<CallCenterWhatsappConversation | null> {
  const result = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapWhatsappConversation(result.data) : null;
}

export async function assignWhatsappConversation(
  conversationId: string,
  agentUserId: string | null,
): Promise<CallCenterWhatsappConversation> {
  const result = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
    .update({
      assigned_agent_id: agentUserId,
      updated_at: new Date().toISOString(),
      status: "open",
    })
    .eq("id", conversationId)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Conversation not found.");
  return mapWhatsappConversation(result.data);
}

export async function upsertWhatsappInboundMessage(input: {
  waId: string;
  customerE164: string;
  customerName: string;
  body: string;
  waMessageId: string;
  rawPayload: Record<string, unknown>;
}): Promise<{
  conversation: CallCenterWhatsappConversation;
  message: CallCenterWhatsappMessage;
  isNewConversation: boolean;
  duplicate: boolean;
}> {
  const waMessageId = input.waMessageId.trim();
  if (waMessageId) {
    const prior = await table<Record<string, unknown>>("call_center_whatsapp_messages")
      .select("*")
      .eq("wa_message_id", waMessageId)
      .maybeSingle();
    throwIfError(prior.error);
    if (prior.data) {
      const conversationId = String(prior.data.conversation_id ?? "");
      const conversation = conversationId
        ? await getWhatsappConversation(conversationId)
        : null;
      if (!conversation) throw new Error("Duplicate WhatsApp message missing conversation.");
      return {
        conversation,
        message: mapWhatsappMessage(prior.data),
        isNewConversation: false,
        duplicate: true,
      };
    }
  }

  const now = new Date().toISOString();
  const existing = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
    .select("*")
    .eq("wa_id", input.waId)
    .maybeSingle();
  throwIfError(existing.error);

  let conversationRow = existing.data;
  const isNewConversation = !conversationRow;
  if (!conversationRow) {
    const created = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
      .insert({
        wa_id: input.waId,
        customer_e164: input.customerE164,
        customer_name: input.customerName,
        status: "open",
        last_message_at: now,
        last_message_preview: input.body.slice(0, 240),
        unread_count: 1,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    throwIfError(created.error);
    conversationRow = created.data;
  } else {
    const updated = await table<Record<string, unknown>>("call_center_whatsapp_conversations")
      .update({
        customer_e164: input.customerE164 || String(conversationRow.customer_e164 ?? ""),
        customer_name: input.customerName || String(conversationRow.customer_name ?? ""),
        last_message_at: now,
        last_message_preview: input.body.slice(0, 240),
        unread_count: Number(conversationRow.unread_count ?? 0) + 1,
        updated_at: now,
        status: "open",
      })
      .eq("id", conversationRow.id)
      .select("*")
      .maybeSingle();
    throwIfError(updated.error);
    conversationRow = updated.data;
  }
  if (!conversationRow) throw new Error("Could not save WhatsApp conversation.");

  const message = await table<Record<string, unknown>>("call_center_whatsapp_messages")
    .insert({
      conversation_id: conversationRow.id,
      direction: "inbound",
      body: input.body,
      wa_message_id: waMessageId,
      status: "received",
      raw_payload: input.rawPayload,
    })
    .select("*")
    .maybeSingle();
  throwIfError(message.error);
  if (!message.data) throw new Error("Could not save WhatsApp message.");

  return {
    conversation: mapWhatsappConversation(conversationRow),
    message: mapWhatsappMessage(message.data),
    isNewConversation,
    duplicate: false,
  };
}

export async function updateWhatsappMessageStatusByWaId(input: {
  waMessageId: string;
  status: CallCenterWhatsappMessage["status"];
  errorText?: string;
}): Promise<boolean> {
  const waMessageId = input.waMessageId.trim();
  if (!waMessageId) return false;
  const patch: Record<string, unknown> = { status: input.status };
  if (input.errorText !== undefined) patch.error_text = input.errorText;
  const result = await table<Record<string, unknown>>("call_center_whatsapp_messages")
    .update(patch)
    .eq("wa_message_id", waMessageId)
    .select("id")
    .maybeSingle();
  throwIfError(result.error);
  return Boolean(result.data);
}

/** Cloud API text send used by agent replies and first-message auto-reply. */
export async function sendWhatsappCloudText(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  body: string;
}): Promise<{ ok: true; waMessageId: string } | { ok: false; error: string }> {
  const to = input.toDigits.replace(/\D/g, "");
  if (!input.phoneNumberId.trim() || !input.accessToken.trim() || !to || !input.body.trim()) {
    return { ok: false, error: "WhatsApp send missing phone number ID, token, recipient, or body." };
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId.trim())}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.body.trim() },
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return {
        ok: false,
        error: payload.error?.message || `Meta Graph HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      waMessageId: String(payload.messages?.[0]?.id ?? ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "WhatsApp send failed" };
  }
}

export async function insertWhatsappOutboundMessage(input: {
  conversationId: string;
  body: string;
  waMessageId: string;
  status: CallCenterWhatsappMessage["status"];
  errorText?: string;
  /** Null for system auto-replies (no agent). */
  sentBy: string | null;
}): Promise<CallCenterWhatsappMessage> {
  const now = new Date().toISOString();
  const message = await table<Record<string, unknown>>("call_center_whatsapp_messages")
    .insert({
      conversation_id: input.conversationId,
      direction: "outbound",
      body: input.body,
      wa_message_id: input.waMessageId,
      status: input.status,
      error_text: input.errorText ?? "",
      sent_by: input.sentBy,
    })
    .select("*")
    .maybeSingle();
  throwIfError(message.error);
  if (!message.data) throw new Error("Could not save outbound message.");

  await table<Record<string, unknown>>("call_center_whatsapp_conversations")
    .update({
      last_message_at: now,
      last_message_preview: input.body.slice(0, 240),
      unread_count: 0,
      updated_at: now,
    })
    .eq("id", input.conversationId);

  return mapWhatsappMessage(message.data);
}

export function resolveWhatsappAccessToken(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.whatsapp_access_token?.trim() ||
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() ||
    ""
  );
}

export function resolveWhatsappVerifyToken(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.whatsapp_verify_token?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    ""
  );
}

export function resolveWhatsappPhoneNumberId(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.whatsapp_phone_number_id?.trim() ||
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ||
    ""
  );
}

export function resolveInstagramPageAccessToken(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.instagram_page_access_token?.trim() ||
    process.env.INSTAGRAM_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    ""
  );
}

export function resolveInstagramPageId(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.instagram_page_id?.trim() ||
    process.env.INSTAGRAM_PAGE_ID?.trim() ||
    process.env.META_PAGE_ID?.trim() ||
    ""
  );
}

export function resolveInstagramIgUserId(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.instagram_ig_user_id?.trim() ||
    process.env.INSTAGRAM_IG_USER_ID?.trim() ||
    ""
  );
}

export function resolveInstagramVerifyToken(settings: CallCenterSettingsRow | null): string {
  return (
    settings?.instagram_verify_token?.trim() ||
    process.env.INSTAGRAM_VERIFY_TOKEN?.trim() ||
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    ""
  );
}

export function resolveMessengerSettingsAccessToken(
  settings: CallCenterSettingsRow | null,
): string {
  return resolveMessengerAccessToken(settings?.messenger_page_access_token);
}

export function resolveMessengerSettingsPageId(
  settings: CallCenterSettingsRow | null,
): string {
  return resolveMessengerPageId(settings?.messenger_page_id);
}

export function resolveMessengerSettingsVerifyToken(
  settings: CallCenterSettingsRow | null,
): string {
  return resolveMessengerVerifyToken(settings?.messenger_verify_token);
}

export function resolveM365SettingsMailbox(settings: CallCenterSettingsRow | null): string {
  return resolveM365Mailbox(settings?.m365_mailbox);
}

export function resolveM365SettingsTenantId(settings: CallCenterSettingsRow | null): string {
  return resolveM365TenantId(settings?.m365_tenant_id);
}

export function resolveM365SettingsClientId(settings: CallCenterSettingsRow | null): string {
  return resolveM365ClientId(settings?.m365_client_id);
}

export function resolveM365SettingsClientSecret(
  settings: CallCenterSettingsRow | null,
): string {
  return resolveM365ClientSecret(settings?.m365_client_secret);
}

export function resolveM365SettingsClientState(
  settings: CallCenterSettingsRow | null,
): string {
  return resolveM365ClientState(settings?.m365_webhook_client_state);
}

function mapQaTemplate(row: Record<string, unknown>): CallCenterQaTemplate {
  const raw = Array.isArray(row.criteria_json) ? row.criteria_json : [];
  const criteria: CallCenterQaCriterion[] = raw
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => ({
      id: String(c.id ?? crypto.randomUUID()),
      label: String(c.label ?? ""),
      maxScore: Math.max(1, Number(c.maxScore ?? 5) || 5),
      aiScored: Boolean(c.aiScored),
    }));
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    criteria,
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapQaEvaluation(row: Record<string, unknown>): CallCenterQaEvaluation {
  return {
    id: String(row.id),
    callId: String(row.call_id),
    templateId: row.template_id ? String(row.template_id) : null,
    agentUserId: row.agent_user_id ? String(row.agent_user_id) : null,
    evaluatorUserId: row.evaluator_user_id ? String(row.evaluator_user_id) : null,
    scores:
      row.scores_json && typeof row.scores_json === "object"
        ? (row.scores_json as Record<string, number>)
        : {},
    totalScore: Number(row.total_score ?? 0),
    notes: String(row.notes ?? ""),
    aiFlags:
      row.ai_flags_json && typeof row.ai_flags_json === "object"
        ? (row.ai_flags_json as Record<string, unknown>)
        : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapReportSchedule(row: Record<string, unknown>): CallCenterReportSchedule {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    frequency: (row.frequency as CallCenterReportSchedule["frequency"]) || "daily",
    emails: Array.isArray(row.emails) ? row.emails.map(String) : [],
    includeWhatsapp: Boolean(row.include_whatsapp ?? true),
    includeAgents: Boolean(row.include_agents ?? true),
    isActive: Boolean(row.is_active ?? true),
    lastSentAt: row.last_sent_at ? String(row.last_sent_at) : null,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapWhatsappTemplate(row: Record<string, unknown>): CallCenterWhatsappTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    language: String(row.language ?? "en"),
    body: String(row.body ?? ""),
    category: String(row.category ?? "utility"),
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapKeywordAlert(row: Record<string, unknown>): CallCenterKeywordAlert {
  return {
    id: String(row.id),
    keyword: String(row.keyword ?? ""),
    notifyEmails: Array.isArray(row.notify_emails) ? row.notify_emails.map(String) : [],
    isActive: Boolean(row.is_active ?? true),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function listQaTemplates(): Promise<CallCenterQaTemplate[]> {
  const result = (await table<Record<string, unknown>>("call_center_qa_templates")
    .select("*")
    .order("updated_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapQaTemplate);
}

export async function upsertQaTemplate(input: {
  id?: string;
  name: string;
  criteria: CallCenterQaCriterion[];
  isActive: boolean;
}): Promise<CallCenterQaTemplate> {
  const payload = {
    name: input.name.trim(),
    criteria_json: input.criteria,
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_qa_templates")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("QA template could not be saved.");
    return mapQaTemplate(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_qa_templates")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("QA template could not be saved.");
  return mapQaTemplate(result.data);
}

export async function deleteQaTemplate(id: string): Promise<void> {
  throwIfError((await table("call_center_qa_templates").delete().eq("id", id)).error);
}

export async function listQaEvaluations(limit = 100): Promise<CallCenterQaEvaluation[]> {
  const result = (await table<Record<string, unknown>>("call_center_qa_evaluations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapQaEvaluation);
}

export async function upsertQaEvaluation(input: {
  id?: string;
  callId: string;
  templateId: string | null;
  agentUserId: string | null;
  evaluatorUserId: string | null;
  scores: Record<string, number>;
  totalScore: number;
  notes: string;
  aiFlags?: Record<string, unknown>;
}): Promise<CallCenterQaEvaluation> {
  const payload = {
    call_id: input.callId,
    template_id: input.templateId,
    agent_user_id: input.agentUserId,
    evaluator_user_id: input.evaluatorUserId,
    scores_json: input.scores,
    total_score: input.totalScore,
    notes: input.notes,
    ai_flags_json: input.aiFlags ?? {},
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_qa_evaluations")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("QA evaluation could not be saved.");
    return mapQaEvaluation(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_qa_evaluations")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("QA evaluation could not be saved.");
  return mapQaEvaluation(result.data);
}

export async function listReportSchedules(): Promise<CallCenterReportSchedule[]> {
  const result = (await table<Record<string, unknown>>("call_center_report_schedules")
    .select("*")
    .order("updated_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapReportSchedule);
}

export async function upsertReportSchedule(input: {
  id?: string;
  name: string;
  frequency: CallCenterReportSchedule["frequency"];
  emails: string[];
  includeWhatsapp: boolean;
  includeAgents: boolean;
  isActive: boolean;
  nextRunAt?: string | null;
}): Promise<CallCenterReportSchedule> {
  const payload = {
    name: input.name.trim(),
    frequency: input.frequency,
    emails: input.emails,
    include_whatsapp: input.includeWhatsapp,
    include_agents: input.includeAgents,
    is_active: input.isActive,
    next_run_at: input.nextRunAt ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_report_schedules")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Report schedule could not be saved.");
    return mapReportSchedule(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_report_schedules")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Report schedule could not be saved.");
  return mapReportSchedule(result.data);
}

export async function deleteReportSchedule(id: string): Promise<void> {
  throwIfError((await table("call_center_report_schedules").delete().eq("id", id)).error);
}

export async function markReportScheduleSent(id: string, nextRunAt: string | null): Promise<void> {
  throwIfError(
    (
      await table("call_center_report_schedules")
        .update({
          last_sent_at: new Date().toISOString(),
          next_run_at: nextRunAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
    ).error,
  );
}

export async function listWhatsappTemplates(): Promise<CallCenterWhatsappTemplate[]> {
  const result = (await table<Record<string, unknown>>("call_center_whatsapp_templates")
    .select("*")
    .order("name", { ascending: true })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapWhatsappTemplate);
}

export async function upsertWhatsappTemplate(input: {
  id?: string;
  name: string;
  language: string;
  body: string;
  category: string;
  isActive: boolean;
}): Promise<CallCenterWhatsappTemplate> {
  const payload = {
    name: input.name.trim(),
    language: input.language.trim() || "en",
    body: input.body,
    category: input.category.trim() || "utility",
    is_active: input.isActive,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_whatsapp_templates")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("WhatsApp template could not be saved.");
    return mapWhatsappTemplate(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_whatsapp_templates")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("WhatsApp template could not be saved.");
  return mapWhatsappTemplate(result.data);
}

export async function deleteWhatsappTemplate(id: string): Promise<void> {
  throwIfError((await table("call_center_whatsapp_templates").delete().eq("id", id)).error);
}

export async function listKeywordAlerts(): Promise<CallCenterKeywordAlert[]> {
  const result = (await table<Record<string, unknown>>("call_center_keyword_alerts")
    .select("*")
    .order("created_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapKeywordAlert);
}

export async function upsertKeywordAlert(input: {
  id?: string;
  keyword: string;
  notifyEmails: string[];
  isActive: boolean;
}): Promise<CallCenterKeywordAlert> {
  const payload = {
    keyword: input.keyword.trim().toLowerCase(),
    notify_emails: input.notifyEmails,
    is_active: input.isActive,
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_keyword_alerts")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Keyword alert could not be saved.");
    return mapKeywordAlert(result.data);
  }
  const result = await table<Record<string, unknown>>("call_center_keyword_alerts")
    .insert(payload)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Keyword alert could not be saved.");
  return mapKeywordAlert(result.data);
}

export async function deleteKeywordAlert(id: string): Promise<void> {
  throwIfError((await table("call_center_keyword_alerts").delete().eq("id", id)).error);
}

export async function searchCallsByKeyword(keyword: string, limit = 80): Promise<CallCenterCall[]> {
  const q = keyword.trim().toLowerCase();
  if (!q) return [];
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(400)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? [])
    .map(mapCall)
    .filter(
      (c) =>
        c.transcriptText.toLowerCase().includes(q) ||
        c.agentNotes.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.keywordHits.some((t) => t.toLowerCase().includes(q)) ||
        c.fromE164.includes(q) ||
        c.toE164.includes(q),
    )
    .slice(0, limit);
}

function mapSendpulseTicket(row: Record<string, unknown>): CallCenterSendpulseTicket {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    dedupeKey: String(row.dedupe_key ?? ""),
    source: "sendpulse",
    eventTitle: String(row.event_title ?? ""),
    service: String(row.service ?? ""),
    status: (row.status as CallCenterSendpulseTicket["status"]) || "open",
    contactId: row.contact_id ? String(row.contact_id) : null,
    sendpulseContactId: String(row.sendpulse_contact_id ?? ""),
    sendpulseBotId: String(row.sendpulse_bot_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerE164: String(row.customer_e164 ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    summary: String(row.summary ?? ""),
    lastMessage: String(row.last_message ?? ""),
    whatsappConversationId: row.whatsapp_conversation_id
      ? String(row.whatsapp_conversation_id)
      : null,
    metadata,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function findPhoneContactByE164(e164: string): Promise<CallCenterPhoneContact | null> {
  const normalized = normalizeE164(e164);
  if (!normalized) return null;
  const result = await table<Record<string, unknown>>("call_center_contacts")
    .select("*")
    .eq("e164", normalized)
    .limit(1)
    .maybeSingle();
  if (result.error) return null;
  return result.data ? mapPhoneContact(result.data) : null;
}

export async function findPhoneContactByEmail(email: string): Promise<CallCenterPhoneContact | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const result = (await table<Record<string, unknown>>("call_center_contacts")
    .select("*")
    .limit(200)) as ListResult<Record<string, unknown>>;
  if (result.error) return null;
  const hit = (result.data ?? []).find(
    (row) => String(row.email ?? "").trim().toLowerCase() === normalized,
  );
  return hit ? mapPhoneContact(hit) : null;
}

/**
 * Upsert call-center phonebook contact by E.164 (preferred) or email.
 * Merges tags and appends a short SendPulse note when new.
 */
export async function upsertPhoneContactFromSendPulse(input: {
  displayName: string;
  e164?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  sendpulseContactId?: string;
}): Promise<CallCenterPhoneContact | null> {
  const e164 = normalizeE164(input.e164 ?? "");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!e164 && !email) return null;

  const existing =
    (e164 ? await findPhoneContactByE164(e164) : null) ||
    (email ? await findPhoneContactByEmail(email) : null);

  const tagSet = new Set<string>([
    ...(existing?.tags ?? []),
    ...(input.tags ?? []),
    "sendpulse",
  ]);
  if (input.sendpulseContactId) tagSet.add(`sp:${input.sendpulseContactId}`);

  const noteBits = [
    existing?.notes?.trim() ?? "",
    input.notes?.trim() ?? "",
    input.sendpulseContactId ? `SendPulse contact id: ${input.sendpulseContactId}` : "",
  ].filter(Boolean);
  const notes = [...new Set(noteBits)].join("\n").slice(0, 2000);

  return upsertPhoneContact({
    id: existing?.id,
    displayName: input.displayName.trim() || existing?.displayName || e164 || email,
    e164: e164 || existing?.e164 || "",
    email: email || existing?.email || "",
    company: existing?.company,
    notes,
    tags: [...tagSet],
    isFavorite: existing?.isFavorite,
    isPriority: existing?.isPriority,
  });
}

export async function findSendpulseTicketByDedupeKey(
  dedupeKey: string,
): Promise<CallCenterSendpulseTicket | null> {
  const key = dedupeKey.trim();
  if (!key) return null;
  const result = await table<Record<string, unknown>>("call_center_sendpulse_tickets")
    .select("*")
    .eq("dedupe_key", key)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return mapSendpulseTicket(result.data);
}

export async function upsertSendpulseTicket(input: {
  dedupeKey: string;
  eventTitle: string;
  service: string;
  contactId?: string | null;
  sendpulseContactId?: string;
  sendpulseBotId?: string;
  customerName?: string;
  customerE164?: string;
  customerEmail?: string;
  summary?: string;
  lastMessage?: string;
  whatsappConversationId?: string | null;
  metadata?: Record<string, unknown>;
  status?: CallCenterSendpulseTicket["status"];
}): Promise<{ ticket: CallCenterSendpulseTicket; duplicate: boolean }> {
  const dedupeKey = input.dedupeKey.trim();
  if (!dedupeKey) throw new Error("SendPulse ticket dedupe key required.");

  const prior = await findSendpulseTicketByDedupeKey(dedupeKey);
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    dedupe_key: dedupeKey,
    source: "sendpulse",
    event_title: input.eventTitle.trim(),
    service: (input.service || "").trim(),
    status: input.status ?? "open",
    contact_id: input.contactId ?? null,
    sendpulse_contact_id: (input.sendpulseContactId ?? "").trim(),
    sendpulse_bot_id: (input.sendpulseBotId ?? "").trim(),
    customer_name: (input.customerName ?? "").trim(),
    customer_e164: normalizeE164(input.customerE164 ?? ""),
    customer_email: (input.customerEmail ?? "").trim().toLowerCase(),
    summary: (input.summary ?? "").trim().slice(0, 2000),
    last_message: (input.lastMessage ?? "").trim().slice(0, 2000),
    whatsapp_conversation_id: input.whatsappConversationId ?? null,
    metadata: {
      source: "sendpulse",
      ...(input.metadata ?? {}),
    },
    updated_at: now,
  };

  if (prior) {
    const result = await table<Record<string, unknown>>("call_center_sendpulse_tickets")
      .update({
        ...payload,
        // Keep original created_at; refresh preview fields on replay.
      })
      .eq("id", prior.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("SendPulse ticket could not be updated.");
    return { ticket: mapSendpulseTicket(result.data), duplicate: true };
  }

  const result = await table<Record<string, unknown>>("call_center_sendpulse_tickets")
    .insert({
      ...payload,
      created_at: now,
    })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("SendPulse ticket could not be created.");
  return { ticket: mapSendpulseTicket(result.data), duplicate: false };
}

function mapOmniTicket(row: Record<string, unknown>): CallCenterOmniTicket {
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const source = String(row.source ?? "whatsapp") as CallCenterOmniTicket["source"];
  return {
    id: String(row.id),
    dedupeKey: String(row.dedupe_key ?? ""),
    source,
    channel: String(row.channel ?? ""),
    eventTitle: String(row.event_title ?? ""),
    status: (row.status as CallCenterOmniTicket["status"]) || "open",
    contactId: row.contact_id ? String(row.contact_id) : null,
    externalThreadId: String(row.external_thread_id ?? ""),
    externalMessageId: String(row.external_message_id ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerE164: String(row.customer_e164 ?? ""),
    customerEmail: String(row.customer_email ?? ""),
    customerExternalId: String(row.customer_external_id ?? ""),
    summary: String(row.summary ?? ""),
    lastMessage: String(row.last_message ?? ""),
    assignedAgentId: row.assigned_agent_id ? String(row.assigned_agent_id) : null,
    metadata,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function findOmniTicketByDedupeKey(
  dedupeKey: string,
): Promise<CallCenterOmniTicket | null> {
  const key = dedupeKey.trim();
  if (!key) return null;
  const result = await table<Record<string, unknown>>("call_center_omni_tickets")
    .select("*")
    .eq("dedupe_key", key)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return mapOmniTicket(result.data);
}

export async function listOmniTickets(input?: {
  source?: CallCenterOmniSource;
  status?: CallCenterOmniTicket["status"];
  limit?: number;
}): Promise<CallCenterOmniTicket[]> {
  let query = table<Record<string, unknown>>("call_center_omni_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(input?.limit ?? 80);
  if (input?.source) query = query.eq("source", input.source);
  if (input?.status) query = query.eq("status", input.status);
  const result = (await query) as ListResult<Record<string, unknown>>;
  if (result.error) {
    // Table may not exist until migration is applied.
    if (/call_center_omni_tickets|does not exist|schema cache/i.test(result.error.message)) {
      return [];
    }
    throwIfError(result.error);
  }
  return (result.data ?? []).map(mapOmniTicket);
}

/**
 * Upsert phonebook contact for any omnichannel source (Messenger, IG, M365, etc.).
 */
export async function upsertPhoneContactFromOmni(input: {
  displayName: string;
  e164?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  externalId?: string;
  sourceTag: string;
}): Promise<CallCenterPhoneContact | null> {
  const e164 = normalizeE164(input.e164 ?? "");
  const email = (input.email ?? "").trim().toLowerCase();
  if (!e164 && !email && !input.externalId?.trim()) return null;

  const existing =
    (e164 ? await findPhoneContactByE164(e164) : null) ||
    (email ? await findPhoneContactByEmail(email) : null);

  const tagSet = new Set<string>([
    ...(existing?.tags ?? []),
    ...(input.tags ?? []),
    input.sourceTag,
  ]);
  if (input.externalId) tagSet.add(`${input.sourceTag}:${input.externalId}`);

  const noteBits = [
    existing?.notes?.trim() ?? "",
    input.notes?.trim() ?? "",
    input.externalId ? `${input.sourceTag} id: ${input.externalId}` : "",
  ].filter(Boolean);
  const notes = [...new Set(noteBits)].join("\n").slice(0, 2000);

  return upsertPhoneContact({
    id: existing?.id,
    displayName:
      input.displayName.trim() ||
      existing?.displayName ||
      e164 ||
      email ||
      input.externalId ||
      "Unknown",
    e164: e164 || existing?.e164 || "",
    email: email || existing?.email || "",
    company: existing?.company,
    notes,
    tags: [...tagSet],
    isFavorite: existing?.isFavorite,
    isPriority: existing?.isPriority,
  });
}

export async function upsertOmniTicket(input: {
  dedupeKey: string;
  source: CallCenterOmniSource;
  channel?: string;
  eventTitle?: string;
  contactId?: string | null;
  externalThreadId?: string;
  externalMessageId?: string;
  customerName?: string;
  customerE164?: string;
  customerEmail?: string;
  customerExternalId?: string;
  summary?: string;
  lastMessage?: string;
  assignedAgentId?: string | null;
  metadata?: Record<string, unknown>;
  status?: CallCenterOmniTicket["status"];
}): Promise<{ ticket: CallCenterOmniTicket; duplicate: boolean }> {
  const dedupeKey = input.dedupeKey.trim();
  if (!dedupeKey) throw new Error("Omni ticket dedupe key required.");

  const prior = await findOmniTicketByDedupeKey(dedupeKey);
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    dedupe_key: dedupeKey,
    source: input.source,
    channel: (input.channel || "").trim(),
    event_title: (input.eventTitle || "inbound").trim(),
    status: input.status ?? "open",
    contact_id: input.contactId ?? prior?.contactId ?? null,
    external_thread_id: (input.externalThreadId ?? "").trim() || prior?.externalThreadId || "",
    external_message_id:
      (input.externalMessageId ?? "").trim() || prior?.externalMessageId || "",
    customer_name: (input.customerName ?? "").trim() || prior?.customerName || "",
    customer_e164: normalizeE164(input.customerE164 ?? "") || prior?.customerE164 || "",
    customer_email:
      (input.customerEmail ?? "").trim().toLowerCase() || prior?.customerEmail || "",
    customer_external_id:
      (input.customerExternalId ?? "").trim() || prior?.customerExternalId || "",
    summary: (input.summary ?? "").trim().slice(0, 2000) || prior?.summary || "",
    last_message: (input.lastMessage ?? "").trim().slice(0, 2000) || prior?.lastMessage || "",
    assigned_agent_id:
      input.assignedAgentId !== undefined
        ? input.assignedAgentId
        : (prior?.assignedAgentId ?? null),
    metadata: {
      ...(prior?.metadata ?? {}),
      source: input.source,
      ...(input.metadata ?? {}),
    },
    updated_at: now,
  };

  if (prior) {
    const result = await table<Record<string, unknown>>("call_center_omni_tickets")
      .update(payload)
      .eq("id", prior.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Omni ticket could not be updated.");
    return { ticket: mapOmniTicket(result.data), duplicate: true };
  }

  const result = await table<Record<string, unknown>>("call_center_omni_tickets")
    .insert({
      ...payload,
      created_at: now,
    })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Omni ticket could not be created.");
  return { ticket: mapOmniTicket(result.data), duplicate: false };
}

function mapOmniMessage(row: Record<string, unknown>): CallCenterOmniMessage {
  const raw =
    row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
      ? (row.raw_payload as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id ?? ""),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    body: String(row.body ?? ""),
    subject: String(row.subject ?? ""),
    externalMessageId: String(row.external_message_id ?? ""),
    status: (row.status as CallCenterOmniMessage["status"]) || "received",
    errorText: String(row.error_text ?? ""),
    sentBy: row.sent_by ? String(row.sent_by) : null,
    rawPayload: raw,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function getOmniTicket(id: string): Promise<CallCenterOmniTicket | null> {
  const result = await table<Record<string, unknown>>("call_center_omni_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return mapOmniTicket(result.data);
}

export async function assignOmniTicket(
  ticketId: string,
  agentUserId: string | null,
): Promise<CallCenterOmniTicket> {
  const result = await table<Record<string, unknown>>("call_center_omni_tickets")
    .update({
      assigned_agent_id: agentUserId,
      status: "open",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Omni ticket not found.");
  return mapOmniTicket(result.data);
}

export async function listOmniMessages(ticketId: string): Promise<CallCenterOmniMessage[]> {
  const result = (await table<Record<string, unknown>>("call_center_omni_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(300)) as ListResult<Record<string, unknown>>;
  if (result.error) {
    if (/call_center_omni_messages|does not exist|schema cache/i.test(result.error.message)) {
      return [];
    }
    throwIfError(result.error);
  }
  return (result.data ?? []).map(mapOmniMessage);
}

export async function insertOmniMessage(input: {
  ticketId: string;
  direction: "inbound" | "outbound";
  body: string;
  subject?: string;
  externalMessageId?: string;
  status?: CallCenterOmniMessage["status"];
  errorText?: string;
  sentBy?: string | null;
  rawPayload?: Record<string, unknown>;
}): Promise<{ message: CallCenterOmniMessage; duplicate: boolean }> {
  const externalMessageId = (input.externalMessageId ?? "").trim();
  if (externalMessageId) {
    const prior = await table<Record<string, unknown>>("call_center_omni_messages")
      .select("*")
      .eq("ticket_id", input.ticketId)
      .eq("external_message_id", externalMessageId)
      .maybeSingle();
    if (!prior.error && prior.data) {
      return { message: mapOmniMessage(prior.data), duplicate: true };
    }
  }

  const result = await table<Record<string, unknown>>("call_center_omni_messages")
    .insert({
      ticket_id: input.ticketId,
      direction: input.direction,
      body: input.body.slice(0, 8000),
      subject: (input.subject ?? "").slice(0, 500),
      external_message_id: externalMessageId,
      status: input.status ?? (input.direction === "inbound" ? "received" : "sent"),
      error_text: input.errorText ?? "",
      sent_by: input.sentBy ?? null,
      raw_payload: input.rawPayload ?? {},
    })
    .select("*")
    .maybeSingle();
  if (result.error) {
    if (/duplicate|unique/i.test(result.error.message) && externalMessageId) {
      const again = await table<Record<string, unknown>>("call_center_omni_messages")
        .select("*")
        .eq("ticket_id", input.ticketId)
        .eq("external_message_id", externalMessageId)
        .maybeSingle();
      if (again.data) return { message: mapOmniMessage(again.data), duplicate: true };
    }
    throwIfError(result.error);
  }
  if (!result.data) throw new Error("Omni message could not be saved.");
  return { message: mapOmniMessage(result.data), duplicate: false };
}

export async function saveM365SubscriptionMeta(input: {
  subscriptionId: string;
  expiresAt: string | null;
  updatedBy: string;
}): Promise<void> {
  const existing = await loadSettingsRow();
  if (!existing) return;
  await saveSettingsRow(
    {
      ...existing,
      m365_subscription_id: input.subscriptionId,
      m365_subscription_expires_at: input.expiresAt,
    },
    input.updatedBy,
  );
}
