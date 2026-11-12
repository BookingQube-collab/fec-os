import "server-only";

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
} from "./types";

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
  return {
    userId: String(row.user_id),
    status: (row.status as CallCenterAgentStatusValue) || "offline",
    statusSince: String(row.status_since ?? new Date().toISOString()),
    lastCallAt: row.last_call_at ? String(row.last_call_at) : null,
    extension: String(row.extension ?? ""),
  };
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

const SETTINGS_COLUMNS =
  "enabled, ivr_enabled, business_hours_enabled, business_hours_json, timezone, default_queue_id, telnyx_sip_uri, telnyx_connection_id, telnyx_api_key, telnyx_webhook_secret, livekit_sip_trunk_id, livekit_sip_dispatch_rule_id, webhook_shared_secret, notes, ai_first_answer_enabled, ai_handoff_enabled, ai_notes, outbound_caller_id_e164, webhook_outbound_url, after_hours_greeting, after_hours_action, welcome_greeting, welcome_audio_url, hold_music_url, tts_enabled, tts_voice, tts_greeting_text";

export async function loadSettingsRow(): Promise<CallCenterSettingsRow | null> {
  const result = await table<Record<string, unknown>>("call_center_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", CALL_CENTER_SETTINGS_ID)
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) return null;
  const row = result.data;
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
    livekit_sip_dispatch_rule_id: String(row.livekit_sip_dispatch_rule_id ?? ""),
    webhook_shared_secret: String(row.webhook_shared_secret ?? ""),
    notes: String(row.notes ?? ""),
    ai_first_answer_enabled: Boolean(row.ai_first_answer_enabled),
    ai_handoff_enabled: row.ai_handoff_enabled !== false,
    ai_notes: String(row.ai_notes ?? ""),
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
    tts_voice: String(row.tts_voice ?? "en-US-Neural2-A"),
    tts_greeting_text: String(
      row.tts_greeting_text ?? "Welcome. Press a digit from the menu or stay on the line.",
    ),
  };
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
        livekit_sip_dispatch_rule_id: row.livekit_sip_dispatch_rule_id,
        webhook_shared_secret: row.webhook_shared_secret,
        notes: row.notes,
        ai_first_answer_enabled: row.ai_first_answer_enabled,
        ai_handoff_enabled: row.ai_handoff_enabled,
        ai_notes: row.ai_notes,
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
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "id" },
    )
    .select(SETTINGS_COLUMNS)
    .maybeSingle();
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
  isActive: boolean;
  sortOrder: number;
}): Promise<CallCenterQueue> {
  const payload: Record<string, unknown> = {
    name: input.name,
    strategy: input.strategy,
    event_id: input.eventId,
    wrap_up_seconds: input.wrapUpSeconds,
    max_wait_seconds: input.maxWaitSeconds,
    is_active: input.isActive,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const result = await table<Record<string, unknown>>("call_center_queues")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    throwIfError(result.error);
    if (!result.data) throw new Error("Queue could not be saved.");
    return mapQueue(result.data);
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
  return result.data ? mapAgentStatus(result.data) : null;
}

export async function setAgentStatus(
  userId: string,
  status: CallCenterAgentStatusValue,
  extras?: { lastCallAt?: string | null; extension?: string },
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
  const result = await table<Record<string, unknown>>("call_center_agent_status")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Agent status could not be saved.");
  return mapAgentStatus(result.data);
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
  return (result.data ?? []).map(mapAgentStatus);
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

  const result = await table<Record<string, unknown>>("call_center_calls")
    .update(payload)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Call could not be updated.");
  return mapCall(result.data);
}

export async function getCall(id: string): Promise<CallCenterCall | null> {
  const result = await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(result.error);
  return result.data ? mapCall(result.data) : null;
}

export async function listRecentCalls(limit = 40): Promise<CallCenterCall[]> {
  const result = (await table<Record<string, unknown>>("call_center_calls")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit)) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapCall);
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

  const byId = new Map<string, CallCenterCall>();
  for (const call of [...(offered.data ?? []).map(mapCall), ...simultaneous]) {
    byId.set(call.id, call);
  }
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}


