import type { IvrFlowJson } from "./ivr-flow";

export const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
export const CALL_CENTER_DEFAULT_QUEUE_ID = "00000000-0000-4000-8000-0000000000c0";
export const CALL_CENTER_DEFAULT_IVR_MENU_ID = "00000000-0000-4000-8000-0000000000c1";

/** Venue queues used by the FEC bilingual IVR template. */
export const CALL_CENTER_VENUE_QUEUE_IDS = {
  inflatapark: "00000000-0000-4000-8000-0000000000d1",
  urbanArena: "00000000-0000-4000-8000-0000000000d2",
  kidsDriving: "00000000-0000-4000-8000-0000000000d3",
  birthday: "00000000-0000-4000-8000-0000000000d4",
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

export const CALL_CENTER_AI_PROVIDERS = ["openai", "openai_compatible", "livekit_agents"] as const;
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
  livekit_sip_trunk_id: string;
  livekit_sip_dispatch_rule_id: string;
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
  outbound_caller_id_e164: string;
  webhook_outbound_url: string;
  after_hours_greeting: string;
  after_hours_action: CallCenterAfterHoursAction;
  welcome_greeting: string;
  welcome_audio_url: string;
  hold_music_url: string;
  tts_enabled: boolean;
  tts_voice: string;
  tts_greeting_text: string;
};

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
  telnyxWebhookSecretSet: boolean;
  livekitSipTrunkId: string;
  livekitSipDispatchRuleId: string;
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
  whatsappVerifyTokenSet: boolean;
  whatsappConfigured: boolean;
  outboundCallerIdE164: string;
  webhookOutboundUrl: string;
  afterHoursGreeting: string;
  afterHoursAction: CallCenterAfterHoursAction;
  welcomeGreeting: string;
  welcomeAudioUrl: string;
  holdMusicUrl: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsGreetingText: string;
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
  maxConcurrentCalls: number;
  canWhisper: boolean;
  canBarge: boolean;
  isActive: boolean;
  skills: string[];
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
  createdAt: string;
  updatedAt: string;
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
  answerRate: number;
  avgHandleSeconds: number;
  avgSpeedAnswerSeconds: number;
  abandonRate: number;
  agentsAvailable: number;
  agentsBusy: number;
  agentsAway: number;
  agentsOffline: number;
  agentsInCall: number;
  activeCalls: number;
  voicemailsPending: number;
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
