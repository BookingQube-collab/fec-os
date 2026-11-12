export const CALL_CENTER_SETTINGS_ID = "00000000-0000-4000-8000-0000000000cc";
export const CALL_CENTER_DEFAULT_QUEUE_ID = "00000000-0000-4000-8000-0000000000c0";
export const CALL_CENTER_DEFAULT_IVR_MENU_ID = "00000000-0000-4000-8000-0000000000c1";

export const CALL_CENTER_AGENT_STATUSES = ["available", "busy", "away", "acw", "offline"] as const;
export type CallCenterAgentStatusValue = (typeof CALL_CENTER_AGENT_STATUSES)[number];

export const CALL_CENTER_QUEUE_STRATEGIES = ["simultaneous", "round_robin", "longest_idle"] as const;
export type CallCenterQueueStrategy = (typeof CALL_CENTER_QUEUE_STRATEGIES)[number];

export const CALL_CENTER_IVR_ACTIONS = ["queue", "voicemail", "hangup", "transfer_sip", "repeat"] as const;
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
