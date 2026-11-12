import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  CALL_CENTER_SETTINGS_ID,
  type CallCenterAgentStatus,
  type CallCenterAgentStatusValue,
  type CallCenterCall,
  type CallCenterCallStatus,
  type CallCenterDid,
  type CallCenterIvrMenu,
  type CallCenterIvrOption,
  type CallCenterProvider,
  type CallCenterQueue,
  type CallCenterQueueMember,
  type CallCenterQueueStrategy,
  type CallCenterSettingsRow,
  type CallCenterIvrAction,
} from "./types";

type DbError = { message: string } | null;

type MaybeSingle<T> = Promise<{ data: T | null; error: DbError }>;
type ListResult<T> = Promise<{ data: T[] | null; error: DbError }>;

type FilterBuilder<T> = {
  eq: (column: string, value: unknown) => FilterBuilder<T>;
  in: (column: string, values: unknown[]) => FilterBuilder<T>;
  is: (column: string, value: null) => FilterBuilder<T>;
  neq: (column: string, value: unknown) => FilterBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => FilterBuilder<T>;
  limit: (count: number) => FilterBuilder<T> & { maybeSingle: () => MaybeSingle<T> };
  maybeSingle: () => MaybeSingle<T>;
  then?: never;
} & PromiseLike<{ data: T[] | null; error: DbError }>;

type SelectBuilder<T> = {
  select: (columns?: string) => FilterBuilder<T>;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
    select: (columns?: string) => {
      maybeSingle: () => MaybeSingle<T>;
      then?: never;
    } & PromiseLike<{ data: T[] | null; error: DbError }>;
  };
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => {
    select: (columns?: string) => {
      maybeSingle: () => MaybeSingle<T>;
    };
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
  };
}

function mapAgentStatus(row: Record<string, unknown>): CallCenterAgentStatus {
  return {
    userId: String(row.user_id),
    status: (row.status as CallCenterAgentStatusValue) || "offline",
    statusSince: String(row.status_since ?? new Date().toISOString()),
    lastCallAt: row.last_call_at ? String(row.last_call_at) : null,
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
  };
}

const SETTINGS_COLUMNS =
  "enabled, ivr_enabled, business_hours_enabled, business_hours_json, timezone, default_queue_id, telnyx_sip_uri, telnyx_connection_id, telnyx_api_key, telnyx_webhook_secret, livekit_sip_trunk_id, livekit_sip_dispatch_rule_id, webhook_shared_secret, notes";

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
}): Promise<CallCenterQueueMember> {
  const payload: Record<string, unknown> = {
    queue_id: input.queueId,
    user_id: input.userId,
    priority: input.priority,
    is_active: input.isActive,
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
  extras?: { lastCallAt?: string | null },
): Promise<CallCenterAgentStatus> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: userId,
    status,
    status_since: now,
    updated_at: now,
  };
  if (extras?.lastCallAt !== undefined) payload.last_call_at = extras.lastCallAt;
  const result = await table<Record<string, unknown>>("call_center_agent_status")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  throwIfError(result.error);
  if (!result.data) throw new Error("Agent status could not be saved.");
  return mapAgentStatus(result.data);
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
    livekitRoom: string;
    hangupReason: string;
    offeredAt: string | null;
    answeredAt: string | null;
    endedAt: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<CallCenterCall> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.agentUserId !== undefined) payload.agent_user_id = patch.agentUserId;
  if (patch.queueId !== undefined) payload.queue_id = patch.queueId;
  if (patch.eventId !== undefined) payload.event_id = patch.eventId;
  if (patch.ivrDigit !== undefined) payload.ivr_digit = patch.ivrDigit;
  if (patch.livekitRoom !== undefined) payload.livekit_room = patch.livekitRoom;
  if (patch.hangupReason !== undefined) payload.hangup_reason = patch.hangupReason;
  if (patch.offeredAt !== undefined) payload.offered_at = patch.offeredAt;
  if (patch.answeredAt !== undefined) payload.answered_at = patch.answeredAt;
  if (patch.endedAt !== undefined) payload.ended_at = patch.endedAt;
  if (patch.metadata !== undefined) payload.metadata = patch.metadata;

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
