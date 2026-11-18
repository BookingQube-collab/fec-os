import type { CallCenterInboundMode, TelnyxDtmfMode } from "./dtmf-codes";
import type { IvrFlowJson } from "./ivr-flow";

export type { CallCenterInboundMode, TelnyxDtmfMode } from "./dtmf-codes";
export { CALL_CENTER_INBOUND_MODES, TELNYX_DTMF_MODES } from "./dtmf-codes";

export const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
export const CALL_CENTER_DEFAULT_QUEUE_ID = "00000000-0000-4000-8000-0000000000c0";
export const CALL_CENTER_DEFAULT_IVR_MENU_ID = "00000000-0000-4000-8000-0000000000c1";

/** Venue / skill queues used by the E3 bilingual IVR template. */
export const CALL_CENTER_VENUE_QUEUE_IDS = {
  inflatapark: "00000000-0000-4000-8000-0000000000d1",
  urbanArena: "00000000-0000-4000-8000-0000000000d2",
  kidsDriving: "00000000-0000-4000-8000-0000000000d3",
  birthday: "00000000-0000-4000-8000-0000000000d4",
  /** General E3 customer support (center menu digit 0). */
  general: "00000000-0000-4000-8000-0000000000d5",
} as const;

export const CALL_CENTER_AGENT_STATUSES = ["available", "busy", "away", "acw", "offline"] as const;
export type CallCenterAgentStatusValue = (typeof CALL_CENTER_AGENT_STATUSES)[number];

export const CALL_CENTER_QUEUE_STRATEGIES = ["simultaneous", "round_robin", "longest_idle"] as const;
export type CallCenterQueueStrategy = (typeof CALL_CENTER_QUEUE_STRATEGIES)[number];

export const CALL_CENTER_IVR_ACTIONS = [
  "queue",
  "voicemail",
  "hangup",
  "transfer_sip",
  "repeat",
  "menu",
  "agent",
  "ai",
] as const;
export type CallCenterIvrAction = (typeof CALL_CENTER_IVR_ACTIONS)[number];

export const CALL_CENTER_CALL_STATUSES = [
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
] as const;
export type CallCenterCallStatus = (typeof CALL_CENTER_CALL_STATUSES)[number];

export const CALL_CENTER_PROVIDERS = ["none", "telnyx", "livekit_sip", "test"] as const;
export type CallCenterProvider = (typeof CALL_CENTER_PROVIDERS)[number];

export const CALL_CENTER_CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;
export type CallCenterCampaignStatus = (typeof CALL_CENTER_CAMPAIGN_STATUSES)[number];

export const CALL_CENTER_CONTACT_STATUSES = [
  "pending",
  "dialing",
  "answered",
  "no_answer",
  "failed",
  "skipped",
  "completed",
] as const;
export type CallCenterContactStatus = (typeof CALL_CENTER_CONTACT_STATUSES)[number];

export type CallCenterAfterHoursAction = "voicemail" | "hangup" | "queue";

export const CALL_CENTER_AI_PROVIDERS = [
  "admin_gateway",
  "openai",
  "openai_compatible",
  "livekit_agents",
] as const;
export type CallCenterAiProvider = (typeof CALL_CENTER_AI_PROVIDERS)[number];