export async function listAgentStatuses(): Promise<CallCenterAgentStatus[]> {
  const result = (await table<Record<string, unknown>>("call_center_agent_status")
    .select("*")
    .order("updated_at", { ascending: false })) as ListResult<Record<string, unknown>>;
  throwIfError(result.error);
  return (result.data ?? []).map(mapAgentStatus);
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
  const [todayCalls, agents, active] = await Promise.all([
    listCallsFiltered({ fromDate: fromIso, limit: 500 }),
    listAgentStatuses(),
    listActiveCalls(),
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
  const vmPending = await listVoicemails({ status: "pending", limit: 50 });
  return {
    callsToday: todayCalls.length,
    answeredToday,
    missedToday,
    answerRate: todayCalls.length === 0 ? 0 : Math.round((answeredToday / todayCalls.length) * 100),
    avgHandleSeconds,
    avgSpeedAnswerSeconds,
    abandonRate:
      todayCalls.length === 0 ? 0 : Math.round((abandonedToday / todayCalls.length) * 100),
    agentsAvailable: agents.filter((a) => a.status === "available").length,
    agentsBusy: agents.filter((a) => a.status === "busy").length,
    agentsAway: agents.filter((a) => a.status === "away" || a.status === "acw").length,
    agentsOffline: agents.filter((a) => a.status === "offline").length,
    agentsInCall: agents.filter((a) => a.status === "busy").length,
    activeCalls: active.length,
    voicemailsPending: vmPending.length,
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
  queueId: string | null;
  eventId: string | null;
  scriptText: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  isActive: boolean;
}): Promise<CallCenterCampaign> {
  const payload: Record<string, unknown> = {
    name: input.name,
    status: input.status,
    caller_id_e164: normalizeE164(input.callerIdE164) || input.callerIdE164,
    queue_id: input.queueId,
    event_id: input.eventId,
    script_text: input.scriptText,
    scheduled_start: input.scheduledStart,
    scheduled_end: input.scheduledEnd,
    is_active: input.isActive,
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
}): Promise<CallCenterCampaignContact> {
  const payload: Record<string, unknown> = {
    campaign_id: input.campaignId,
    e164: normalizeE164(input.e164),
    display_name: input.displayName,
    status: input.status ?? "pending",
    notes: input.notes ?? "",
    updated_at: new Date().toISOString(),
  };
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

export async function upsertPhoneContact(input: {
  id?: string;
  displayName: string;
  e164: string;
  company?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  isFavorite?: boolean;
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
  return result.data ? mapAgentStatus(result.data) : null;
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

  const byAgent = new Map<string, CallCenterAgentPerformanceRow>();
  for (const row of agents.data ?? []) {
    const mapped = mapAgentStatus(row);
    byAgent.set(mapped.userId, {
      userId: mapped.userId,
      extension: mapped.extension,
      status: mapped.status,
      callsHandled: 0,
      answered: 0,
      missed: 0,
      outbound: 0,
      avgHandleSeconds: 0,
      totalTalkSeconds: 0,
    });
  }

  for (const row of calls.data ?? []) {
    const call = mapCall(row);
    if (!call.agentUserId) continue;
    let entry = byAgent.get(call.agentUserId);
    if (!entry) {
      entry = {
        userId: call.agentUserId,
        extension: "",
        status: "offline",
        callsHandled: 0,
        answered: 0,
        missed: 0,
        outbound: 0,
        avgHandleSeconds: 0,
        totalTalkSeconds: 0,
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

  return [...byAgent.values()]
    .map((row) => ({
      ...row,
      avgHandleSeconds:
        row.answered > 0 ? Math.round(row.totalTalkSeconds / row.answered) : 0,
    }))
    .sort((a, b) => b.callsHandled - a.callsHandled);
}
