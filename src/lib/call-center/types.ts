import type { IvrFlowJson } from "./ivr-flow";

export const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
export const CALL_CENTER_DEFAULT_QUEUE_ID = "00000000-0000-4000-8000-0000000000c0";
export const CALL_CENTER_DEFAULT_IVR_MENU_ID = "00000000-0000-4000-8000-0000000000c1";

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
  outbound_caller_id_e164: string;
  webhook_outbound_url: string;
  after_hours_greeting: string;
  after_hours_action: CallCenterAfterHoursAction;
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
  outboundCallerIdE164: string;
  webhookOutboundUrl: string;
  afterHoursGreeting: string;
  afterHoursAction: CallCenterAfterHoursAction;
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