export type CallCenterSettingsRow = {
  enabled: boolean;
  ivr_enabled: boolean;
  business_hours_enabled: boolean;
  business_hours_json: Record<string, unknown>;
  timezone: string;
  default_queue_id: string | null;
  telnyx_sip_uri: string;
  telnyx_connection_id: string;
  telnyx_api_key: string;
  telnyx_webhook_secret: string;
  /** LiveKit outbound SIP trunk id (ST_…) for agent dial-out. */
  livekit_sip_trunk_id: string;
  /** LiveKit inbound SIP trunk id (ST_…) for Telnyx SIP origination. */
  livekit_sip_inbound_trunk_id: string;
  livekit_sip_dispatch_rule_id: string;
  /** telnyx_sip_trunk (recommended) | telnyx_call_control */
  inbound_mode: CallCenterInboundMode;
  /** Telnyx DTMF; rfc2833 recommended for IVR. */
  telnyx_dtmf_mode: TelnyxDtmfMode;
  /** Primary Qatar +974 DID reminder (E.164). */
  qatar_did_e164: string;
  webhook_shared_secret: string;
  notes: string;
  ai_first_answer_enabled: boolean;
  ai_handoff_enabled: boolean;
  ai_notes: string;
  ai_system_prompt_en: string;
  ai_system_prompt_ar: string;
  ai_welcome_en: string;
  ai_welcome_ar: string;
  ai_provider: CallCenterAiProvider;
  ai_model: string;
  ai_api_key: string;
  ai_base_url: string;
  ai_languages: string[];
  ai_handoff_after_seconds: number;
  ai_handoff_keywords: string;
  ai_handoff_queue_id: string | null;
  ai_livekit_agent_name: string;
  whatsapp_enabled: boolean;
  whatsapp_phone_number_id: string;
  whatsapp_waba_id: string;
  whatsapp_access_token: string;
  whatsapp_verify_token: string;
  /** Send a one-shot text reply when a new WhatsApp conversation is created. */
  whatsapp_auto_reply_enabled: boolean;
  whatsapp_auto_reply_text: string;
  outbound_caller_id_e164: string;
  webhook_outbound_url: string;
  after_hours_greeting: string;
  after_hours_action: CallCenterAfterHoursAction;
  welcome_greeting: string;
  welcome_audio_url: string;
  hold_music_url: string;
  tts_enabled: boolean;
  tts_voice: string;
  /** Arabic-majority IVR speak voice (Azure Fatima / ElevenLabs / …). */
  tts_voice_ar: string;
  /**
   * Telnyx Integration Secret identifier for ElevenLabs BYOK (not the raw API key).
   * Env `TELNYX_ELEVENLABS_API_KEY_REF` is the fallback when this is empty.
   */
  telnyx_elevenlabs_api_key_ref: string;
  tts_greeting_text: string;
  /** Human-recorded EN bridge prompt (recording disclosure + connecting). */
  bridge_prompt_audio_url_en: string;
  /** Human-recorded AR/Qatari bridge prompt (recording disclosure + connecting). */
  bridge_prompt_audio_url_ar: string;
  /** When true (default), auto-start LiveKit egress on answer / outbound dial. */
  record_all_calls: boolean;
  /**
   * Public HTTPS base (CDN / S3 / LiveKit egress bucket URL) used to compose
   * `recording_url` as `{base}/call-center/{callId}.mp4`.
   */
  recording_storage_base_url: string;
  instagram_enabled: boolean;
  instagram_page_id: string;
  instagram_ig_user_id: string;
  instagram_page_access_token: string;
  instagram_verify_token: string;
  messenger_enabled: boolean;
  messenger_page_id: string;
  messenger_page_access_token: string;
  messenger_verify_token: string;
  m365_enabled: boolean;
  m365_mailbox: string;
  m365_tenant_id: string;
  m365_client_id: string;
  m365_client_secret: string;
  m365_webhook_client_state: string;
  m365_subscription_id: string;
  m365_subscription_expires_at: string | null;
  /** Encrypted SendPulse webhook secret (AES-256-GCM). Env SENDPULSE_WEBHOOK_SECRET is fallback. */
  sendpulse_webhook_secret: string;
  /** SendPulse chatbot WhatsApp E.164. Env SENDPULSE_WHATSAPP_NUMBER is fallback. */
  sendpulse_whatsapp_number: string;
};

export const CALL_CENTER_SECRET_FIELDS = [
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
  "sendpulse_webhook_secret",
] as const;

export type CallCenterSecretField = (typeof CALL_CENTER_SECRET_FIELDS)[number];

export type CallCenterSettingsPublic = {
  enabled: boolean;
  ivrEnabled: boolean;
  businessHoursEnabled: boolean;
  businessHoursJson: Record<string, unknown>;
  timezone: string;
  defaultQueueId: string | null;
  telnyxSipUri: string;
  telnyxConnectionId: string;
  telnyxKeyLast4: string;
  telnyxKeySet: boolean;
  telnyxWebhookSecretLast4: string;
  telnyxWebhookSecretSet: boolean;
  livekitSipTrunkId: string;
  livekitSipInboundTrunkId: string;
  livekitSipDispatchRuleId: string;
  inboundMode: CallCenterInboundMode;
  telnyxDtmfMode: TelnyxDtmfMode;
  qatarDidE164: string;
  webhookSecretLast4: string;
  webhookSecretSet: boolean;
  notes: string;
  sipConfigured: boolean;
  livekitReady: boolean;
  aiFirstAnswerEnabled: boolean;
  aiHandoffEnabled: boolean;
  aiNotes: string;
  aiSystemPromptEn: string;
  aiSystemPromptAr: string;
  aiWelcomeEn: string;
  aiWelcomeAr: string;
  aiProvider: CallCenterAiProvider;
  aiModel: string;
  aiApiKeySet: boolean;
  aiApiKeyLast4: string;
  aiBaseUrl: string;
  aiLanguages: string[];
  aiHandoffAfterSeconds: number;
  aiHandoffKeywords: string;
  aiHandoffQueueId: string | null;
  aiLivekitAgentName: string;
  aiConfigured: boolean;
  openaiEnvKeySet: boolean;
  whatsappEnabled: boolean;
  whatsappPhoneNumberId: string;
  whatsappWabaId: string;
  whatsappAccessTokenSet: boolean;
  whatsappAccessTokenLast4: string;
  whatsappVerifyTokenLast4: string;
  whatsappVerifyTokenSet: boolean;
  whatsappConfigured: boolean;
  whatsappAutoReplyEnabled: boolean;
  whatsappAutoReplyText: string;
  outboundCallerIdE164: string;
  webhookOutboundUrl: string;
  afterHoursGreeting: string;
  afterHoursAction: CallCenterAfterHoursAction;
  welcomeGreeting: string;
  welcomeAudioUrl: string;
  holdMusicUrl: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsVoiceAr: string;
  /** Telnyx Integration Secret identifier (safe to show — not the raw ElevenLabs key). */
  elevenLabsApiKeyRef: string;
  /** True when settings or env has a Telnyx ElevenLabs secret ref. */
  elevenLabsApiKeyRefSet: boolean;
  /** True when process.env.TELNYX_ELEVENLABS_API_KEY_REF is set (Vercel). */
  elevenLabsEnvRefSet: boolean;
  ttsGreetingText: string;
  bridgePromptAudioUrlEn: string;
  bridgePromptAudioUrlAr: string;
  /** Auto-start LiveKit room recording on every bridged/outbound call. */
  recordAllCalls: boolean;
  /** Public base URL for egress/CDN recordings (no trailing slash required). */
  recordingStorageBaseUrl: string;
  instagramEnabled: boolean;
  instagramPageId: string;
  instagramIgUserId: string;
  instagramPageAccessTokenSet: boolean;
  instagramPageAccessTokenLast4: string;
  instagramVerifyTokenSet: boolean;
  instagramVerifyTokenLast4: string;
  instagramConfigured: boolean;
  messengerEnabled: boolean;
  messengerPageId: string;
  messengerPageAccessTokenSet: boolean;
  messengerPageAccessTokenLast4: string;
  messengerVerifyTokenSet: boolean;
  messengerVerifyTokenLast4: string;
  messengerConfigured: boolean;
  m365Enabled: boolean;
  m365Mailbox: string;
  m365TenantId: string;
  m365ClientId: string;
  m365ClientSecretSet: boolean;
  m365ClientSecretLast4: string;
  m365WebhookClientStateSet: boolean;
  m365WebhookClientStateLast4: string;
  m365Configured: boolean;
  m365SubscriptionId: string;
  m365SubscriptionExpiresAt: string | null;
  /** Admin-saved SendPulse chatbot WhatsApp (E.164); env is fallback when empty. */
  sendpulseWhatsappNumber: string;
  sendpulseWebhookSecretSet: boolean;
  sendpulseWebhookSecretLast4: string;
};

export const CALL_CENTER_DISPOSITION_CODES = [
  "resolved",
  "callback",
  "voicemail_followup",
  "wrong_number",
  "spam",
  "info_only",
  "escalated",
  "other",
] as const;
export type CallCenterDispositionCode = (typeof CALL_CENTER_DISPOSITION_CODES)[number] | "";

export type CallCenterVoicemail = {
  id: string;
  callId: string | null;
  fromE164: string;
  toE164: string;
  queueId: string | null;
  eventId: string | null;
  promptText: string;
  recordingUrl: string;
  transcriptText: string;
  status: "pending" | "listened" | "archived";
  createdAt: string;
  listenedAt: string | null;
  listenedBy: string | null;
};

export type CallCenterQueue = {
  id: string;
  name: string;
  strategy: CallCenterQueueStrategy;
  eventId: string | null;
  wrapUpSeconds: number;
  maxWaitSeconds: number;
  /** Skills required to be offered first (intersect with agent/member skills). */
  requiredSkills: string[];
  /** Target answer time for service-level % (seconds). */
  serviceLevelSeconds: number;
  isActive: boolean;
  sortOrder: number;
};

export type CallCenterQueueMember = {
  id: string;
  queueId: string;
  userId: string;
  priority: number;
  isActive: boolean;
  skills: string[];
};

export type CallCenterDid = {
  id: string;
  e164: string;
  label: string;
  queueId: string | null;
  eventId: string | null;
  ivrMenuId: string | null;
  isActive: boolean;
};

export type CallCenterIvrMenu = {
  id: string;
  name: string;
  greetingText: string;
  timeoutSeconds: number;
  maxRetries: number;
  fallbackQueueId: string | null;
  isActive: boolean;
  /** Visual IVR canvas graph (nodes/edges/viewport). */
  flowJson: IvrFlowJson;
};

export type CallCenterIvrOption = {
  id: string;
  menuId: string;
  digit: string;
  label: string;
  action: CallCenterIvrAction;
  queueId: string | null;
  eventId: string | null;
  transferSipUri: string;
  sortOrder: number;
  nextMenuId: string | null;
  agentUserId: string | null;
  targetNodeId: string;
};

export type CallCenterAgentStatus = {
  userId: string;
  status: CallCenterAgentStatusValue;
  statusSince: string;
  lastCallAt: string | null;
  extension: string;
  displayNameOverride: string;
  /** Resolved label: override → profiles.display_name → short user id. */
  displayName: string;
  maxConcurrentCalls: number;
  canWhisper: boolean;
  canBarge: boolean;
  isActive: boolean;
  skills: string[];
  autoAnswer: boolean;
  awayReason: string;
};

export type CallCenterCall = {
  id: string;
  direction: "inbound" | "outbound" | "internal_test";
  status: CallCenterCallStatus;
  fromE164: string;
  toE164: string;
  didId: string | null;
  queueId: string | null;
  agentUserId: string | null;
  eventId: string | null;
  ivrMenuId: string | null;
  ivrDigit: string | null;
  livekitRoom: string;
  provider: CallCenterProvider;
  providerCallId: string;
  hangupReason: string;
  startedAt: string;
  offeredAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  recordingUrl: string;
  transferType: "cold" | "warm" | null;
  transferTarget: string;
  transferredAt: string | null;
  campaignId: string | null;
  talkSeconds: number | null;
  transcriptText: string;
  transcriptStatus: "none" | "partial" | "final" | "stub";
  transcriptUpdatedAt: string | null;
  whisperActive: boolean;
  bargeActive: boolean;
  agentNotes: string;
  metadata: Record<string, unknown>;
  dispositionCode: string;
  dispositionNotes: string;
  recordingEnabled: boolean;
  tags: string[];
  parkedSlot: string;
  parkedAt: string | null;
  parkedBy: string | null;
  conferenceActive: boolean;
  keywordHits: string[];
};

export type CallCenterPhoneContact = {
  id: string;
  displayName: string;
  e164: string;
  company: string;
  email: string;
  notes: string;
  tags: string[];
  isFavorite: boolean;
  /** VIP — skip IVR / preferred routing when calling in. */
  isPriority: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterTagCatalogItem = {
  id: string;
  name: string;
  color: string;
  isActive: boolean;
  sortOrder: number;
};

export type CallCenterBlacklistEntry = {
  id: string;
  e164: string;
  reason: string;
  isActive: boolean;
  createdAt: string;
};

export type CallCenterAgentPerformanceRow = {
  userId: string;
  displayName: string;
  extension: string;
  status: CallCenterAgentStatusValue;
  callsHandled: number;
  answered: number;
  missed: number;
  outbound: number;
  avgHandleSeconds: number;
  totalTalkSeconds: number;
  displayNameOverride: string;
  maxConcurrentCalls: number;
  canWhisper: boolean;
  canBarge: boolean;
  isActive: boolean;
  skills: string[];
  queueIds: string[];
  autoAnswer: boolean;
  awayReason: string;
};

export type CallCenterWhatsappConversation = {
  id: string;
  waId: string;
  customerE164: string;
  customerName: string;
  assignedAgentId: string | null;
  status: "open" | "pending" | "closed";
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterWhatsappMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string;
  waMessageId: string;
  status: "received" | "sent" | "delivered" | "read" | "failed" | "queued";
  errorText: string;
  sentBy: string | null;
  createdAt: string;
};

export type CallCenterSpeedDial = {
  id: string;
  userId: string;
  label: string;
  e164: string;
  sortOrder: number;
};

export type CallCenterSupervisorMode = "whisper" | "barge";

export type CallCenterTransferTarget = {
  userId: string;
  status: CallCenterAgentStatusValue;
  label: string;
};

export type CallCenterHoliday = {
  id: string;
  name: string;
  holidayDate: string;
  isClosed: boolean;
  notes: string;
};

export type CallCenterCampaign = {
  id: string;
  name: string;
  status: CallCenterCampaignStatus;
  callerIdE164: string;
  queueId: string | null;
  eventId: string | null;
  scriptText: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  isActive: boolean;
  maxAttempts: number;
  dialIntervalSeconds: number;
  amdEnabled: boolean;
  playRecordingUrl: string;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterQaCriterion = {
  id: string;
  label: string;
  maxScore: number;
  aiScored: boolean;
};

export type CallCenterQaTemplate = {
  id: string;
  name: string;
  criteria: CallCenterQaCriterion[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterQaEvaluation = {
  id: string;
  callId: string;
  templateId: string | null;
  agentUserId: string | null;
  evaluatorUserId: string | null;
  scores: Record<string, number>;
  totalScore: number;
  notes: string;
  aiFlags: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterReportSchedule = {
  id: string;
  name: string;
  frequency: "hourly" | "daily" | "weekly" | "monthly" | "once";
  emails: string[];
  includeWhatsapp: boolean;
  includeAgents: boolean;
  isActive: boolean;
  lastSentAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterWhatsappTemplate = {
  id: string;
  name: string;
  language: string;
  body: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterKeywordAlert = {
  id: string;
  keyword: string;
  notifyEmails: string[];
  isActive: boolean;
  createdAt: string;
};

export type CallCenterCampaignContact = {
  id: string;
  campaignId: string;
  e164: string;
  displayName: string;
  status: CallCenterContactStatus;
  lastAttemptAt: string | null;
  attemptCount: number;
  notes: string;
};

export type CallCenterWebhookEndpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secretHint: string;
};

export type CallCenterAnalyticsSummary = {
  callsToday: number;
  answeredToday: number;
  missedToday: number;
  inboundToday: number;
  outboundToday: number;
  answerRate: number;
  avgHandleSeconds: number;
  avgSpeedAnswerSeconds: number;
  abandonRate: number;
  /** % of offered calls answered within queue service_level_seconds. */
  serviceLevelPercent: number;
  agentsAvailable: number;
  agentsBusy: number;
  agentsAway: number;
  agentsOffline: number;
  agentsInCall: number;
  activeCalls: number;
  voicemailsPending: number;
  whatsappOpen: number;
  whatsappMessagesToday: number;
};

export type CallCenterWallboard = {
  agents: CallCenterAgentStatus[];
  activeCalls: CallCenterCall[];
  queues: CallCenterQueue[];
  members: CallCenterQueueMember[];
  metrics: {
    agentsAvailable: number;
    agentsInCall: number;
    activeCalls: number;
    avgSpeedAnswerSeconds: number;
    abandonRate: number;
    missedToday: number;
    voicemailsPending: number;
  };
};

export type CallCenterMediaSession = {
  provider: "none" | "livekit";
  roomName: string;
  token: string;
  serverUrl: string;
  expiresAt: string;
};

export type InboundRouteResult = {
  call: CallCenterCall;
  offeredUserIds: string[];
  phase: "ivr" | "queue" | "ended";
  message: string;
};

export type CallCenterCdrFilters = {
  fromDate?: string | null;
  toDate?: string | null;
  agentUserId?: string | null;
  queueId?: string | null;
  eventId?: string | null;
  direction?: "inbound" | "outbound" | "internal_test" | null;
  status?: CallCenterCallStatus | null;
  limit?: number;
};

/** SendPulse chatbot bridge ticket — agent pickup without rebuilding SendPulse UI. */
export type CallCenterSendpulseTicket = {
  id: string;
  dedupeKey: string;
  source: "sendpulse";
  eventTitle: string;
  service: string;
  status: "open" | "pending" | "closed";
  contactId: string | null;
  sendpulseContactId: string;
  sendpulseBotId: string;
  customerName: string;
  customerE164: string;
  customerEmail: string;
  summary: string;
  lastMessage: string;
  whatsappConversationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterOmniTicket = {
  id: string;
  dedupeKey: string;
  source:
    | "sendpulse"
    | "facebook_messenger"
    | "instagram"
    | "microsoft365_email"
    | "whatsapp";
  channel: string;
  eventTitle: string;
  status: "open" | "pending" | "closed";
  contactId: string | null;
  externalThreadId: string;
  externalMessageId: string;
  customerName: string;
  customerE164: string;
  customerEmail: string;
  customerExternalId: string;
  summary: string;
  lastMessage: string;
  assignedAgentId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CallCenterOmniMessage = {
  id: string;
  ticketId: string;
  direction: "inbound" | "outbound";
  body: string;
  subject: string;
  externalMessageId: string;
  status: "received" | "sent" | "failed" | "pending";
  errorText: string;
  sentBy: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};
