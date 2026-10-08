"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { staffDepartmentPlacement, type OrgDepartment } from "@/lib/org-hierarchy";
import { canUserDo, ROLE_LEVELS, type AppRole } from "@/lib/rbac";
import { STAFF_NOT_JOKER_EMPLOYMENT_OR } from "@/lib/staff-status";
import { rosterDisplayName } from "@/lib/chat/display-rules";
import {
  chatDirectoryUsesManagerCrew,
  chatHubListsFullReportingTree,
  companyDirectoryRows,
  hubRosterRows,
  managerCrewDirectoryRows,
} from "@/lib/chat/list-rules";
import { CEO_STAFF_ID } from "@/lib/reporting-chain";
import { deliverChatChannels } from "@/lib/chat/push-delivery";
import { notifyUsers } from "@/lib/notifications/action-notify";
import {
  CHAT_ATTACHMENT_BUCKET,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_RATE_PER_MINUTE,
  CHAT_ATTACHMENT_URL_SECONDS,
  CHAT_THREAD_MESSAGE_TYPES,
  chatAttachmentCaptionIssue,
  chatAttachmentCountAllowed,
  chatAttachmentObjectPath,
  chatMessageTypeForMimes,
  chatPreparedAttachment,
  chatVoiceNoteMessageType,
  type ChatAttachmentIssue,
} from "@/lib/chat/attachment-rules";
import {
  assertChatCanCall,
  assertChatCanPost,
  assertChatMember,
  ChatForbiddenError,
  chatMemberRole,
  writeChatAudit,
} from "@/lib/chat/authorization";
import { CallProviderUnconfiguredError, getCallProvider } from "@/lib/chat/call-provider";
import {
  CHAT_CALL_STARTER_OUTCOME,
  CHAT_CALL_STATUSES,
  callIdSchema,
  chatCallCloseValues,
  chatCallInsertValues,
  chatCallParticipantValues,
  chatCallRoomName,
  chatUserMaySetCallStatus,
  participantOutcomeForResponse,
  respondCallSchema,
  startCallSchema,
  type ChatCallKind,
  type ChatCallStatus,
} from "@/lib/chat/call-rules";
import { chatReminderDateIssue, reminderScheduledFor } from "@/lib/chat/reminder-rules";
import {
  CHAT_ACTION_KINDS,
  CHAT_FACILITY_CATEGORIES,
  CHAT_HANDOVER_SHIFTS,
  CHAT_INCIDENT_SEVERITIES,
  chatActionPrefill,
  type ChatActionKind,
} from "@/lib/chat/action-rules";
import { createDailyOpsIncident, upsertShiftBriefing } from "@/lib/daily-ops.functions";
import { INCIDENT_TYPES } from "@/lib/daily-ops/constants";
import { upsertFacilityTask } from "@/lib/facility.functions";
import { createIssue } from "@/lib/issues.functions";
import { savePurchaseRequisition } from "@/lib/procurement.functions";
import {
  CHAT_ENTITY_RESULT_CAP,
  CHAT_ENTITY_SOURCES,
  chatEntityCardFromRow,
  chatEntityHref,
  chatEntityLikePattern,
  chatEntityMessageBody,
  chatEntityPlain,
  chatEntityPreviewAccess,
  chatEntityShortId,
  searchChatEntitiesSchema,
  shareEntityInChatSchema,
  type ChatEntityCardFields,
  type ChatShareableEntityType,
} from "@/lib/chat/entity-rules";
import {
  CHAT_DIRECTORY_RESULT_CAP,
  addMemberSchema,
  chatCanMarkSensitive,
  chatDirectoryLikeTerm,
  conversationIdSchema,
  createConversationSchema,
  directoryQuerySchema,
  mapChatError,
  memberTargetSchema,
  openDirectSchema,
  setMemberRoleSchema,
  updateConversationSchema,
} from "@/lib/chat/group-rules";
import {
  CHAT_REACTION_RATE_PER_MINUTE,
  CHAT_TEXT_RATE_PER_MINUTE,
  CHAT_UNREAD_CAP,
  addReactionSchema,
  chatKeysetAfterFilter,
  chatKeysetFilter,
  chatKeysetThroughFilter,
  chatReadCursorAdvances,
  announcementRequiresAcknowledgement,
  listMessagesSchema,
  markConversationReadSchema,
  removeReactionSchema,
  sendTextMessageSchema,
  type ChatMessageCursor,
} from "@/lib/chat/message-rules";
import {
  acknowledgeAnnouncementSchema,
  castVoteSchema,
  chatPollVoteBlock,
  createPollSchema,
  pollVoteMessages,
  shapePollResult,
  type ChatPollModel,
} from "@/lib/chat/poll-rules";
import {
  chatMentionTargets,
  chatMentionUserIdsField,
  chatNotificationPreview,
  chatNotificationTitle,
  chatPreferenceFlags,
  resolveChatNotificationLevel,
  setConversationChatNotificationSchema,
  setGlobalChatNotificationSchema,
  shouldNotifyChatRecipient,
  type ChatNotificationLevel,
} from "@/lib/chat/notification-rules";
import {
  CHAT_SEARCH_LIMIT_MAX,
  chatMessageTargetSchema,
  chatSearchDateBound,
  chatSearchIlikeValue,
  chatSearchLikePattern,
  chatSearchMessageTypes,
  chatSearchMimeOrFilter,
  chatSearchMimePrefixes,
  chatSearchSnippet,
  searchChatSchema,
  type ChatSearchFileType,
} from "@/lib/chat/search-rules";
import { createSafeAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { assertLocationAccess, ForbiddenError } from "@/lib/server/authorize";

type DbError = { message: string; details?: string | null; hint?: string | null; code?: string };

type ChatBuilder = {
  select: (columns: string) => ChatBuilder;
  insert: (values: Record<string, unknown>) => ChatBuilder;
  update: (values: Record<string, unknown>) => ChatBuilder;
  eq: (column: string, value: unknown) => ChatBuilder;
  is: (column: string, value: null) => ChatBuilder;
  in: (column: string, values: readonly string[]) => ChatBuilder;
  not: (column: string, operator: string, value: null) => ChatBuilder;
  or: (filters: string) => ChatBuilder;
  order: (column: string, options?: { ascending?: boolean }) => ChatBuilder;
  limit: (count: number) => ChatBuilder;
  range: (from: number, to: number) => ChatBuilder;
  gte: (column: string, value: string) => ChatBuilder;
  lte: (column: string, value: string) => ChatBuilder;
  ilike: (column: string, pattern: string) => ChatBuilder;
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => ChatBuilder;
  delete: () => ChatBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: DbError | null }>;
} & PromiseLike<{ data: unknown; error: DbError | null }>;

function chatFrom(context: AuthContext, table: string): ChatBuilder {
  const supabase = context.supabase as unknown as { from: (name: string) => ChatBuilder };
  return supabase.from(table);
}

function adminFrom(table: string): ChatBuilder {
  const supabase = supabaseAdmin as unknown as { from: (name: string) => ChatBuilder };
  return supabase.from(table);
}

function chatFail(error: unknown): never {
  throw new Error(mapChatError(error));
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is Record<string, unknown> => row != null && typeof row === "object");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readRows(query: ChatBuilder): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) chatFail(error);
  return rowsOf(data);
}

async function audit(
  context: AuthContext,
  eventType: string,
  conversationId: string,
  metadata: Record<string, unknown>,
) {
  try {
    await writeChatAudit(context, { eventType, conversationId, metadata });
  } catch (error) {
    chatFail(error);
  }
}

const CONVERSATION_COLUMNS = [
  "id",
  "kind",
  "title",
  "description",
  "location_id",
  "department_id",
  "sensitive",
  "posting_policy",
  "file_policy",
  "call_policy",
  "retention_policy",
  "retention_until",
  "archive_at",
  "archived_at",
  "updated_at",
].join(", ");

export type ChatConversationSummary = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  locationId: string | null;
  departmentId: string | null;
  sensitive: boolean;
  postingPolicy: string;
  filePolicy: string;
  callPolicy: string;
  retentionPolicy: string;
  retentionUntil: string | null;
  archiveAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  role: string | null;
  /** Conversation row, otherwise the global row, otherwise ALL. */
  notificationLevel: string | null;
  memberCount: number;
  unreadCount: number;
  /** Latest visible message text, or null when the latest row has no text. */
  preview: string | null;
  /** Latest visible message type, used when preview text is empty. */
  previewType: string | null;
  /** True when this member has a stored mention in the conversation. */
  mentioned: boolean;
  /** Other person's name when a direct conversation has no title. */
  peerName: string | null;
  /** Other person's job title on a direct conversation. */
  peerJobTitle: string | null;
  /** Other person's employee code on a direct conversation. */
  peerEmployeeCode: string | null;
  /** Other person's login on a direct conversation. Used to avoid listing them twice. */
  peerUserId: string | null;
};

export type ChatMemberRow = {
  userId: string;
  role: string;
  membershipSource: string;
  staffId: string | null;
  fullName: string | null;
  employeeCode: string | null;
  jobTitle: string | null;
};

export type ChatDirectoryPerson = {
  id: string;
  /** Null when the staff record has no login yet. A chat cannot be opened. */
  userId: string | null;
  /** Readable label: full name, otherwise email or employee code. Empty only when all three are missing. */
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  locationId: string | null;
  email: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentIds: string[];
};

export type ChatDirectoryDepartment = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

export type ChatDirectoryResult = {
  departments: ChatDirectoryDepartment[];
  people: ChatDirectoryPerson[];
};

export type ChatDepartmentOption = {
  id: string;
  name: string;
  code: string | null;
};

function summaryFrom(
  row: Record<string, unknown>,
  role: string | null,
  notificationLevel: string | null,
  memberCount: number,
  unreadCount: number,
  preview: string | null,
  previewType: string | null,
  mentioned: boolean,
): ChatConversationSummary | null {
  const id = text(row.id);
  const kind = text(row.kind);
  const updatedAt = text(row.updated_at);
  if (!id || !kind || !updatedAt) return null;
  return {
    id,
    kind,
    title: text(row.title),
    description: text(row.description),
    locationId: text(row.location_id),
    departmentId: text(row.department_id),
    sensitive: row.sensitive === true,
    postingPolicy: text(row.posting_policy) ?? "MEMBERS",
    filePolicy: text(row.file_policy) ?? "MEMBERS",
    callPolicy: text(row.call_policy) ?? "MEMBERS",
    retentionPolicy: text(row.retention_policy) ?? "FOREVER",
    retentionUntil: text(row.retention_until),
    archiveAt: text(row.archive_at),
    archivedAt: text(row.archived_at),
    updatedAt,
    role,
    notificationLevel,
    memberCount,
    unreadCount,
    preview,
    previewType,
    mentioned,
    peerName: null,
    peerJobTitle: null,
    peerEmployeeCode: null,
    peerUserId: null,
  };
}

async function inChunks(
  ids: string[],
  load: (slice: string[]) => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    out.push(...(await load(ids.slice(index, index + 100))));
  }
  return out;
}

async function poolMap<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index] as T);
    }
  }
  const workers = Math.min(Math.max(limit, 0), items.length);
  if (workers === 0) return results;
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

async function visibleMessageTimes(context: AuthContext, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const times = new Map<string, string>();
  if (unique.length === 0) return times;
  const rows = await inChunks(unique, (slice) =>
    readRows(chatFrom(context, "chat_messages_visible").select("id, created_at").in("id", slice)),
  );
  for (const row of rows) {
    const id = text(row.id);
    const createdAt = text(row.created_at);
    if (id && createdAt) times.set(id, createdAt);
  }
  return times;
}

async function latestVisibleText(context: AuthContext, conversationId: string): Promise<ChatMessageCursor | null> {
  const rows = await readRows(
    chatFrom(context, "chat_messages_visible")
      .select("id, created_at")
      .eq("conversation_id", conversationId)
      .in("type", [...CHAT_THREAD_MESSAGE_TYPES])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  );
  const id = text(rows[0]?.id);
  const createdAt = text(rows[0]?.created_at);
  if (!id || !createdAt) return null;
  return { id, createdAt };
}

async function countTextAfter(
  context: AuthContext,
  conversationId: string,
  cursor: ChatMessageCursor | null,
): Promise<number> {
  let query = chatFrom(context, "chat_messages_visible")
    .select("id")
    .eq("conversation_id", conversationId)
    .in("type", [...CHAT_THREAD_MESSAGE_TYPES]);
  if (cursor) {
    try {
      query = query.or(chatKeysetAfterFilter(cursor));
    } catch {
      return 1;
    }
  }
  const rows = await readRows(query.limit(CHAT_UNREAD_CAP + 1));
  return rows.length;
}

/** Head of each conversation plus the caller's cursor. Does not load history. */
async function unreadCounts(context: AuthContext, conversationIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (conversationIds.length === 0) return counts;

  const [states, latests] = await Promise.all([
    inChunks(conversationIds, (slice) =>
      readRows(
        chatFrom(context, "chat_read_states")
          .select("conversation_id, last_read_message_id")
          .eq("user_id", context.userId)
          .in("conversation_id", slice),
      ),
    ),
    poolMap(conversationIds, 6, (id) => latestVisibleText(context, id)),
  ]);

  const readIds = new Map<string, string>();
  for (const row of states) {
    const conversationId = text(row.conversation_id);
    const messageId = text(row.last_read_message_id);
    if (conversationId && messageId) readIds.set(conversationId, messageId);
  }
  const times = await visibleMessageTimes(context, [...readIds.values()]);
  const pending: Array<{ conversationId: string; cursor: ChatMessageCursor | null }> = [];

  conversationIds.forEach((conversationId, index) => {
    const latest = latests[index];
    if (!latest) {
      counts.set(conversationId, 0);
      return;
    }
    const readId = readIds.get(conversationId);
    const readAt = readId ? times.get(readId) : undefined;
    const cursor = readId && readAt ? { id: readId, createdAt: readAt } : null;
    if (cursor && !chatReadCursorAdvances(cursor, latest)) {
      counts.set(conversationId, 0);
      return;
    }
    pending.push({ conversationId, cursor });
  });

  const counted = await poolMap(pending, 6, (item) => countTextAfter(context, item.conversationId, item.cursor));
  pending.forEach((item, index) => counts.set(item.conversationId, counted[index] ?? 0));
  return counts;
}

/** One visible snippet per conversation. Uses the same view as the thread. */
async function latestPreviews(
  context: AuthContext,
  conversationIds: string[],
): Promise<Map<string, { text: string | null; type: string | null }>> {
  const found = new Map<string, { text: string | null; type: string | null }>();
  if (conversationIds.length === 0) return found;
  const rows = await poolMap(conversationIds, 6, async (conversationId) => {
    const page = await readRows(
      chatFrom(context, "chat_messages_visible")
        .select("type, body")
        .eq("conversation_id", conversationId)
        .in("type", [...CHAT_THREAD_MESSAGE_TYPES])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
    );
    return {
      conversationId,
      type: text(page[0]?.type),
      text: plainSnippet(page[0]?.body),
    };
  });
  for (const row of rows) {
    if (!row?.type && !row?.text) continue;
    found.set(row.conversationId, { text: row.text, type: row.type });
  }
  return found;
}

/** Conversations where this member is the mentioned user. RLS still applies. */
async function mentionedConversationIds(context: AuthContext, conversationIds: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  if (conversationIds.length === 0) return ids;
  const rows = await inChunks(conversationIds, (slice) =>
    readRows(
      chatFrom(context, "chat_mentions")
        .select("conversation_id")
        .eq("mentioned_user_id", context.userId)
        .in("conversation_id", slice),
    ),
  );
  for (const row of rows) {
    const id = text(row.conversation_id);
    if (id) ids.add(id);
  }
  return ids;
}

export const listMyConversations = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const conversations = await readRows(
      chatFrom(context, "chat_conversations")
        .select(CONVERSATION_COLUMNS)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
    );
    const ids = conversations.map((row) => text(row.id)).filter((id): id is string => id != null);
    if (ids.length === 0) return [] as ChatConversationSummary[];

    const [mine, members, prefs, globalLevel] = await Promise.all([
      inChunks(ids, (slice) =>
        readRows(
          chatFrom(context, "chat_members")
            .select("conversation_id, role")
            .eq("user_id", context.userId)
            .is("left_at", null)
            .in("conversation_id", slice),
        ),
      ),
      inChunks(ids, (slice) =>
        readRows(
          chatFrom(context, "chat_members")
            .select("conversation_id")
            .is("left_at", null)
            .in("conversation_id", slice),
        ),
      ),
      inChunks(ids, (slice) =>
        readRows(
          chatFrom(context, "chat_notification_preferences")
            .select("conversation_id, level")
            .eq("user_id", context.userId)
            .in("conversation_id", slice),
        ),
      ),
      readOwnGlobalNotificationLevel(context),
    ]);

    const roles = new Map<string, string>();
    for (const row of mine) {
      const id = text(row.conversation_id);
      const role = text(row.role);
      if (id && role) roles.set(id, role);
    }
    const counts = new Map<string, number>();
    for (const row of members) {
      const id = text(row.conversation_id);
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const levels = new Map<string, string>();
    for (const row of prefs) {
      const id = text(row.conversation_id);
      const level = text(row.level);
      if (id && level) levels.set(id, level);
    }

    const [unread, previews, mentioned] = await Promise.all([
      unreadCounts(context, ids),
      latestPreviews(context, ids),
      mentionedConversationIds(context, ids),
    ]);

    const summaries = conversations
      .map((row) => {
        const id = text(row.id);
        if (!id) return null;
        const preview = previews.get(id);
        return summaryFrom(
          row,
          roles.get(id) ?? null,
          resolveChatNotificationLevel(levels.get(id) ?? null, globalLevel),
          counts.get(id) ?? 0,
          unread.get(id) ?? 0,
          preview?.text ?? null,
          preview?.type ?? null,
          mentioned.has(id),
        );
      })
      .filter((row): row is ChatConversationSummary => row != null);

    const directIds = summaries.filter((row) => row.kind === "DIRECT").map((row) => row.id);
    const peers = await directPeers(context, directIds);
    return summaries.map((row) => {
      const peer = peers.get(row.id);
      if (!peer) return row;
      return {
        ...row,
        peerUserId: peer.userId,
        peerName: peer.name,
        peerJobTitle: peer.jobTitle,
        peerEmployeeCode: peer.employeeCode,
      };
    });
  },
  { defaultInput: {}, auth: { capability: "chat.view" } },
);

export type ChatGlobalNotificationSettings = {
  level: ChatNotificationLevel;
  notifyCalls: boolean;
  notifyAnnouncements: boolean;
};

function booleanFlag(value: unknown, fallback: boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

async function readOwnPreferenceRow(
  context: AuthContext,
  conversationId: string | null,
): Promise<Record<string, unknown> | null> {
  let query = chatFrom(context, "chat_notification_preferences")
    .select("id, level, notify_calls, notify_announcements")
    .eq("user_id", context.userId);
  query = conversationId ? query.eq("conversation_id", conversationId) : query.is("conversation_id", null);
  const result = await query.limit(1).maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return result.data as Record<string, unknown>;
}

async function readOwnGlobalNotificationLevel(context: AuthContext): Promise<string | null> {
  const row = await readOwnPreferenceRow(context, null);
  return text(row?.level);
}

async function saveOwnPreference(
  context: AuthContext,
  input: {
    conversationId: string | null;
    level: ChatNotificationLevel;
    notifyCalls?: boolean;
    notifyAnnouncements?: boolean;
  },
): Promise<void> {
  const flags = chatPreferenceFlags(input.level);
  const existing = await readOwnPreferenceRow(context, input.conversationId);
  const patch = {
    level: input.level,
    notify_messages: flags.notifyMessages,
    notify_mentions: flags.notifyMentions,
    notify_calls: input.notifyCalls ?? booleanFlag(existing?.notify_calls, true),
    notify_announcements: input.notifyAnnouncements ?? booleanFlag(existing?.notify_announcements, true),
  };
  const existingId = text(existing?.id);
  if (existingId) {
    const updated = await chatFrom(context, "chat_notification_preferences")
      .update(patch)
      .eq("id", existingId)
      .select("id");
    if (updated.error) chatFail(updated.error);
    return;
  }
  const inserted = await chatFrom(context, "chat_notification_preferences")
    .insert({
      user_id: context.userId,
      conversation_id: input.conversationId,
      ...patch,
    })
    .select("id");
  if (!inserted.error) return;
  if (!isUniqueViolation(inserted.error)) chatFail(inserted.error);
  const again = await readOwnPreferenceRow(context, input.conversationId);
  const againId = text(again?.id);
  if (!againId) chatFail(inserted.error);
  const updated = await chatFrom(context, "chat_notification_preferences").update(patch).eq("id", againId).select("id");
  if (updated.error) chatFail(updated.error);
}

export const getGlobalChatNotification = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context): Promise<ChatGlobalNotificationSettings> => {
    const row = await readOwnPreferenceRow(context, null);
    return {
      level: resolveChatNotificationLevel(null, text(row?.level)),
      notifyCalls: booleanFlag(row?.notify_calls, true),
      notifyAnnouncements: booleanFlag(row?.notify_announcements, true),
    };
  },
  { defaultInput: {}, auth: { capability: "chat.view" } },
);

export const setConversationChatNotification = createSafeAuthenticatedAction(
  setConversationChatNotificationSchema,
  async (data, context) => {
    await assertChatMember(context, data.conversationId);
    await saveOwnPreference(context, { conversationId: data.conversationId, level: data.level });
    return { conversationId: data.conversationId, level: data.level };
  },
  { auth: { capability: "chat.view" } },
);

export const setGlobalChatNotification = createSafeAuthenticatedAction(
  setGlobalChatNotificationSchema,
  async (data, context) => {
    await saveOwnPreference(context, {
      conversationId: null,
      level: data.level,
      notifyCalls: data.notifyCalls,
      notifyAnnouncements: data.notifyAnnouncements,
    });
    return {
      level: data.level,
      notifyCalls: data.notifyCalls,
      notifyAnnouncements: data.notifyAnnouncements,
    };
  },
  { auth: { capability: "chat.view" } },
);

export const listConversationMembers = createSafeAuthenticatedAction(
  conversationIdSchema,
  async (data, context) => {
    const members = await readRows(
      chatFrom(context, "chat_members")
        .select("user_id, role, membership_source, staff_id")
        .eq("conversation_id", data.conversationId)
        .is("left_at", null),
    );
    const staffIds = members.map((row) => text(row.staff_id)).filter((id): id is string => id != null);
    const userIds = members.map((row) => text(row.user_id)).filter((id): id is string => id != null);
    const staffRows = await readMemberStaffRows(staffIds, userIds);
    const staffById = new Map(
      staffRows.flatMap((row) => {
        const id = text(row.id);
        return id ? [[id, row] as const] : [];
      }),
    );
    const staffByUser = indexStaffByUser(staffRows);
    const order = ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"];
    return members
      .map((row) => {
        const userId = text(row.user_id);
        const role = text(row.role);
        const membershipSource = text(row.membership_source);
        if (!userId || !role || !membershipSource) return null;
        const staffId = text(row.staff_id);
        const staff = (staffId ? staffById.get(staffId) : undefined) ?? staffByUser.get(userId);
        const mapped: ChatMemberRow = {
          userId,
          role,
          membershipSource,
          staffId: text(row.staff_id),
          fullName:
            rosterDisplayName(directoryDisplayName(text(staff?.full_name), text(staff?.email), text(staff?.employee_code))) ||
            null,
          employeeCode: text(staff?.employee_code),
          jobTitle: text(staff?.job_title),
        };
        return mapped;
      })
      .filter((row): row is ChatMemberRow => row != null)
      .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || (a.fullName ?? "").localeCompare(b.fullName ?? ""));
  },
  { auth: { capability: "chat.view" } },
);

/** Same gate as the organization chart: admin.view and role level 95 or higher (CEO, COO). */
function chatDirectorySeesEveryone(roles: AppRole[] | undefined): boolean {
  if (!roles?.length || !canUserDo(roles, "admin.view")) return false;
  return roles.some((role) => (ROLE_LEVELS[role] ?? 0) >= 95);
}

function directoryDisplayName(fullName: string | null, email: string | null, employeeCode: string | null): string {
  return fullName?.trim() || email?.trim() || employeeCode?.trim() || "";
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((row): row is Record<string, unknown> => row != null && typeof row === "object");
}

const DIRECTORY_STAFF_SELECT =
  "id, user_id, full_name, email, employee_code, job_title, location_id, department, status, employment_type, staff_departments(department_id, master_departments(id, name, sort_order))";

async function readDirectoryPages(
  load: (from: number, to: number) => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const size = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += size) {
    const page = await load(from, from + size - 1);
    rows.push(...page);
    if (page.length < size) break;
  }
  return rows;
}

async function loadDirectoryDepartments(context: AuthContext): Promise<OrgDepartment[]> {
  const rows = await readRows(
    chatFrom(context, "master_departments")
      .select("id, name, parent_id, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  );
  return rows.flatMap((row) => {
    const id = text(row.id);
    const name = text(row.name)?.trim();
    if (!id || !name) return [];
    const department: OrgDepartment = {
      id,
      name,
      parentId: text(row.parent_id),
      sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    };
    return [department];
  });
}

function directoryLinks(row: Record<string, unknown>): { id: string; name: string; sortOrder: number }[] {
  return asRecordList(row.staff_departments)
    .map((link) => {
      const embedded = asRecordList(link.master_departments)[0];
      const id = text(embedded?.id) ?? text(link.department_id);
      const name = text(embedded?.name)?.trim() || null;
      if (!id || !name) return null;
      const sortOrder = typeof embedded?.sort_order === "number" ? embedded.sort_order : 0;
      return { id, name, sortOrder };
    })
    .filter((link): link is { id: string; name: string; sortOrder: number } => Boolean(link))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function mapDirectoryPeople(
  rows: Record<string, unknown>[],
  departments: readonly OrgDepartment[],
  callerId: string,
  options?: { allowMissingLogin?: boolean },
): ChatDirectoryPerson[] {
  const allowMissingLogin = options?.allowMissingLogin === true;
  const seen = new Set<string>();
  const people: ChatDirectoryPerson[] = [];
  for (const row of rows) {
    const id = text(row.id);
    const userId = text(row.user_id);
    if (!id) continue;
    if (!userId && !allowMissingLogin) continue;
    if (userId && (userId === callerId || seen.has(userId))) continue;
    if (userId) seen.add(userId);
    const employeeCode = text(row.employee_code);
    const email = text(row.email);
    const placed = staffDepartmentPlacement(departments, directoryLinks(row), text(row.department));
    people.push({
      id,
      userId,
      fullName: directoryDisplayName(text(row.full_name), email, employeeCode),
      employeeCode,
      jobTitle: text(row.job_title),
      locationId: text(row.location_id),
      email,
      departmentId: placed.departmentId,
      departmentName: placed.departmentName,
      departmentIds: placed.departmentIds,
    });
  }
  people.sort((a, b) => a.fullName.localeCompare(b.fullName) || (a.employeeCode ?? "").localeCompare(b.employeeCode ?? ""));
  return people;
}

async function loadReportingManagerIds(): Promise<Map<string, string | null>> {
  const rows = await readDirectoryPages((from, to) =>
    readRows(
      adminFrom("staff_profile_ext")
        .select("staff_id, reporting_manager_staff_id")
        .order("staff_id")
        .range(from, to),
    ),
  );
  const managers = new Map<string, string | null>();
  for (const row of rows) {
    const staffId = text(row.staff_id);
    if (staffId) managers.set(staffId, text(row.reporting_manager_staff_id));
  }
  return managers;
}

async function loadManagerCrewDirectory(userId: string): Promise<Record<string, unknown>[] | null> {
  try {
    return await loadManagerCrewDirectoryRows(userId);
  } catch (error) {
    console.warn("[chat] manager crew directory skipped", error instanceof Error ? error.message : error);
    return null;
  }
}

async function loadManagerCrewDirectoryRows(userId: string): Promise<Record<string, unknown>[] | null> {
  const viewerRows = await readRows(
    adminFrom("staff").select("id").eq("user_id", userId).is("deleted_at", null).order("id").limit(1),
  );
  const viewerStaffId = text(viewerRows[0]?.id);
  if (!viewerStaffId) return null;
  const managerRows = await readRows(
    adminFrom("staff_profile_ext")
      .select("reporting_manager_staff_id")
      .eq("staff_id", viewerStaffId)
      .limit(1),
  );
  const managerStaffId = text(managerRows[0]?.reporting_manager_staff_id);
  const reportRows = await readRows(
    adminFrom("staff_profile_ext").select("staff_id").eq("reporting_manager_staff_id", viewerStaffId).limit(1),
  );
  if (
    !chatDirectoryUsesManagerCrew({
      listsFullTree: false,
      seesEveryone: false,
      hasDirectReports: reportRows.length > 0,
      managerStaffId,
    })
  ) {
    return null;
  }
  const crewIds = (
    await readDirectoryPages((from, to) =>
      readRows(
        adminFrom("staff_profile_ext")
          .select("staff_id")
          .eq("reporting_manager_staff_id", managerStaffId)
          .order("staff_id")
          .range(from, to),
      ),
    )
  )
    .map((row) => text(row.staff_id))
    .filter((id): id is string => Boolean(id && id !== viewerStaffId));
  const directoryIds = [...new Set([...crewIds, managerStaffId].filter((id): id is string => Boolean(id)))];
  const staffRows = await inChunks(directoryIds, (slice) =>
    readRows(
      adminFrom("staff")
        .select(DIRECTORY_STAFF_SELECT)
        .in("id", slice)
        .is("deleted_at", null)
        .not("user_id", "is", null),
    ),
  );
  const sources = staffRows.flatMap((row) => {
    const staffId = text(row.id);
    if (!staffId) return [];
    return [
      {
        staffId,
        status: text(row.status),
        userId: text(row.user_id),
        reportingManagerStaffId: staffId === managerStaffId ? null : managerStaffId,
        employmentType: text(row.employment_type),
        source: row,
      },
    ];
  });
  return managerCrewDirectoryRows({ rows: sources, viewerStaffId, managerStaffId }).map((row) => row.source);
}

/**
 * People shown in the chat directory.
 * A CEO (admin access, role level 100) receives every still-employed person
 * on their reporting line, including people with no login.
 * CEO and COO otherwise receive still-employed staff who have a login.
 * An employee with no direct reports receives teammates who share their reporting manager, and that manager.
 * A reporting manager keeps the staff rows their existing access already allows.
 * An empty query returns that full set. A 2+ character query filters it and keeps the result cap.
 */
export const listDirectory = createSafeAuthenticatedAction(
  directoryQuerySchema,
  async (data, context) => {
    const departments = await loadDirectoryDepartments(context);
    const canViewAdmin = canUserDo(context.roles ?? [], "admin.view");
    const listsTree = (context.roles ?? []).some((role) =>
      chatHubListsFullReportingTree(ROLE_LEVELS[role] ?? 0, canViewAdmin),
    );
    const seesEveryone = chatDirectorySeesEveryone(context.roles);
    const rows = await readDirectoryPages((from, to) => {
      if (listsTree || seesEveryone) {
        let query = adminFrom("staff")
          .select(DIRECTORY_STAFF_SELECT)
          .or(STAFF_NOT_JOKER_EMPLOYMENT_OR)
          .is("deleted_at", null)
          .order("id");
        if (!listsTree) query = query.not("user_id", "is", null);
        return readRows(query.range(from, to));
      }
      return readRows(
        chatFrom(context, "staff")
          .select(DIRECTORY_STAFF_SELECT)
          .is("deleted_at", null)
          .not("user_id", "is", null)
          .order("id")
          .range(from, to),
      );
    });
    let directoryRows = rows;
    let allowMissingLogin = false;
    if (listsTree) {
      const managers = await loadReportingManagerIds();
      const sources = rows.flatMap((row) => {
        const staffId = text(row.id);
        if (!staffId) return [];
        return [
          {
            staffId,
            status: text(row.status),
            userId: text(row.user_id),
            reportingManagerStaffId: managers.get(staffId) ?? null,
            employmentType: text(row.employment_type),
            source: row,
          },
        ];
      });
      const linked = sources.find((row) => row.userId === context.userId)?.staffId ?? null;
      const rootStaffId = linked ?? ((context.roles ?? []).includes("ceo") ? CEO_STAFF_ID : null);
      directoryRows = hubRosterRows({ rows: sources, rootStaffId, listFullTree: true }).map((row) => row.source);
      allowMissingLogin = true;
    } else if (seesEveryone) {
      directoryRows = companyDirectoryRows(rows.map((row) => ({ ...row, status: text(row.status) })));
    } else {
      const crew = await loadManagerCrewDirectory(context.userId);
      if (crew) directoryRows = crew;
    }
    let people = mapDirectoryPeople(directoryRows, departments, context.userId, { allowMissingLogin });
    const term = chatDirectoryLikeTerm(data.query ?? "");
    if (term) {
      const needle = term.toLowerCase();
      people = people
        .filter((person) =>
          [person.fullName, person.employeeCode, person.email, person.jobTitle, person.departmentName].some((value) =>
            value?.toLowerCase().includes(needle),
          ),
        )
        .slice(0, CHAT_DIRECTORY_RESULT_CAP);
    }
    const result: ChatDirectoryResult = {
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        sortOrder: department.sortOrder,
      })),
      people,
    };
    return result;
  },
  { auth: { capability: "chat.send" } },
);

const MEMBER_STAFF_COLUMNS = "id, user_id, full_name, email, employee_code, job_title, created_at";

/**
 * Staff labels for people already on a conversation this login can see.
 * The staff select policy only includes sites on the login, so a direct
 * chat with a reporting manager or one of their reports can exist while
 * that staff row stays hidden. Membership is the gate; the name is not.
 */
async function readMemberStaffRows(staffIds: string[], userIds: string[]): Promise<Record<string, unknown>[]> {
  const ids = [...new Set(staffIds)];
  const users = [...new Set(userIds)];
  try {
    const [byId, byUser] = await Promise.all([
      ids.length
        ? inChunks(ids, (slice) =>
            readRows(adminFrom("staff").select(MEMBER_STAFF_COLUMNS).in("id", slice).is("deleted_at", null)),
          )
        : Promise.resolve([] as Record<string, unknown>[]),
      users.length
        ? inChunks(users, (slice) =>
            readRows(adminFrom("staff").select(MEMBER_STAFF_COLUMNS).in("user_id", slice).is("deleted_at", null)),
          )
        : Promise.resolve([] as Record<string, unknown>[]),
    ]);
    return [...byId, ...byUser];
  } catch (error) {
    console.warn("[chat] member names unavailable", error instanceof Error ? error.message : error);
    return [];
  }
}

function preferNewerStaff(next: Record<string, unknown>, current: Record<string, unknown>): boolean {
  const nextAt = text(next.created_at) ?? "";
  const currentAt = text(current.created_at) ?? "";
  if (nextAt !== currentAt) return nextAt > currentAt;
  return (text(next.id) ?? "") > (text(current.id) ?? "");
}

function indexStaffByUser(rows: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const byUser = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const userId = text(row.user_id);
    if (!userId) continue;
    const current = byUser.get(userId);
    if (!current || preferNewerStaff(row, current)) byUser.set(userId, row);
  }
  return byUser;
}

function staffPeerLabel(row: Record<string, unknown> | undefined): {
  name: string | null;
  jobTitle: string | null;
  employeeCode: string | null;
} {
  const employeeCode = text(row?.employee_code);
  const name = rosterDisplayName(directoryDisplayName(text(row?.full_name), text(row?.email), employeeCode));
  return {
    name: name || null,
    jobTitle: text(row?.job_title),
    employeeCode,
  };
}

async function directPeers(
  context: AuthContext,
  conversationIds: string[],
): Promise<Map<string, { userId: string; name: string | null; jobTitle: string | null; employeeCode: string | null }>> {
  const peers = new Map<string, { userId: string; name: string | null; jobTitle: string | null; employeeCode: string | null }>();
  if (conversationIds.length === 0) return peers;
  const members = await inChunks(conversationIds, (slice) =>
    readRows(
      chatFrom(context, "chat_members")
        .select("conversation_id, user_id, staff_id")
        .is("left_at", null)
        .in("conversation_id", slice),
    ),
  );
  const others = members.filter((row) => {
    const userId = text(row.user_id);
    return Boolean(userId && userId !== context.userId && text(row.conversation_id));
  });
  const staffIds = others.map((row) => text(row.staff_id)).filter((id): id is string => id != null);
  const userIds = others.map((row) => text(row.user_id)).filter((id): id is string => id != null);
  const staffRows = await readMemberStaffRows(staffIds, userIds);
  const byStaff = new Map(
    staffRows.flatMap((row) => {
      const id = text(row.id);
      return id ? [[id, row] as const] : [];
    }),
  );
  const byUser = indexStaffByUser(staffRows);
  for (const row of others) {
    const conversationId = text(row.conversation_id);
    const userId = text(row.user_id);
    if (!conversationId || !userId || peers.has(conversationId)) continue;
    const staffId = text(row.staff_id);
    const staff = (staffId ? byStaff.get(staffId) : undefined) ?? byUser.get(userId);
    peers.set(conversationId, { userId, ...staffPeerLabel(staff) });
  }
  return peers;
}

export const listChatDepartments = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const rows = await readRows(
      chatFrom(context, "master_departments")
        .select("id, name, code")
        .eq("active", true)
        .order("name", { ascending: true }),
    );
    return rows
      .map((row) => {
        const id = text(row.id);
        const name = text(row.name);
        if (!id || !name) return null;
        const option: ChatDepartmentOption = { id, name, code: text(row.code) };
        return option;
      })
      .filter((row): row is ChatDepartmentOption => row != null);
  },
  { defaultInput: {}, auth: { capability: "chat.create_group" } },
);

async function callCreateRpc(context: AuthContext, fn: string, args: Record<string, unknown>): Promise<string> {
  const supabase = context.supabase as unknown as {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: DbError | null }>;
  };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) chatFail(error);
  if (typeof data !== "string" || !z.string().uuid().safeParse(data).success) {
    throw new Error("Chat request failed.");
  }
  return data;
}

export const createConversation = createSafeAuthenticatedAction(
  createConversationSchema,
  async (data, context) => {
    if (data.sensitive && !chatCanMarkSensitive(context.roles ?? [])) {
      throw new ForbiddenError("Only HR, CEO, or COO can mark a conversation sensitive.");
    }
    const id = await callCreateRpc(context, "chat_create_conversation", {
      _title: data.title,
      _description: data.description ?? null,
      _kind: data.kind,
      _location_id: data.locationId ?? null,
      _department_id: data.departmentId ?? null,
      _sensitive: data.sensitive === true,
      _posting_policy: data.postingPolicy ?? "MEMBERS",
      _file_policy: data.filePolicy ?? "MEMBERS",
      _call_policy: data.callPolicy ?? "MEMBERS",
      _retention_policy: data.retentionPolicy ?? "FOREVER",
      _retention_until: data.retentionPolicy === "CUSTOM" ? (data.retentionUntil ?? null) : null,
      _archive_at: data.archiveAt ?? null,
    });
    return { id };
  },
  { auth: { capability: "chat.create_group" } },
);

export const openDirect = createSafeAuthenticatedAction(
  openDirectSchema,
  async (data, context) => {
    if (data.otherUserId === context.userId) {
      throw new Error("You cannot start a direct conversation with yourself.");
    }
    const id = await callCreateRpc(context, "chat_open_direct", { _other_user_id: data.otherUserId });
    return { id };
  },
  { auth: { capability: "chat.send" } },
);

export const updateConversation = createSafeAuthenticatedAction(
  updateConversationSchema,
  async (data, context) => {
    if (data.sensitive === true && !chatCanMarkSensitive(context.roles ?? [])) {
      throw new ForbiddenError("Only HR, CEO, or COO can mark a conversation sensitive.");
    }
    const currentRows = await readRows(
      chatFrom(context, "chat_conversations")
        .select("id, archived_at")
        .eq("id", data.conversationId)
        .limit(1),
    );
    const current = currentRows[0];
    if (!current) throw new Error("You do not have access to do that.");

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description?.trim() ? data.description.trim() : null;
    if (data.postingPolicy !== undefined) patch.posting_policy = data.postingPolicy;
    if (data.filePolicy !== undefined) patch.file_policy = data.filePolicy;
    if (data.callPolicy !== undefined) patch.call_policy = data.callPolicy;
    if (data.retentionPolicy !== undefined) {
      patch.retention_policy = data.retentionPolicy;
      patch.retention_until = data.retentionPolicy === "CUSTOM" ? (data.retentionUntil ?? null) : null;
    }
    if (data.archiveAt !== undefined) patch.archive_at = data.archiveAt;
    if (data.archivedAt !== undefined) patch.archived_at = data.archivedAt;
    if (data.sensitive !== undefined) patch.sensitive = data.sensitive;

    const updated = await readRows(
      chatFrom(context, "chat_conversations").update(patch).eq("id", data.conversationId).select("id"),
    );
    if (updated.length === 0) throw new Error("You do not have access to do that.");

    const changed = Object.keys(patch).filter((key) => key !== "archived_at");
    if (changed.length > 0) {
      await audit(context, "conversation.updated", data.conversationId, { fields: changed });
    }
    const wasArchived = text(current.archived_at) != null;
    if (data.archivedAt && !wasArchived) {
      await audit(context, "conversation.archived", data.conversationId, { archived_at: data.archivedAt });
    }
    return { id: data.conversationId };
  },
  { auth: { capability: "chat.manage_members" } },
);

async function visibleStaffId(context: AuthContext, userId: string): Promise<string | null> {
  const rows = await readRows(
    chatFrom(context, "staff")
      .select("id, user_id, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  const row = rows[0];
  if (!row || text(row.user_id) !== userId) return null;
  return text(row.id);
}

export const addMember = createSafeAuthenticatedAction(
  addMemberSchema,
  async (data, context) => {
    const role = data.role ?? "MEMBER";
    const staffId = await visibleStaffId(context, data.userId);
    if (!staffId) throw new Error("That person is not available.");

    const existingResult = await chatFrom(context, "chat_members")
      .select("user_id, role, membership_source, left_at")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existingResult.error) chatFail(existingResult.error);
    const existing =
      existingResult.data && typeof existingResult.data === "object"
        ? (existingResult.data as Record<string, unknown>)
        : null;

    if (existing && text(existing.left_at) == null) {
      throw new Error("That person is already a member.");
    }
    const source = text(existing?.membership_source);
    if (source === "DEPARTMENT" || source === "SITE") {
      throw new Error("Department and site memberships cannot be removed here.");
    }

    if (existing) {
      const updated = await readRows(
        chatFrom(context, "chat_members")
          .update({ left_at: null, role })
          .eq("conversation_id", data.conversationId)
          .eq("user_id", data.userId)
          .select("user_id"),
      );
      if (updated.length === 0) throw new Error("You do not have access to do that.");
    } else {
      const inserted = await readRows(
        chatFrom(context, "chat_members")
          .insert({
            conversation_id: data.conversationId,
            user_id: data.userId,
            staff_id: staffId,
            role,
            membership_source: "MANUAL",
            added_by: context.userId,
          })
          .select("user_id"),
      );
      if (inserted.length === 0) throw new Error("You do not have access to do that.");
    }

    await audit(context, "member.added", data.conversationId, {
      user_id: data.userId,
      role,
      membership_source: "MANUAL",
    });
    return { conversationId: data.conversationId };
  },
  { auth: { capability: "chat.manage_members" } },
);

export const removeMember = createSafeAuthenticatedAction(
  memberTargetSchema,
  async (data, context) => {
    const existingResult = await chatFrom(context, "chat_members")
      .select("membership_source, role, left_at")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existingResult.error) chatFail(existingResult.error);
    const existing =
      existingResult.data && typeof existingResult.data === "object"
        ? (existingResult.data as Record<string, unknown>)
        : null;
    if (!existing || text(existing.left_at) != null) {
      throw new Error("That member is not in this conversation.");
    }
    if (text(existing.role) === "OWNER") {
      throw new Error("The last owner cannot leave. Ownership transfer is not available yet.");
    }
    const source = text(existing.membership_source);
    if (source === "DEPARTMENT" || source === "SITE") {
      throw new Error("Department and site memberships cannot be removed here.");
    }

    const updated = await readRows(
      chatFrom(context, "chat_members")
        .update({ left_at: new Date().toISOString() })
        .eq("conversation_id", data.conversationId)
        .eq("user_id", data.userId)
        .is("left_at", null)
        .select("user_id"),
    );
    if (updated.length === 0) throw new Error("You do not have access to do that.");
    await audit(context, "member.removed", data.conversationId, { user_id: data.userId });
    return { conversationId: data.conversationId };
  },
  { auth: { capability: "chat.manage_members" } },
);

export const leaveConversation = createSafeAuthenticatedAction(
  conversationIdSchema,
  async (data, context) => {
    const existingResult = await chatFrom(context, "chat_members")
      .select("role, membership_source, left_at")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existingResult.error) chatFail(existingResult.error);
    const existing =
      existingResult.data && typeof existingResult.data === "object"
        ? (existingResult.data as Record<string, unknown>)
        : null;
    if (!existing || text(existing.left_at) != null) {
      throw new Error("You do not have access to do that.");
    }
    if (text(existing.role) === "OWNER") {
      throw new Error("The last owner cannot leave. Ownership transfer is not available yet.");
    }
    const source = text(existing.membership_source);
    if (source === "DEPARTMENT" || source === "SITE") {
      throw new Error("Department and site memberships cannot be removed here.");
    }
    // Audit while the caller is still an active member. chat_write_audit
    // rejects a former member who did not create the room.
    await audit(context, "conversation.left", data.conversationId, {});
    const updated = await readRows(
      chatFrom(context, "chat_members")
        .update({ left_at: new Date().toISOString() })
        .eq("conversation_id", data.conversationId)
        .eq("user_id", context.userId)
        .is("left_at", null)
        .select("user_id"),
    );
    if (updated.length === 0) throw new Error("You do not have access to do that.");
    return { conversationId: data.conversationId };
  },
  { auth: { capability: "chat.view" } },
);

export const setMemberRole = createSafeAuthenticatedAction(
  setMemberRoleSchema,
  async (data, context) => {
    const updated = await readRows(
      chatFrom(context, "chat_members")
        .update({ role: data.role })
        .eq("conversation_id", data.conversationId)
        .eq("user_id", data.userId)
        .is("left_at", null)
        .select("user_id"),
    );
    if (updated.length === 0) throw new Error("You do not have access to do that.");
    await audit(context, "member.role_changed", data.conversationId, {
      user_id: data.userId,
      role: data.role,
    });
    return { conversationId: data.conversationId };
  },
  { auth: { capability: "chat.manage_members" } },
);

const VISIBLE_MESSAGE_COLUMNS = [
  "id",
  "conversation_id",
  "sender_id",
  "client_message_id",
  "type",
  "body",
  "metadata",
  "reply_to_message_id",
  "created_at",
  "deleted_at",
  "content_hidden",
].join(", ");

export type ChatReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type ChatReplySnippet = {
  id: string;
  senderId: string;
  body: string | null;
  contentHidden: boolean;
  file: boolean;
};

export type ChatAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: string;
  url: string | null;
};

export type ChatSharedEntity = {
  entityType: string;
  entityId: string;
  access: boolean;
  code: string | null;
  title: string | null;
  jobTitle: string | null;
  locationName: string | null;
  status: string | null;
  priority: string | null;
  href: string | null;
};

export type ChatEntitySearchHit = ChatSharedEntity & { access: true };

export type ChatTextMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string | null;
  type: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  contentHidden: boolean;
  replyToMessageId: string | null;
  reply: ChatReplySnippet | null;
  reactions: ChatReactionGroup[];
  attachments: ChatAttachment[];
  entity: ChatSharedEntity | null;
  requireAcknowledgement: boolean;
  acknowledged: boolean;
  acknowledgementCount: number;
  poll: ChatPollModel | null;
};

export type { ChatMessageCursor };

export type ChatMessagePage = {
  messages: ChatTextMessage[];
  nextCursor: ChatMessageCursor | null;
};

export type ChatReadCursorResult = {
  conversationId: string;
  lastReadMessageId: string;
  advanced: boolean;
};

export type ChatReceiptCursor = {
  userId: string;
  lastReadMessageId: string | null;
  createdAt: string | null;
};

export type ChatConversationReceipt = {
  self: ChatReceiptCursor | null;
  peer: ChatReceiptCursor | null;
};

function messageFrom(row: Record<string, unknown>): ChatTextMessage | null {
  const id = text(row.id);
  const conversationId = text(row.conversation_id);
  const senderId = text(row.sender_id);
  const typeName = text(row.type);
  const createdAt = text(row.created_at);
  if (!id || !conversationId || !senderId || !typeName || !createdAt) return null;
  return {
    id,
    conversationId,
    senderId,
    clientMessageId: text(row.client_message_id),
    type: typeName,
    body: typeof row.body === "string" && row.body.length > 0 ? row.body : null,
    createdAt,
    deletedAt: text(row.deleted_at),
    contentHidden: row.content_hidden === true,
    replyToMessageId: text(row.reply_to_message_id),
    reply: null,
    reactions: [],
    attachments: [],
    entity: null,
    requireAcknowledgement: announcementRequiresAcknowledgement({
      type: typeName,
      metadata: row.metadata,
      contentHidden: row.content_hidden === true,
    }),
    acknowledged: false,
    acknowledgementCount: 0,
    poll: null,
  };
}

function isClientMessageConflict(error: DbError): boolean {
  if (error.code === "23505") return true;
  const blob = `${error.message}\n${error.details ?? ""}`.toLowerCase();
  return blob.includes("chat_messages_client_message_uidx");
}

function isUniqueViolation(error: DbError): boolean {
  return error.code === "23505";
}

function replySnippetFrom(row: Record<string, unknown>): ChatReplySnippet | null {
  const id = text(row.id);
  const senderId = text(row.sender_id);
  if (!id || !senderId) return null;
  const rawBody = typeof row.body === "string" && row.body.length > 0 ? row.body : null;
  const file = ["IMAGE", "VIDEO", "AUDIO", "VOICE_NOTE", "DOCUMENT"].includes(text(row.type) ?? "");
  const hidden = row.content_hidden === true || (rawBody == null && !file);
  return {
    id,
    senderId,
    body: hidden ? null : rawBody,
    contentHidden: hidden,
    file: !hidden && file,
  };
}

function groupReactions(rows: Record<string, unknown>[], userId: string): Map<string, ChatReactionGroup[]> {
  const grouped = new Map<string, Map<string, ChatReactionGroup>>();
  for (const row of rows) {
    const messageId = text(row.message_id);
    const emoji = text(row.emoji);
    if (!messageId || !emoji) continue;
    const byEmoji = grouped.get(messageId) ?? new Map<string, ChatReactionGroup>();
    const current = byEmoji.get(emoji) ?? { emoji, count: 0, mine: false };
    current.count += 1;
    if (text(row.user_id) === userId) current.mine = true;
    byEmoji.set(emoji, current);
    grouped.set(messageId, byEmoji);
  }
  const result = new Map<string, ChatReactionGroup[]>();
  for (const [messageId, byEmoji] of grouped) {
    result.set(
      messageId,
      [...byEmoji.values()].sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji)),
    );
  }
  return result;
}

function pollCountMissing(error: DbError): boolean {
  const blob = `${error.message}\n${error.details ?? ""}\n${error.code ?? ""}`.toLowerCase();
  return blob.includes("does not exist") || blob.includes("schema cache") || blob.includes("pgrst202") || error.code === "42883";
}

/** Counts only. Missing chat_poll_option_counts leaves the map null so anonymous totals are not invented. */
async function loadPollCounts(context: AuthContext, pollIds: string[]): Promise<Map<string, number> | null> {
  if (pollIds.length === 0) return new Map();
  const supabase = context.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: DbError | null }>;
  };
  const { data, error } = await supabase.rpc("chat_poll_option_counts", { _poll_ids: pollIds.slice(0, 100) });
  if (error) {
    if (pollCountMissing(error)) return null;
    chatFail(error);
  }
  const counts = new Map<string, number>();
  for (const row of rowsOf(data)) {
    const optionId = text(row.option_id);
    const raw = row.vote_count;
    const count = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (optionId && Number.isFinite(count)) counts.set(optionId, count);
  }
  return counts;
}

async function loadRoomPosts(context: AuthContext, messages: ChatTextMessage[]): Promise<ChatTextMessage[]> {
  if (messages.length === 0) return messages;
  const announcementIds = messages.filter((message) => message.type === "ANNOUNCEMENT").map((message) => message.id);
  const pollMessageIds = messages.filter((message) => message.type === "POLL" && !message.contentHidden).map((message) => message.id);
  const [ackRows, pollRows] = await Promise.all([
    announcementIds.length
      ? inChunks(announcementIds, (slice) =>
          readRows(
            chatFrom(context, "chat_acknowledgements").select("message_id, user_id").in("message_id", slice),
          ),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    pollMessageIds.length
      ? inChunks(pollMessageIds, (slice) =>
          readRows(
            chatFrom(context, "chat_polls")
              .select("id, message_id, allow_multiple, anonymous, expires_at")
              .in("message_id", slice),
          ),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const acks = new Map<string, { count: number; mine: boolean }>();
  for (const row of ackRows) {
    const messageId = text(row.message_id);
    if (!messageId) continue;
    const current = acks.get(messageId) ?? { count: 0, mine: false };
    current.count += 1;
    if (text(row.user_id)?.toLowerCase() === context.userId.toLowerCase()) current.mine = true;
    acks.set(messageId, current);
  }

  const polls = pollRows.flatMap((row) => {
    const id = text(row.id);
    const messageId = text(row.message_id);
    if (!id || !messageId) return [];
    return [
      {
        id,
        messageId,
        allowMultiple: row.allow_multiple === true,
        anonymous: row.anonymous === true,
        expiresAt: text(row.expires_at),
      },
    ];
  });
  const pollIds = polls.map((poll) => poll.id);
  const [optionRows, voteRows, counts] = await Promise.all([
    pollIds.length
      ? inChunks(pollIds, (slice) =>
          readRows(chatFrom(context, "chat_poll_options").select("id, poll_id, label, position").in("poll_id", slice)),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    pollIds.length
      ? inChunks(pollIds, (slice) =>
          readRows(chatFrom(context, "chat_poll_votes").select("poll_id, option_id, user_id").in("poll_id", slice)),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
    loadPollCounts(context, pollIds),
  ]);

  const optionsByPoll = new Map<string, { id: string; label: string; position: number }[]>();
  for (const row of optionRows) {
    const pollId = text(row.poll_id);
    const id = text(row.id);
    const label = text(row.label);
    const position = typeof row.position === "number" ? row.position : Number(row.position);
    if (!pollId || !id || !label || !Number.isInteger(position)) continue;
    const list = optionsByPoll.get(pollId) ?? [];
    list.push({ id, label, position });
    optionsByPoll.set(pollId, list);
  }
  const votesByPoll = new Map<string, { optionId: string; userId: string }[]>();
  for (const row of voteRows) {
    const pollId = text(row.poll_id);
    const optionId = text(row.option_id);
    const userId = text(row.user_id);
    if (!pollId || !optionId || !userId) continue;
    const list = votesByPoll.get(pollId) ?? [];
    list.push({ optionId, userId });
    votesByPoll.set(pollId, list);
  }
  const pollByMessage = new Map<string, ChatPollModel>();
  for (const poll of polls) {
    pollByMessage.set(poll.messageId, {
      id: poll.id,
      allowMultiple: poll.allowMultiple,
      anonymous: poll.anonymous,
      expiresAt: poll.expiresAt,
      options: shapePollResult({
        anonymous: poll.anonymous,
        viewerUserId: context.userId,
        options: optionsByPoll.get(poll.id) ?? [],
        votes: votesByPoll.get(poll.id) ?? [],
        counts,
      }),
    });
  }

  return messages.map((message) => {
    const ack = acks.get(message.id);
    return {
      ...message,
      acknowledged: ack?.mine ?? false,
      acknowledgementCount: ack?.count ?? 0,
      poll: pollByMessage.get(message.id) ?? null,
    };
  });
}

async function withThreadExtras(context: AuthContext, messages: ChatTextMessage[]): Promise<ChatTextMessage[]> {
  if (messages.length === 0) return messages;
  const ids = messages.map((message) => message.id);
  const replyIds = [
    ...new Set(messages.map((message) => message.replyToMessageId).filter((id): id is string => id != null)),
  ];
  const [reactionRows, replyRows] = await Promise.all([
    inChunks(ids, (slice) =>
      readRows(chatFrom(context, "chat_reactions").select("message_id, user_id, emoji").in("message_id", slice)),
    ),
    replyIds.length
      ? inChunks(replyIds, (slice) =>
          readRows(
            chatFrom(context, "chat_messages_visible")
              .select("id, sender_id, body, content_hidden, type")
              .in("id", slice),
          ),
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);
  const reactions = groupReactions(reactionRows, context.userId);
  const replies = new Map<string, ChatReplySnippet>();
  for (const row of replyRows) {
    const snippet = replySnippetFrom(row);
    if (snippet) replies.set(snippet.id, snippet);
  }
  const enriched = messages.map((message) => {
    const replyId = message.replyToMessageId;
    const reply = replyId
      ? (replies.get(replyId) ?? { id: replyId, senderId: "", body: null, contentHidden: true, file: false })
      : null;
    return {
      ...message,
      reply,
      reactions: reactions.get(message.id) ?? [],
    };
  });
  return loadRoomPosts(context, await loadSharedEntities(context, await loadMessageAttachments(context, enriched)));
}

function deniedEntity(entityType: string, entityId: string): ChatSharedEntity {
  return {
    entityType,
    entityId,
    access: false,
    code: null,
    title: null,
    jobTitle: null,
    locationName: null,
    status: null,
    priority: null,
    href: null,
  };
}

function grantedEntity(entityType: string, entityId: string, card: ChatEntityCardFields): ChatSharedEntity {
  return {
    entityType,
    entityId,
    access: true,
    code: card.code,
    title: card.title,
    jobTitle: card.jobTitle,
    locationName: card.locationName,
    status: card.status,
    priority: card.priority,
    href: card.href,
  };
}

async function locationNameMap(context: AuthContext, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return names;
  const rows = await inChunks(unique, (slice) =>
    readRows(chatFrom(context, "locations").select("id, name").in("id", slice)),
  );
  for (const row of rows) {
    const id = text(row.id);
    const name = chatEntityPlain(row.name, 80);
    if (id && name) names.set(id, name);
  }
  return names;
}

async function readEntityRows(
  context: AuthContext,
  entityType: ChatShareableEntityType,
  options: { ids?: string[]; pattern?: string },
): Promise<Record<string, unknown>[]> {
  const source = CHAT_ENTITY_SOURCES[entityType];
  if (!options.ids && !options.pattern) return [];
  if (options.ids && options.ids.length === 0) return [];
  if (entityType === "TRAINING_SESSION" && options.pattern) {
    const courses = await readRows(
      chatFrom(context, "training_courses")
        .select("id")
        .or(`title.ilike.${options.pattern},code.ilike.${options.pattern}`)
        .limit(CHAT_ENTITY_RESULT_CAP),
    );
    const courseIds = courses.map((row) => text(row.id)).filter((id): id is string => id != null);
    if (courseIds.length === 0) return [];
    return readRows(
      chatFrom(context, source.table).select(source.columns).in("course_id", courseIds).limit(CHAT_ENTITY_RESULT_CAP),
    );
  }
  let query = chatFrom(context, source.table).select(source.columns);
  if (source.deletedAt) query = query.is("deleted_at", null);
  if (options.ids) query = query.in("id", options.ids);
  if (options.pattern && source.searchColumns.length > 0) {
    const filter = source.searchColumns.map((column) => `${column}.ilike.${options.pattern}`).join(",");
    query = query.or(filter).limit(CHAT_ENTITY_RESULT_CAP);
  }
  return readRows(query);
}

async function cardsForRows(
  context: AuthContext,
  entityType: ChatShareableEntityType,
  rows: Record<string, unknown>[],
): Promise<Map<string, ChatEntityCardFields>> {
  const cards = new Map<string, ChatEntityCardFields>();
  if (entityType === "TRAINING_SESSION") {
    const courseIds = rows.map((row) => text(row.course_id)).filter((id): id is string => id != null);
    const courses = courseIds.length
      ? await readRows(chatFrom(context, "training_courses").select("id, code, title").in("id", [...new Set(courseIds)]))
      : [];
    const byId = new Map(courses.flatMap((row) => {
      const id = text(row.id);
      return id ? [[id, row] as const] : [];
    }));
    for (const row of rows) {
      const course = byId.get(text(row.course_id) ?? "");
      if (!course) continue;
      row.course_code = course.code;
      row.course_title = course.title;
    }
  }
  const locationIds = rows.map((row) => text(row.location_id)).filter((id): id is string => id != null);
  const names = await locationNameMap(context, locationIds);
  for (const row of rows) {
    const id = text(row.id);
    if (!id) continue;
    const card = chatEntityCardFromRow(entityType, row, names.get(text(row.location_id) ?? "") ?? null);
    if (card) cards.set(id, card);
  }
  return cards;
}

async function previewEntity(
  context: AuthContext,
  entityType: ChatShareableEntityType,
  entityId: string,
): Promise<ChatEntityCardFields | null> {
  const rows = await readEntityRows(context, entityType, { ids: [entityId] });
  const cards = await cardsForRows(context, entityType, rows);
  return cards.get(entityId) ?? null;
}

/**
 * Reloads each linked record with the viewer’s client. An empty select stays access: false.
 * Nothing is copied from message metadata. Hidden messages do not receive a card.
 */
async function loadSharedEntities(context: AuthContext, messages: ChatTextMessage[]): Promise<ChatTextMessage[]> {
  const ids = messages.filter((message) => message.type === "FEC_ENTITY" && !message.contentHidden).map((message) => message.id);
  if (ids.length === 0) return messages;
  const links = await inChunks(ids, (slice) =>
    readRows(
      chatFrom(context, "chat_entity_links")
        .select("message_id, entity_type, entity_id")
        .in("message_id", slice),
    ),
  );
  const byMessage = new Map<string, { entityType: string; entityId: string }>();
  for (const row of links) {
    const messageId = text(row.message_id);
    const entityType = text(row.entity_type);
    const entityId = text(row.entity_id);
    if (!messageId || !entityType || !entityId || byMessage.has(messageId)) continue;
    byMessage.set(messageId, { entityType, entityId });
  }
  const grouped = new Map<ChatShareableEntityType, string[]>();
  for (const link of byMessage.values()) {
    if (!(link.entityType in CHAT_ENTITY_SOURCES)) continue;
    const entityType = link.entityType as ChatShareableEntityType;
    const list = grouped.get(entityType) ?? [];
    list.push(link.entityId);
    grouped.set(entityType, list);
  }
  const previews = new Map<string, ChatEntityCardFields>();
  await Promise.all(
    [...grouped.entries()].map(async ([entityType, entityIds]) => {
      const rows = await readEntityRows(context, entityType, { ids: [...new Set(entityIds)] });
      const cards = await cardsForRows(context, entityType, rows);
      for (const [entityId, card] of cards) previews.set(`${entityType}:${entityId}`, card);
    }),
  );
  return messages.map((message) => {
    const link = byMessage.get(message.id);
    if (!link || message.contentHidden) return message;
    const card = previews.get(`${link.entityType}:${link.entityId}`) ?? null;
    const access = chatEntityPreviewAccess(card);
    return {
      ...message,
      entity: access.access ? grantedEntity(link.entityType, link.entityId, access.card) : deniedEntity(link.entityType, link.entityId),
    };
  });
}

async function visibleIdByClientId(
  context: AuthContext,
  conversationId: string,
  clientMessageId: string,
): Promise<string | null> {
  const result = await chatFrom(context, "chat_messages_visible")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("client_message_id", clientMessageId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return text((result.data as Record<string, unknown>).id);
}

async function ensureEntityLink(
  context: AuthContext,
  conversationId: string,
  messageId: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const existing = await readRows(
    chatFrom(context, "chat_entity_links")
      .select("id")
      .eq("message_id", messageId)
      .limit(1),
  );
  if (existing.length > 0) return;
  const inserted = await chatFrom(context, "chat_entity_links")
    .insert({
      conversation_id: conversationId,
      message_id: messageId,
      entity_type: entityType,
      entity_id: entityId,
      created_by: context.userId,
    })
    .select("id")
    .maybeSingle();
  if (inserted.error) {
    if (isUniqueViolation(inserted.error)) return;
    const again = await readRows(
      chatFrom(context, "chat_entity_links").select("id").eq("message_id", messageId).limit(1),
    );
    if (again.length > 0) return;
    chatFail(inserted.error);
  }
}

async function signAttachmentUrls(rows: Record<string, unknown>[]): Promise<Map<string, string>> {
  const entries = rows.flatMap((row) => {
    const id = text(row.id);
    const storagePath = text(row.storage_path);
    if (!id || !storagePath || storagePath.includes("..") || storagePath.includes("\\")) return [];
    return [{ id, storagePath }];
  });
  const signed = new Map<string, string>();
  if (entries.length === 0) return signed;
  const { data, error } = await supabaseAdmin.storage
    .from(CHAT_ATTACHMENT_BUCKET)
    .createSignedUrls(
      entries.map((entry) => entry.storagePath),
      CHAT_ATTACHMENT_URL_SECONDS,
    );
  if (error || !data) return signed;
  data.forEach((item, index) => {
    const id = entries[index]?.id;
    if (!id || item.error || !item.signedUrl) return;
    signed.set(id, item.signedUrl);
  });
  return signed;
}

async function loadMessageAttachments(
  context: AuthContext,
  messages: ChatTextMessage[],
): Promise<ChatTextMessage[]> {
  const ids = messages.filter((message) => !message.contentHidden).map((message) => message.id);
  if (ids.length === 0) return messages;
  const rows = await inChunks(ids, (slice) =>
    readRows(
      chatFrom(context, "chat_attachments")
        .select("id, message_id, original_filename, mime_type, byte_size, scan_status, storage_path, created_at")
        .in("message_id", slice),
    ),
  );
  const urls = await signAttachmentUrls(rows);
  const grouped = new Map<string, ChatAttachment[]>();
  const sortable = rows.flatMap((row) => {
    const messageId = text(row.message_id);
    const id = text(row.id);
    const filename = text(row.original_filename);
    const mimeType = text(row.mime_type);
    const scanStatus = text(row.scan_status);
    const createdAt = text(row.created_at) ?? "";
    const byteSize = typeof row.byte_size === "number" ? row.byte_size : Number(row.byte_size);
    if (!messageId || !id || !filename || !mimeType || !scanStatus || !Number.isFinite(byteSize)) return [];
    return [{ messageId, id, filename, mimeType, scanStatus, byteSize, createdAt }];
  });
  sortable.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const row of sortable) {
    const list = grouped.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      scanStatus: row.scanStatus,
      url: urls.get(row.id) ?? null,
    });
    grouped.set(row.messageId, list);
  }
  return messages.map((message) => ({
    ...message,
    attachments: message.contentHidden ? [] : (grouped.get(message.id) ?? []),
  }));
}

function attachmentIssueMessage(issue: ChatAttachmentIssue): string {
  if (issue === "large") return "That file is too large.";
  if (issue === "magic") return "That file does not match its type.";
  if (issue === "empty") return "That file is empty.";
  return "That file type is not supported.";
}

function decodeAttachmentBase64(dataBase64: string): Uint8Array {
  const cleaned = dataBase64.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new Error("That file could not be read.");
  const buffer = Buffer.from(cleaned, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function chatScanWebhookConfigured(): boolean {
  const value = process.env.CHAT_ATTACHMENT_SCAN_WEBHOOK;
  return typeof value === "string" && value.trim().length > 0;
}

function storageMissing(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("bucket") && (message.includes("not found") || message.includes("does not exist"));
}

function storageAlreadyExists(error: { message?: string; statusCode?: string | number } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("already exists") || message.includes("duplicate") || String(error?.statusCode ?? "") === "409";
}

async function countRecentAttachments(context: AuthContext): Promise<number> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const supabase = context.supabase as unknown as {
    from: (table: string) => {
      select: (
        columns: string,
        options: { count: "exact"; head: true },
      ) => {
        eq: (column: string, value: string) => {
          gte: (column: string, value: string) => Promise<{ count: number | null; error: DbError | null }>;
        };
      };
    };
  };
  const { count, error } = await supabase
    .from("chat_attachments")
    .select("id", { count: "exact", head: true })
    .eq("created_by", context.userId)
    .gte("created_at", since);
  if (error) chatFail(error);
  return count ?? 0;
}

async function markAttachmentSkipped(attachmentId: string): Promise<void> {
  if (chatScanWebhookConfigured()) return;
  const admin = supabaseAdmin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: DbError | null }>;
  };
  const { error } = await admin.rpc("chat_mark_attachment_skipped", { attachment_id: attachmentId });
  if (!error) return;
  const blob = `${error.message}\n${error.details ?? ""}`.toLowerCase();
  if (blob.includes("does not exist") || blob.includes("schema cache") || blob.includes("could not find")) return;
  chatFail(error);
}

type StoredAttachment = {
  id: string;
  conversationId: string;
  messageId: string | null;
  mimeType: string;
  byteSize: number;
  scanStatus: string;
  createdBy: string;
};

function storedAttachmentFrom(row: Record<string, unknown>): StoredAttachment | null {
  const id = text(row.id);
  const conversationId = text(row.conversation_id);
  const mimeType = text(row.mime_type);
  const scanStatus = text(row.scan_status);
  const createdBy = text(row.created_by);
  const byteSize = typeof row.byte_size === "number" ? row.byte_size : Number(row.byte_size);
  if (!id || !conversationId || !mimeType || !scanStatus || !createdBy || !Number.isFinite(byteSize)) return null;
  return {
    id,
    conversationId,
    messageId: text(row.message_id),
    mimeType,
    byteSize,
    scanStatus,
    createdBy,
  };
}

async function readOwnAttachment(context: AuthContext, attachmentId: string): Promise<StoredAttachment | null> {
  const result = await chatFrom(context, "chat_attachments")
    .select("id, conversation_id, message_id, mime_type, byte_size, scan_status, created_by")
    .eq("id", attachmentId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return storedAttachmentFrom(result.data as Record<string, unknown>);
}

async function visibleMessageRow(
  context: AuthContext,
  messageId: string,
  conversationId?: string,
): Promise<Record<string, unknown> | null> {
  let query = chatFrom(context, "chat_messages_visible").select("id, conversation_id, created_at").eq("id", messageId);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  const result = await query.limit(1).maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return result.data as Record<string, unknown>;
}

async function visibleByClientId(
  context: AuthContext,
  conversationId: string,
  clientMessageId: string,
): Promise<ChatTextMessage | null> {
  const result = await chatFrom(context, "chat_messages_visible")
    .select(VISIBLE_MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .eq("client_message_id", clientMessageId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  const message = messageFrom(result.data as Record<string, unknown>);
  if (!message) return null;
  const [enriched] = await withThreadExtras(context, [message]);
  return enriched ?? null;
}

async function activeMemberIds(context: AuthContext, conversationId: string): Promise<string[]> {
  const rows = await readRows(
    chatFrom(context, "chat_members").select("user_id").eq("conversation_id", conversationId).is("left_at", null),
  );
  return rows.map((row) => text(row.user_id)).filter((id): id is string => id != null);
}

async function storeChatMentions(
  context: AuthContext,
  conversationId: string,
  messageId: string,
  userIds: readonly string[],
): Promise<string[]> {
  const stored: string[] = [];
  for (const userId of userIds) {
    const result = await chatFrom(context, "chat_mentions").insert({
      message_id: messageId,
      mentioned_user_id: userId,
      conversation_id: conversationId,
    });
    if (!result.error || isUniqueViolation(result.error)) stored.push(userId);
  }
  return stored;
}

async function preferenceLevelsFor(
  userIds: string[],
  conversationId: string,
): Promise<Map<string, { conversation: string | null; global: string | null }>> {
  const prefs = new Map<string, { conversation: string | null; global: string | null }>();
  const ensure = (userId: string) => {
    const current = prefs.get(userId) ?? { conversation: null, global: null };
    prefs.set(userId, current);
    return current;
  };
  const conversationRows = await inChunks(userIds, (slice) =>
    readRows(
      adminFrom("chat_notification_preferences")
        .select("user_id, level")
        .in("user_id", slice)
        .eq("conversation_id", conversationId),
    ),
  );
  for (const row of conversationRows) {
    const userId = text(row.user_id);
    if (!userId) continue;
    ensure(userId).conversation = text(row.level);
  }
  const globalRows = await inChunks(userIds, (slice) =>
    readRows(
      adminFrom("chat_notification_preferences").select("user_id, level").in("user_id", slice).is("conversation_id", null),
    ),
  );
  for (const row of globalRows) {
    const userId = text(row.user_id);
    if (!userId) continue;
    ensure(userId).global = text(row.level);
  }
  return prefs;
}

async function senderDisplayName(context: AuthContext): Promise<string | null> {
  const result = await chatFrom(context, "staff")
    .select("full_name")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data || typeof result.data !== "object") return null;
  return text((result.data as Record<string, unknown>).full_name);
}

async function conversationNotice(
  context: AuthContext,
  conversationId: string,
): Promise<{ title: string | null; locationId: string | null }> {
  const result = await chatFrom(context, "chat_conversations")
    .select("title, location_id")
    .eq("id", conversationId)
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data || typeof result.data !== "object") return { title: null, locationId: null };
  const row = result.data as Record<string, unknown>;
  return { title: text(row.title), locationId: text(row.location_id) };
}

/**
 * In-app bell first. Category `chat` is not an hr_* category, so notifyUsers does not email.
 * Browser push and the email webhook run only after a new in-app row, and only when configured.
 * Does not read chat_messages.body. The preview is the validated string just inserted.
 * Cross-device "already viewing" suppression is not implemented. The sender is excluded.
 * Presence is not written to Postgres.
 * Call only after a new insert. An idempotent client_message_id replay must not call this.
 */
async function notifyChatMessage(
  context: AuthContext,
  input: {
    conversationId: string;
    messageId: string;
    body: string | null;
    messageType: string;
    mentionUserIds: readonly string[] | undefined;
  },
): Promise<void> {
  try {
    const members = await activeMemberIds(context, input.conversationId);
    const recipients = members.filter((id) => id !== context.userId);
    if (recipients.length === 0) return;
    const targets = chatMentionTargets(input.mentionUserIds, members, context.userId);
    const stored = await storeChatMentions(context, input.conversationId, input.messageId, targets);
    const mentioned = new Set(stored.map((id) => id.toLowerCase()));
    const prefs = await preferenceLevelsFor(recipients, input.conversationId);
    const userIds = recipients.filter((userId) => {
      const row = prefs.get(userId);
      return shouldNotifyChatRecipient({
        level: resolveChatNotificationLevel(row?.conversation, row?.global),
        mentioned: mentioned.has(userId.toLowerCase()),
        inserted: true,
      });
    });
    if (userIds.length === 0) return;
    const [senderName, room] = await Promise.all([
      senderDisplayName(context),
      conversationNotice(context, input.conversationId),
    ]);
    const title = chatNotificationTitle({ senderName, conversationTitle: room.title });
    const body = chatNotificationPreview({ body: input.body, messageType: input.messageType });
    const actionUrl = `/chat?c=${input.conversationId}`;
    const inserted = await notifyUsers({
      userIds,
      excludeUserId: context.userId,
      locationId: room.locationId,
      category: "chat",
      title,
      body,
      severity: "info",
      actionUrl,
      sourceType: "chat_message",
      sourceId: input.messageId,
    });
    if (inserted > 0) {
      await deliverChatChannels({ userIds, title, body, actionUrl });
    }
  } catch (error) {
    console.warn("[chat-notify] skipped", error instanceof Error ? error.message : "failed");
  }
}

/**
 * Inserts TEXT, or ANNOUNCEMENT when the room kind is ANNOUNCEMENT, as the signed-in user.
 * sender_id is set by trigger. Does not select chat_messages.body.
 * Content is read from chat_messages_visible, including metadata.require_ack.
 * A unique (conversation_id, client_message_id) conflict returns the existing visible row
 * and does not notify again.
 * reply_to_message_id must already be visible in this conversation.
 * Does not write chat_audit_logs. Does not use the service role.
 */
export const sendTextMessage = createSafeAuthenticatedAction(
  sendTextMessageSchema,
  async (data, context) => {
    const kind = await roomKind(context, data.conversationId);
    if (!kind) throw new Error("You cannot send a message in this conversation.");
    const announcement = kind === "ANNOUNCEMENT";
    if (announcement) {
      await assertAnnouncementPoster(context, data.conversationId);
      await assertRecentMessageRate(context);
    }
    if (data.replyToMessageId) {
      const reply = await visibleMessageRow(context, data.replyToMessageId, data.conversationId);
      if (!reply || text(reply.conversation_id) !== data.conversationId) {
        throw new Error("You cannot reply to that message.");
      }
    }

    const inserted = await chatFrom(context, "chat_messages")
      .insert({
        conversation_id: data.conversationId,
        type: announcement ? "ANNOUNCEMENT" : "TEXT",
        body: data.body,
        client_message_id: data.clientMessageId,
        ...(announcement ? { metadata: { require_ack: data.requireAcknowledgement === true } } : {}),
        ...(data.replyToMessageId ? { reply_to_message_id: data.replyToMessageId } : {}),
      })
      .select("id, client_message_id, created_at")
      .maybeSingle();

    if (inserted.error) {
      if (!isClientMessageConflict(inserted.error)) chatFail(inserted.error);
    }

    const created =
      !inserted.error && inserted.data != null && typeof inserted.data === "object"
        ? text((inserted.data as Record<string, unknown>).id)
        : null;

    const visible = await visibleByClientId(context, data.conversationId, data.clientMessageId);
    if (!visible) throw new Error("You cannot send a message in this conversation.");
    if (created) {
      await notifyChatMessage(context, {
        conversationId: data.conversationId,
        messageId: created,
        body: data.body,
        messageType: announcement ? "ANNOUNCEMENT" : "TEXT",
        mentionUserIds: data.mentionUserIds,
      });
    }
    return visible;
  },
  { auth: { capability: "chat.send" } },
);

async function roomKind(context: AuthContext, conversationId: string): Promise<string | null> {
  const result = await chatFrom(context, "chat_conversations")
    .select("kind")
    .eq("id", conversationId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return text((result.data as Record<string, unknown>).kind);
}

/** ANNOUNCEMENT inserts are rejected by chat_message_type_allowed unless the role is OWNER or ADMIN. */
async function assertAnnouncementPoster(context: AuthContext, conversationId: string): Promise<void> {
  const role = await chatMemberRole(context, conversationId);
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("You cannot send a message in this conversation.");
  }
}

/**
 * Inserts the caller's acknowledgement. chat_acknowledgements has no update or delete.
 * A duplicate primary key is success. Does not use the service role.
 */
export const acknowledgeAnnouncement = createSafeAuthenticatedAction(
  acknowledgeAnnouncementSchema,
  async (data, context) => {
    const visible = await chatFrom(context, "chat_messages_visible")
      .select("id, type, conversation_id")
      .eq("id", data.messageId)
      .eq("conversation_id", data.conversationId)
      .limit(1)
      .maybeSingle();
    if (visible.error) chatFail(visible.error);
    const row = visible.data && typeof visible.data === "object" ? (visible.data as Record<string, unknown>) : null;
    if (!row || text(row.type) !== "ANNOUNCEMENT") throw new Error("You do not have access to do that.");

    const inserted = await chatFrom(context, "chat_acknowledgements")
      .insert({
        message_id: data.messageId,
        conversation_id: data.conversationId,
        user_id: context.userId,
      })
      .select("message_id")
      .maybeSingle();
    if (inserted.error && !isUniqueViolation(inserted.error)) chatFail(inserted.error);
    return { messageId: data.messageId, acknowledged: true };
  },
  { auth: { capability: "chat.view" } },
);

/**
 * Inserts a POLL message, then chat_polls and chat_poll_options as the sender.
 * The question is the message body so it is readable on chat_messages_visible.
 * A failed poll or option insert is returned to the caller. The service role is not used.
 */
export const createPoll = createSafeAuthenticatedAction(
  createPollSchema,
  async (data, context) => {
    const kind = await roomKind(context, data.conversationId);
    if (!kind) throw new Error("You cannot send a message in this conversation.");
    if (kind === "ANNOUNCEMENT") await assertAnnouncementPoster(context, data.conversationId);
    try {
      await assertChatCanPost(context, data.conversationId);
    } catch {
      throw new Error("You cannot send a message in this conversation.");
    }
    await assertRecentMessageRate(context);

    let createdId: string | null = null;
    let messageId = await visibleIdByClientId(context, data.conversationId, data.clientMessageId);
    if (!messageId) {
      const inserted = await chatFrom(context, "chat_messages")
        .insert({
          conversation_id: data.conversationId,
          type: "POLL",
          body: data.question,
          client_message_id: data.clientMessageId,
        })
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (!isClientMessageConflict(inserted.error)) chatFail(inserted.error);
      } else if (inserted.data && typeof inserted.data === "object") {
        messageId = text((inserted.data as Record<string, unknown>).id);
        createdId = messageId;
      }
      if (!messageId) messageId = await visibleIdByClientId(context, data.conversationId, data.clientMessageId);
    }
    if (!messageId) throw new Error("You cannot send a message in this conversation.");

    const existingPoll = await chatFrom(context, "chat_polls")
      .select("id")
      .eq("message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existingPoll.error) chatFail(existingPoll.error);
    let pollId =
      existingPoll.data && typeof existingPoll.data === "object"
        ? text((existingPoll.data as Record<string, unknown>).id)
        : null;
    if (!pollId) {
      const pollInserted = await chatFrom(context, "chat_polls")
        .insert({
          message_id: messageId,
          conversation_id: data.conversationId,
          allow_multiple: data.allowMultiple,
          anonymous: data.anonymous,
          expires_at: data.expiresAt ?? null,
        })
        .select("id")
        .maybeSingle();
      if (pollInserted.error) chatFail(pollInserted.error);
      pollId =
        pollInserted.data && typeof pollInserted.data === "object"
          ? text((pollInserted.data as Record<string, unknown>).id)
          : null;
    }
    if (!pollId) throw new Error("Chat request failed.");

    const existingOptions = await readRows(
      chatFrom(context, "chat_poll_options").select("position").eq("poll_id", pollId),
    );
    const positions = new Set(
      existingOptions.map((row) => (typeof row.position === "number" ? row.position : Number.NaN)),
    );
    for (let index = 0; index < data.options.length; index += 1) {
      if (positions.has(index)) continue;
      const optionInserted = await chatFrom(context, "chat_poll_options")
        .insert({
          poll_id: pollId,
          label: data.options[index],
          position: index,
        })
        .select("id")
        .maybeSingle();
      if (optionInserted.error) chatFail(optionInserted.error);
    }

    const visible = await visibleByClientId(context, data.conversationId, data.clientMessageId);
    if (!visible) throw new Error("You cannot send a message in this conversation.");
    if (createdId) {
      await notifyChatMessage(context, {
        conversationId: data.conversationId,
        messageId: createdId,
        body: data.question,
        messageType: "POLL",
        mentionUserIds: undefined,
      });
    }
    return visible;
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Inserts the caller's votes. user_id is forced to auth.uid() by trigger.
 * Single-choice is checked here and again by chat_tg_poll_vote_single_choice.
 * Expired polls and a second vote are rejected. Does not use the service role.
 */
export const castVote = createSafeAuthenticatedAction(
  castVoteSchema,
  async (data, context) => {
    const pollResult = await chatFrom(context, "chat_polls")
      .select("id, allow_multiple, expires_at")
      .eq("id", data.pollId)
      .limit(1)
      .maybeSingle();
    if (pollResult.error) chatFail(pollResult.error);
    const poll =
      pollResult.data && typeof pollResult.data === "object" ? (pollResult.data as Record<string, unknown>) : null;
    if (!poll) throw new Error("You do not have access to do that.");

    const options = await readRows(chatFrom(context, "chat_poll_options").select("id").eq("poll_id", data.pollId));
    const allowed = new Set(options.map((row) => text(row.id)).filter((id): id is string => id != null));
    const optionIds = [...new Set(data.optionIds)];
    if (optionIds.some((id) => !allowed.has(id))) throw new Error("You do not have access to do that.");

    const existing = await readRows(
      chatFrom(context, "chat_poll_votes").select("option_id").eq("poll_id", data.pollId).eq("user_id", context.userId),
    );
    const block = chatPollVoteBlock({
      expiresAt: text(poll.expires_at),
      nowMs: Date.now(),
      allowMultiple: poll.allow_multiple === true,
      optionIds,
      alreadyVoted: existing.length > 0,
    });
    if (block) throw new Error(pollVoteMessages[block]);

    for (const optionId of optionIds) {
      const inserted = await chatFrom(context, "chat_poll_votes")
        .insert({
          poll_id: data.pollId,
          option_id: optionId,
          user_id: context.userId,
        })
        .select("option_id")
        .maybeSingle();
      if (inserted.error) chatFail(inserted.error);
    }
    return { pollId: data.pollId };
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Shares one record the caller can already read. The message body is the note
 * or a generic label, never a stored snapshot of the record. A repeated
 * clientMessageId does not insert another message or another link.
 * The preview select uses the signed-in client. An empty select is rejected.
 */
export const shareEntityInChat = createSafeAuthenticatedAction(
  shareEntityInChatSchema,
  async (data, context) => {
    try {
      await assertChatCanPost(context, data.conversationId);
    } catch {
      throw new Error("You cannot send a message in this conversation.");
    }
    const preview = await previewEntity(context, data.entityType, data.entityId);
    if (!preview) throw new Error("You do not have access to this record.");

    const body = chatEntityMessageBody(data.note);
    let createdId: string | null = null;
    let messageId = await visibleIdByClientId(context, data.conversationId, data.clientMessageId);
    if (!messageId) {
      await assertRecentMessageRate(context);
      const inserted = await chatFrom(context, "chat_messages")
        .insert({
          conversation_id: data.conversationId,
          type: "FEC_ENTITY",
          body,
          client_message_id: data.clientMessageId,
        })
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (!isClientMessageConflict(inserted.error)) chatFail(inserted.error);
      } else if (inserted.data && typeof inserted.data === "object") {
        messageId = text((inserted.data as Record<string, unknown>).id);
        createdId = messageId;
      }
      if (!messageId) {
        messageId = await visibleIdByClientId(context, data.conversationId, data.clientMessageId);
      }
    }
    if (!messageId) throw new Error("You cannot send a message in this conversation.");
    await ensureEntityLink(context, data.conversationId, messageId, data.entityType, data.entityId);
    const visible = await visibleByClientId(context, data.conversationId, data.clientMessageId);
    if (!visible) throw new Error("You cannot send a message in this conversation.");
    if (createdId) {
      await notifyChatMessage(context, {
        conversationId: data.conversationId,
        messageId: createdId,
        body,
        messageType: "FEC_ENTITY",
        mentionUserIds: undefined,
      });
    }
    return visible;
  },
  { auth: { capability: "chat.send" } },
);

/**
 * User-scoped search across supported record types. At least 2 characters.
 * At most 15 hits. Soft-deleted rows are omitted where the table has deleted_at.
 */
export const searchChatEntities = createSafeAuthenticatedAction(
  searchChatEntitiesSchema,
  async (data, context) => {
    const pattern = chatEntityLikePattern(data.query);
    if (!pattern) throw new Error("Type at least 2 characters.");
    const types = data.entityType ? [data.entityType] : [...Object.keys(CHAT_ENTITY_SOURCES) as ChatShareableEntityType[]];
    const buckets = await Promise.all(
      types.map(async (entityType) => {
        const rows = await readEntityRows(context, entityType, { pattern });
        const cards = await cardsForRows(context, entityType, rows);
        const hits: ChatEntitySearchHit[] = [];
        for (const [entityId, card] of cards) {
          const entity = grantedEntity(entityType, entityId, card);
          if (entity.access) hits.push({ ...entity, access: true });
        }
        return hits;
      }),
    );
    const merged: ChatEntitySearchHit[] = [];
    let index = 0;
    while (merged.length < CHAT_ENTITY_RESULT_CAP) {
      let added = false;
      for (const bucket of buckets) {
        const hit = bucket[index];
        if (!hit) continue;
        merged.push(hit);
        added = true;
        if (merged.length >= CHAT_ENTITY_RESULT_CAP) break;
      }
      if (!added) break;
      index += 1;
    }
    return merged;
  },
  { auth: { capability: "chat.send" } },
);

const prepareChatAttachmentSchema = z.object({
  conversationId: z.string().uuid(),
  clientAttachmentId: z.string().uuid(),
  filename: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(255),
  dataBase64: z.string().min(1).max(40 * 1024 * 1024),
});

const attachmentCaptionSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const issue = chatAttachmentCaptionIssue(value);
    if (!issue) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue === "long" ? "Message must be 8000 characters or less." : "Messages are plain text.",
    });
  });

const sendAttachmentMessageSchema = z.object({
  conversationId: z.string().uuid(),
  clientMessageId: z.string().uuid(),
  body: attachmentCaptionSchema.optional(),
  attachmentIds: z.array(z.string().uuid()).min(1).max(CHAT_ATTACHMENT_MAX_PER_MESSAGE),
  replyToMessageId: z.string().uuid().optional(),
  voiceNote: z.literal(true).optional(),
  mentionUserIds: chatMentionUserIdsField,
});

const attachmentUrlSchema = z.object({
  attachmentId: z.string().uuid(),
});

async function assertRecentMessageRate(context: AuthContext): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const rows = await readRows(
    chatFrom(context, "chat_messages_visible")
      .select("id")
      .eq("sender_id", context.userId)
      .gte("created_at", since)
      .limit(CHAT_TEXT_RATE_PER_MINUTE),
  );
  if (rows.length >= CHAT_TEXT_RATE_PER_MINUTE) {
    throw new Error("You are sending messages too quickly. Wait a moment and try again.");
  }
}

async function bindAttachments(
  context: AuthContext,
  conversationId: string,
  messageId: string,
  attachmentIds: readonly string[],
): Promise<void> {
  for (const attachmentId of attachmentIds) {
    const row = await readOwnAttachment(context, attachmentId);
    if (!row || row.createdBy !== context.userId || row.conversationId !== conversationId) {
      throw new Error("You do not have access to do that.");
    }
    if (row.scanStatus === "REJECTED") throw new Error("That file was rejected.");
    if (row.messageId === messageId) continue;
    if (row.messageId) throw new Error("That file was already sent.");
    const updated = await readRows(
      chatFrom(context, "chat_attachments")
        .update({ message_id: messageId })
        .eq("id", attachmentId)
        .eq("conversation_id", conversationId)
        .is("message_id", null)
        .select("id"),
    );
    if (updated.length > 0) continue;
    const again = await readOwnAttachment(context, attachmentId);
    if (again?.messageId !== messageId) throw new Error("That file was already sent.");
  }
}

/**
 * Validates the file, inserts a PENDING chat_attachments row as the user, then
 * writes the object with the service role. SKIPPED is set only when
 * CHAT_ATTACHMENT_SCAN_WEBHOOK is unset, by the service-role client. When that
 * env var is set, the row stays PENDING. The webhook is not called.
 * The same clientAttachmentId reuses the row. A failed upload can leave PENDING.
 */
export const prepareChatAttachment = createSafeAuthenticatedAction(
  prepareChatAttachmentSchema,
  async (data, context) => {
    const storagePath = chatAttachmentObjectPath(data.conversationId, data.clientAttachmentId);
    if (!storagePath) throw new Error("Chat request failed.");
    const bytes = decodeAttachmentBase64(data.dataBase64);
    const prepared = chatPreparedAttachment({
      fileType: data.mimeType,
      bytes,
      filename: data.filename,
    });
    if (!prepared.ok) throw new Error(attachmentIssueMessage(prepared.issue));

    const existingResult = await chatFrom(context, "chat_attachments")
      .select("id, message_id, mime_type, byte_size, scan_status, conversation_id, created_by")
      .eq("storage_bucket", CHAT_ATTACHMENT_BUCKET)
      .eq("storage_path", storagePath)
      .limit(1)
      .maybeSingle();
    if (existingResult.error) chatFail(existingResult.error);
    let row =
      existingResult.data && typeof existingResult.data === "object"
        ? storedAttachmentFrom(existingResult.data as Record<string, unknown>)
        : null;

    if (row) {
      if (row.conversationId !== data.conversationId || row.createdBy !== context.userId) {
        throw new Error("You do not have access to do that.");
      }
      if (row.mimeType !== prepared.mimeType || row.byteSize !== bytes.length) {
        throw new Error("This attachment attempt does not match the previous file.");
      }
    } else {
      if ((await countRecentAttachments(context)) >= CHAT_ATTACHMENT_RATE_PER_MINUTE) {
        throw new Error("You are attaching files too quickly. Wait a moment and try again.");
      }
      const inserted = await chatFrom(context, "chat_attachments")
        .insert({
          conversation_id: data.conversationId,
          storage_bucket: CHAT_ATTACHMENT_BUCKET,
          storage_path: storagePath,
          original_filename: prepared.filename,
          mime_type: prepared.mimeType,
          byte_size: bytes.length,
          scan_status: "PENDING",
          message_id: null,
          created_by: context.userId,
        })
        .select("id, message_id, mime_type, byte_size, scan_status, conversation_id, created_by")
        .maybeSingle();
      if (inserted.error) {
        if (!isUniqueViolation(inserted.error)) chatFail(inserted.error);
      } else if (inserted.data && typeof inserted.data === "object") {
        row = storedAttachmentFrom(inserted.data as Record<string, unknown>);
      }
      if (!row) {
        const raced = await chatFrom(context, "chat_attachments")
          .select("id, message_id, mime_type, byte_size, scan_status, conversation_id, created_by")
          .eq("storage_bucket", CHAT_ATTACHMENT_BUCKET)
          .eq("storage_path", storagePath)
          .limit(1)
          .maybeSingle();
        if (raced.error) chatFail(raced.error);
        row =
          raced.data && typeof raced.data === "object"
            ? storedAttachmentFrom(raced.data as Record<string, unknown>)
            : null;
      }
      if (!row || row.createdBy !== context.userId) throw new Error("You do not have access to do that.");
    }

    const uploaded = await supabaseAdmin.storage.from(CHAT_ATTACHMENT_BUCKET).upload(storagePath, bytes, {
      contentType: prepared.mimeType,
      upsert: false,
    });
    if (uploaded.error && !storageAlreadyExists(uploaded.error)) {
      if (storageMissing(uploaded.error)) throw new Error("Attachments are not available yet.");
      throw new Error("That file could not be stored.");
    }

    await markAttachmentSkipped(row.id);
    const fresh = await readOwnAttachment(context, row.id);
    return {
      id: row.id,
      scanStatus: fresh?.scanStatus ?? "PENDING",
      messageId: fresh?.messageId ?? row.messageId,
    };
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Creates one IMAGE, VIDEO, AUDIO, DOCUMENT, or VOICE_NOTE message, then sets
 * message_id on the caller's attachment rows. A voice note is exactly one
 * audio/webm or audio/mp4 attachment and may omit the caption. Retries with the
 * same clientMessageId return the existing visible message, do not insert
 * another, and do not notify again. Does not read chat_messages.body. Does not put attachment ids in metadata.
 * Does not set scan_status. SKIPPED stays in prepareChatAttachment.
 */
export const sendAttachmentMessage = createSafeAuthenticatedAction(
  sendAttachmentMessageSchema,
  async (data, context) => {
    if (!chatAttachmentCountAllowed(data.attachmentIds.length)) {
      throw new Error("You can attach up to 5 files.");
    }
    if (data.replyToMessageId) {
      const reply = await visibleMessageRow(context, data.replyToMessageId, data.conversationId);
      if (!reply || text(reply.conversation_id) !== data.conversationId) {
        throw new Error("You cannot reply to that message.");
      }
    }

    const loaded: StoredAttachment[] = [];
    for (const attachmentId of data.attachmentIds) {
      const row = await readOwnAttachment(context, attachmentId);
      if (!row || row.createdBy !== context.userId || row.conversationId !== data.conversationId) {
        throw new Error("You do not have access to do that.");
      }
      if (row.scanStatus === "REJECTED") throw new Error("That file was rejected.");
      loaded.push(row);
    }

    const mimeTypes = loaded.map((row) => row.mimeType);
    const voiceType = data.voiceNote ? chatVoiceNoteMessageType(mimeTypes) : null;
    if (data.voiceNote && !voiceType) throw new Error("That file type is not supported.");

    let createdId: string | null = null;
    let messageType = "DOCUMENT";
    const caption = data.body && data.body.trim().length > 0 ? data.body.trim() : null;
    let messageId = (await visibleByClientId(context, data.conversationId, data.clientMessageId))?.id ?? null;
    if (!messageId) {
      await assertRecentMessageRate(context);
      const type = voiceType ?? chatMessageTypeForMimes(mimeTypes);
      if (!type) throw new Error("That file type is not supported.");
      messageType = type;
      const inserted = await chatFrom(context, "chat_messages")
        .insert({
          conversation_id: data.conversationId,
          type,
          body: caption,
          client_message_id: data.clientMessageId,
          ...(data.replyToMessageId ? { reply_to_message_id: data.replyToMessageId } : {}),
        })
        .select("id")
        .maybeSingle();
      if (inserted.error) {
        if (!isClientMessageConflict(inserted.error)) chatFail(inserted.error);
      } else if (inserted.data && typeof inserted.data === "object") {
        messageId = text((inserted.data as Record<string, unknown>).id);
        createdId = messageId;
      }
      if (!messageId) {
        messageId = (await visibleByClientId(context, data.conversationId, data.clientMessageId))?.id ?? null;
      }
    }
    if (!messageId) throw new Error("You cannot send a message in this conversation.");

    for (const row of loaded) {
      if (row.scanStatus === "PENDING") await markAttachmentSkipped(row.id);
    }
    await bindAttachments(context, data.conversationId, messageId, data.attachmentIds);
    const visible = await visibleByClientId(context, data.conversationId, data.clientMessageId);
    if (!visible) throw new Error("You cannot send a message in this conversation.");
    if (createdId) {
      await notifyChatMessage(context, {
        conversationId: data.conversationId,
        messageId: createdId,
        body: caption,
        messageType,
        mentionUserIds: data.mentionUserIds,
      });
    }
    return visible;
  },
  { auth: { capability: "chat.send" } },
);

/** Signed URL for an attachment row the caller can already select. Never a public URL. */
export const getChatAttachmentUrl = createSafeAuthenticatedAction(
  attachmentUrlSchema,
  async (data, context) => {
    const result = await chatFrom(context, "chat_attachments")
      .select("id, storage_bucket, storage_path")
      .eq("id", data.attachmentId)
      .limit(1)
      .maybeSingle();
    if (result.error) chatFail(result.error);
    const row =
      result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : null;
    const storagePath = text(row?.storage_path);
    const bucket = text(row?.storage_bucket);
    if (!row || !storagePath || bucket !== CHAT_ATTACHMENT_BUCKET || storagePath.includes("..") || storagePath.includes("\\")) {
      throw new Error("You do not have access to do that.");
    }
    const signed = await supabaseAdmin.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .createSignedUrl(storagePath, CHAT_ATTACHMENT_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Attachments are not available yet.");
    return { url: signed.data.signedUrl, expiresIn: CHAT_ATTACHMENT_URL_SECONDS };
  },
  { auth: { capability: "chat.view" } },
);

/**
 * Keyset page from chat_messages_visible. Includes text, file, and shared-record messages.
 * The view body is null when content is masked. Newest page first in the query,
 * chronological order in the response. No OFFSET.
 * Reply snippets are one lookup for ids on this page. Reactions are grouped counts.
 * Attachment rows are loaded from chat_attachments, not from message metadata.
 */
export const listMessages = createSafeAuthenticatedAction(
  listMessagesSchema,
  async (data, context) => {
    let query = chatFrom(context, "chat_messages_visible")
      .select(VISIBLE_MESSAGE_COLUMNS)
      .eq("conversation_id", data.conversationId)
      .in("type", [...CHAT_THREAD_MESSAGE_TYPES]);
    if (data.cursor) query = query.or(chatKeysetFilter(data.cursor));
    else if (data.through) query = query.or(chatKeysetThroughFilter(data.through));
    const rows = await readRows(
      query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(data.limit + 1),
    );
    const hasMore = rows.length > data.limit;
    const messages = await withThreadExtras(
      context,
      rows
        .slice(0, data.limit)
        .map(messageFrom)
        .filter((row): row is ChatTextMessage => row != null)
        .reverse(),
    );
    const oldest = messages[0];
    const page: ChatMessagePage = {
      messages,
      nextCursor: hasMore && oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null,
    };
    return page;
  },
  { auth: { capability: "chat.view" } },
);

/**
 * Advances the caller's conversation cursor. Ignores a target that is not newer.
 * The message id is checked on chat_messages_visible (id, created_at, conversation_id only).
 */
export const markConversationRead = createSafeAuthenticatedAction(
  markConversationReadSchema,
  async (data, context) => {
    const target = await visibleMessageRow(context, data.lastReadMessageId, data.conversationId);
    const targetId = text(target?.id);
    const targetAt = text(target?.created_at);
    if (!target || text(target.conversation_id) !== data.conversationId || !targetId || !targetAt) {
      throw new Error("You do not have access to do that.");
    }

    const currentResult = await chatFrom(context, "chat_read_states")
      .select("last_read_message_id")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (currentResult.error) chatFail(currentResult.error);
    const current =
      currentResult.data && typeof currentResult.data === "object"
        ? (currentResult.data as Record<string, unknown>)
        : null;
    const currentId = text(current?.last_read_message_id);
    let currentCursor: ChatMessageCursor | null = null;
    if (currentId) {
      const times = await visibleMessageTimes(context, [currentId]);
      const createdAt = times.get(currentId);
      if (createdAt) currentCursor = { id: currentId, createdAt };
    }
    const nextCursor = { id: targetId, createdAt: targetAt };
    if (currentCursor && !chatReadCursorAdvances(currentCursor, nextCursor)) {
      const kept: ChatReadCursorResult = {
        conversationId: data.conversationId,
        lastReadMessageId: currentCursor.id,
        advanced: false,
      };
      return kept;
    }

    const saved = await chatFrom(context, "chat_read_states")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          last_read_message_id: targetId,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "conversation_id,user_id" },
      )
      .select("conversation_id, last_read_message_id")
      .maybeSingle();
    if (saved.error) chatFail(saved.error);
    const result: ChatReadCursorResult = {
      conversationId: data.conversationId,
      lastReadMessageId: targetId,
      advanced: true,
    };
    return result;
  },
  { auth: { capability: "chat.view" } },
);

/**
 * Own cursor, plus the other member's cursor when the row is visible.
 * chat_read_states_select currently allows only user_id = auth.uid(), so peer
 * stays null until that policy lets active members read the same conversation.
 */
export const listConversationReceipt = createSafeAuthenticatedAction(
  conversationIdSchema,
  async (data, context) => {
    const rows = await readRows(
      chatFrom(context, "chat_read_states")
        .select("user_id, last_read_message_id")
        .eq("conversation_id", data.conversationId),
    );
    const mine = rows.find((row) => text(row.user_id) === context.userId) ?? null;
    const others = rows.filter((row) => {
      const userId = text(row.user_id);
      return userId != null && userId !== context.userId;
    });
    const peerRow = others.length === 1 ? others[0] : null;
    const ids = [text(mine?.last_read_message_id), text(peerRow?.last_read_message_id)].filter(
      (id): id is string => id != null,
    );
    const times = await visibleMessageTimes(context, ids);

    function cursorOf(row: Record<string, unknown> | null): ChatReceiptCursor | null {
      if (!row) return null;
      const userId = text(row.user_id);
      if (!userId) return null;
      const lastReadMessageId = text(row.last_read_message_id);
      return {
        userId,
        lastReadMessageId,
        createdAt: lastReadMessageId ? (times.get(lastReadMessageId) ?? null) : null,
      };
    }

    const receipt: ChatConversationReceipt = {
      self: cursorOf(mine),
      peer: cursorOf(peerRow),
    };
    return receipt;
  },
  { auth: { capability: "chat.view" } },
);

async function assertReactionTarget(context: AuthContext, messageId: string): Promise<string> {
  const row = await visibleMessageRow(context, messageId);
  const conversationId = text(row?.conversation_id);
  if (!row || !conversationId) throw new Error("You do not have access to do that.");
  return conversationId;
}

export const addReaction = createSafeAuthenticatedAction(
  addReactionSchema,
  async (data, context) => {
    const conversationId = await assertReactionTarget(context, data.messageId);
    const since = new Date(Date.now() - 60_000).toISOString();
    const recent = await readRows(
      chatFrom(context, "chat_reactions")
        .select("emoji")
        .eq("user_id", context.userId)
        .gte("created_at", since)
        .limit(CHAT_REACTION_RATE_PER_MINUTE + 1),
    );
    if (recent.length >= CHAT_REACTION_RATE_PER_MINUTE) {
      throw new Error("You are adding reactions too quickly. Wait a moment and try again.");
    }

    const inserted = await chatFrom(context, "chat_reactions")
      .insert({
        message_id: data.messageId,
        conversation_id: conversationId,
        emoji: data.emoji,
        user_id: context.userId,
      })
      .select("message_id")
      .maybeSingle();
    if (inserted.error && !isUniqueViolation(inserted.error)) chatFail(inserted.error);
    return { messageId: data.messageId, emoji: data.emoji };
  },
  { auth: { capability: "chat.send" } },
);

export const removeReaction = createSafeAuthenticatedAction(
  removeReactionSchema,
  async (data, context) => {
    await assertReactionTarget(context, data.messageId);
    const removed = await chatFrom(context, "chat_reactions")
      .delete()
      .eq("message_id", data.messageId)
      .eq("emoji", data.emoji)
      .eq("user_id", context.userId);
    if (removed.error) chatFail(removed.error);
    return { messageId: data.messageId, emoji: data.emoji };
  },
  { auth: { capability: "chat.send" } },
);

const CHAT_SEARCH_SCOPE_CAP = 200;
const SEARCH_MESSAGE_COLUMNS = "id, conversation_id, sender_id, type, created_at, body";

export type ChatSearchConversation = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  sensitive: boolean;
};

export type ChatSearchMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  createdAt: string;
  snippet: string;
};

export type ChatSearchFile = {
  id: string;
  messageId: string | null;
  conversationId: string;
  filename: string;
  mimeType: string;
  createdAt: string;
  messageCreatedAt: string | null;
};

export type ChatSearchResult = {
  conversations: ChatSearchConversation[];
  messages: ChatSearchMessage[];
  people: ChatDirectoryPerson[];
  files: ChatSearchFile[];
};

export type ChatPinnedMessage = {
  messageId: string;
  conversationId: string;
  pinnedAt: string;
  createdAt: string;
  senderId: string;
  type: string;
  snippet: string | null;
};

export type ChatSavedMessage = {
  messageId: string;
  conversationId: string;
  savedAt: string;
  createdAt: string;
  senderId: string;
  type: string;
  snippet: string | null;
};

export type ChatJumpTarget = {
  messageId: string;
  conversationId: string;
  createdAt: string;
  snippet: string;
};

type ChatSearchScope = { conversationIds: string[] | null };

function applyCreatedRange(query: ChatBuilder, from: string | null, to: string | null): ChatBuilder {
  let next = query;
  if (from) next = next.gte("created_at", from);
  if (to) next = next.lte("created_at", to);
  return next;
}

function applyIdScope(query: ChatBuilder, scope: ChatSearchScope, column: "id" | "conversation_id"): ChatBuilder | null {
  if (scope.conversationIds == null) return query;
  if (scope.conversationIds.length === 0) return null;
  return query.in(column, scope.conversationIds);
}

function directoryPersonFrom(
  row: Record<string, unknown>,
  callerId: string,
  seen: Set<string>,
): ChatDirectoryPerson | null {
  const id = text(row.id);
  const userId = text(row.user_id);
  const employeeCode = text(row.employee_code);
  const email = text(row.email);
  if (!id || !userId) return null;
  if (userId === callerId || seen.has(userId)) return null;
  seen.add(userId);
  return {
    id,
    userId,
    fullName: directoryDisplayName(text(row.full_name), email, employeeCode),
    employeeCode,
    jobTitle: text(row.job_title),
    locationId: text(row.location_id),
    email,
    departmentId: null,
    departmentName: null,
    departmentIds: [],
  };
}

function plainSnippet(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const snippet = chatSearchSnippet(value);
  return snippet.length > 0 ? snippet : null;
}

async function conversationScope(
  context: AuthContext,
  data: { conversationId?: string; locationId?: string; departmentId?: string },
): Promise<ChatSearchScope> {
  if (!data.conversationId && !data.locationId && !data.departmentId) return { conversationIds: null };
  let query = chatFrom(context, "chat_conversations").select("id").is("deleted_at", null);
  if (data.conversationId) query = query.eq("id", data.conversationId);
  if (data.locationId) query = query.eq("location_id", data.locationId);
  if (data.departmentId) query = query.eq("department_id", data.departmentId);
  const rows = await readRows(query.order("updated_at", { ascending: false }).limit(CHAT_SEARCH_SCOPE_CAP));
  return {
    conversationIds: rows.map((row) => text(row.id)).filter((id): id is string => id != null),
  };
}

/**
 * Authorized search. Every query uses the caller client, so RLS is the scope.
 * Sensitive rooms are returned only when that policy already allows the row.
 * Message text is read from chat_messages_visible and reduced to a snippet.
 */
export const searchChat = createSafeAuthenticatedAction(
  searchChatSchema,
  async (data, context) => {
    const pattern = chatSearchLikePattern(data.query);
    const ilikeValue = chatSearchIlikeValue(data.query);
    if (!pattern || !ilikeValue) throw new Error("Type at least 2 characters.");
    const from = data.from ? chatSearchDateBound(data.from, "from") : null;
    const to = data.to ? chatSearchDateBound(data.to, "to") : null;
    const scope = await conversationScope(context, data);
    const limit = data.limit;

    const [conversations, messages, people, files] = await Promise.all([
      searchConversations(context, pattern, scope, from, to, limit),
      searchMessages(context, ilikeValue, scope, data, from, to, limit),
      searchPeople(context, pattern, data.conversationId, scope, limit),
      searchFiles(context, ilikeValue, scope, data.fileType, from, to, limit),
    ]);

    const result: ChatSearchResult = { conversations, messages, people, files };
    return result;
  },
  { auth: { capability: "chat.view" } },
);

async function searchConversations(
  context: AuthContext,
  pattern: string,
  scope: ChatSearchScope,
  from: string | null,
  to: string | null,
  limit: number,
): Promise<ChatSearchConversation[]> {
  const scoped = applyIdScope(
    applyCreatedRange(
      chatFrom(context, "chat_conversations")
        .select("id, kind, title, description, sensitive")
        .is("deleted_at", null)
        .or(`title.ilike.${pattern},description.ilike.${pattern}`),
      from,
      to,
    ),
    scope,
    "id",
  );
  if (!scoped) return [];
  const rows = await readRows(scoped.order("updated_at", { ascending: false }).limit(limit));
  const directIds = rows
    .filter((row) => text(row.kind) === "DIRECT")
    .map((row) => text(row.id))
    .filter((id): id is string => id != null);
  const peers = await directPeers(context, directIds);
  return rows.flatMap((row) => {
    const id = text(row.id);
    const kind = text(row.kind);
    if (!id || !kind) return [];
    const stored = plainSnippet(row.title);
    const peerName = peers.get(id)?.name ?? null;
    const title = kind === "DIRECT" && peerName ? peerName : stored;
    const description = plainSnippet(row.description);
    const item: ChatSearchConversation = {
      id,
      kind,
      title,
      description,
      sensitive: row.sensitive === true,
    };
    return [item];
  });
}

async function searchMessages(
  context: AuthContext,
  ilikeValue: string,
  scope: ChatSearchScope,
  data: { senderId?: string; fileType?: ChatSearchFileType },
  from: string | null,
  to: string | null,
  limit: number,
): Promise<ChatSearchMessage[]> {
  const scoped = applyIdScope(
    applyCreatedRange(
      chatFrom(context, "chat_messages_visible")
        .select(SEARCH_MESSAGE_COLUMNS)
        .not("body", "is", null)
        .ilike("body", ilikeValue),
      from,
      to,
    ),
    scope,
    "conversation_id",
  );
  if (!scoped) return [];
  let query = scoped;
  if (data.senderId) query = query.eq("sender_id", data.senderId);
  if (data.fileType) query = query.in("type", chatSearchMessageTypes(data.fileType));
  const rows = await readRows(
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
  );
  return rows.flatMap((row) => {
    const id = text(row.id);
    const conversationId = text(row.conversation_id);
    const senderId = text(row.sender_id);
    const typeName = text(row.type);
    const createdAt = text(row.created_at);
    const snippet = plainSnippet(row.body);
    if (!id || !conversationId || !senderId || !typeName || !createdAt || !snippet) return [];
    const item: ChatSearchMessage = { id, conversationId, senderId, type: typeName, createdAt, snippet };
    return [item];
  });
}

async function searchPeople(
  context: AuthContext,
  pattern: string,
  conversationId: string | undefined,
  scope: ChatSearchScope,
  limit: number,
): Promise<ChatDirectoryPerson[]> {
  let memberIds: string[] | null = null;
  if (conversationId) {
    if (!scope.conversationIds || scope.conversationIds.length === 0) return [];
    const members = await readRows(
      chatFrom(context, "chat_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .is("left_at", null)
        .limit(CHAT_SEARCH_SCOPE_CAP),
    );
    memberIds = members.map((row) => text(row.user_id)).filter((id): id is string => id != null);
    if (memberIds.length === 0) return [];
  }
  let query = chatFrom(context, "staff")
    .select("id, user_id, full_name, email, employee_code, job_title, location_id")
    .is("deleted_at", null)
    .not("user_id", "is", null)
    .or(`full_name.ilike.${pattern},employee_code.ilike.${pattern},job_title.ilike.${pattern}`)
    .order("full_name", { ascending: true })
    .limit(limit);
  if (memberIds) query = query.in("user_id", memberIds);
  const rows = await readRows(query);
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const person = directoryPersonFrom(row, context.userId, seen);
    return person ? [person] : [];
  });
}

async function searchFiles(
  context: AuthContext,
  ilikeValue: string,
  scope: ChatSearchScope,
  fileType: ChatSearchFileType | undefined,
  from: string | null,
  to: string | null,
  limit: number,
): Promise<ChatSearchFile[]> {
  const scoped = applyIdScope(
    applyCreatedRange(
      chatFrom(context, "chat_attachments")
        .select("id, message_id, conversation_id, original_filename, mime_type, created_at")
        .ilike("original_filename", ilikeValue),
      from,
      to,
    ),
    scope,
    "conversation_id",
  );
  if (!scoped) return [];
  let query = scoped;
  if (fileType) {
    const prefixes = chatSearchMimePrefixes(fileType);
    query = prefixes.length === 1 ? query.ilike("mime_type", `${prefixes[0]}%`) : query.or(chatSearchMimeOrFilter(fileType));
  }
  const rows = await readRows(query.order("created_at", { ascending: false }).limit(limit));
  const messageIds = rows.map((row) => text(row.message_id)).filter((id): id is string => id != null);
  const visible = await visibleMessageTimes(context, messageIds);
  return rows.flatMap((row) => {
    const id = text(row.id);
    const conversationId = text(row.conversation_id);
    const filename = plainSnippet(row.original_filename);
    const mimeType = text(row.mime_type);
    const createdAt = text(row.created_at);
    if (!id || !conversationId || !filename || !mimeType || !createdAt) return [];
    const messageId = text(row.message_id);
    const item: ChatSearchFile = {
      id,
      messageId,
      conversationId,
      filename,
      mimeType,
      createdAt,
      messageCreatedAt: messageId ? (visible.get(messageId) ?? null) : null,
    };
    return [item];
  });
}

type VisibleSnippet = {
  conversationId: string;
  senderId: string;
  type: string;
  createdAt: string;
  snippet: string | null;
};

async function visibleSnippets(context: AuthContext, ids: string[]): Promise<Map<string, VisibleSnippet>> {
  const found = new Map<string, VisibleSnippet>();
  if (ids.length === 0) return found;
  const rows = await inChunks(ids, (slice) =>
    readRows(
      chatFrom(context, "chat_messages_visible").select(SEARCH_MESSAGE_COLUMNS).in("id", slice),
    ),
  );
  for (const row of rows) {
    const id = text(row.id);
    const conversationId = text(row.conversation_id);
    const senderId = text(row.sender_id);
    const typeName = text(row.type);
    const createdAt = text(row.created_at);
    if (!id || !conversationId || !senderId || !typeName || !createdAt) continue;
    found.set(id, {
      conversationId,
      senderId,
      type: typeName,
      createdAt,
      snippet: plainSnippet(row.body),
    });
  }
  return found;
}

async function assertVisibleMessage(context: AuthContext, messageId: string): Promise<{ id: string; conversationId: string }> {
  const row = await visibleMessageRow(context, messageId);
  const id = text(row?.id);
  const conversationId = text(row?.conversation_id);
  if (!row || !id || !conversationId) throw new Error("You do not have access to do that.");
  return { id, conversationId };
}

export const pinMessage = createSafeAuthenticatedAction(
  chatMessageTargetSchema,
  async (data, context) => {
    const message = await assertVisibleMessage(context, data.messageId);
    const inserted = await chatFrom(context, "chat_pins")
      .insert({
        conversation_id: message.conversationId,
        message_id: message.id,
        pinned_by: context.userId,
      })
      .select("message_id")
      .maybeSingle();
    if (inserted.error && !isUniqueViolation(inserted.error)) chatFail(inserted.error);
    return { messageId: message.id, conversationId: message.conversationId };
  },
  { auth: { capability: "chat.view" } },
);

export const unpinMessage = createSafeAuthenticatedAction(
  chatMessageTargetSchema,
  async (data, context) => {
    const message = await assertVisibleMessage(context, data.messageId);
    const removed = await chatFrom(context, "chat_pins")
      .delete()
      .eq("conversation_id", message.conversationId)
      .eq("message_id", message.id)
      .select("message_id")
      .maybeSingle();
    if (removed.error) chatFail(removed.error);
    if (!removed.data) throw new Error("You do not have access to do that.");
    return { messageId: message.id, conversationId: message.conversationId };
  },
  { auth: { capability: "chat.view" } },
);

export const saveMessage = createSafeAuthenticatedAction(
  chatMessageTargetSchema,
  async (data, context) => {
    const message = await assertVisibleMessage(context, data.messageId);
    const inserted = await chatFrom(context, "chat_saved_messages")
      .insert({
        user_id: context.userId,
        message_id: message.id,
        conversation_id: message.conversationId,
      })
      .select("message_id")
      .maybeSingle();
    if (inserted.error && !isUniqueViolation(inserted.error)) chatFail(inserted.error);
    return { messageId: message.id, conversationId: message.conversationId };
  },
  { auth: { capability: "chat.view" } },
);

export const unsaveMessage = createSafeAuthenticatedAction(
  chatMessageTargetSchema,
  async (data, context) => {
    const message = await assertVisibleMessage(context, data.messageId);
    const removed = await chatFrom(context, "chat_saved_messages")
      .delete()
      .eq("user_id", context.userId)
      .eq("message_id", message.id)
      .select("message_id")
      .maybeSingle();
    if (removed.error) chatFail(removed.error);
    if (!removed.data) throw new Error("You do not have access to do that.");
    return { messageId: message.id };
  },
  { auth: { capability: "chat.view" } },
);

export const listPins = createSafeAuthenticatedAction(
  conversationIdSchema,
  async (data, context) => {
    const pins = await readRows(
      chatFrom(context, "chat_pins")
        .select("message_id, conversation_id, pinned_at")
        .eq("conversation_id", data.conversationId)
        .order("pinned_at", { ascending: false })
        .limit(CHAT_SEARCH_LIMIT_MAX),
    );
    const snippets = await visibleSnippets(
      context,
      pins.map((row) => text(row.message_id)).filter((id): id is string => id != null),
    );
    return pins.flatMap((row) => {
      const messageId = text(row.message_id);
      const conversationId = text(row.conversation_id);
      const pinnedAt = text(row.pinned_at);
      const visible = messageId ? snippets.get(messageId) : undefined;
      if (!messageId || !conversationId || !pinnedAt || !visible) return [];
      const item: ChatPinnedMessage = {
        messageId,
        conversationId,
        pinnedAt,
        createdAt: visible.createdAt,
        senderId: visible.senderId,
        type: visible.type,
        snippet: visible.snippet,
      };
      return [item];
    });
  },
  { auth: { capability: "chat.view" } },
);

export const listSaved = createSafeAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const saved = await readRows(
      chatFrom(context, "chat_saved_messages")
        .select("message_id, conversation_id, saved_at")
        .eq("user_id", context.userId)
        .order("saved_at", { ascending: false })
        .limit(CHAT_SEARCH_LIMIT_MAX),
    );
    const snippets = await visibleSnippets(
      context,
      saved.map((row) => text(row.message_id)).filter((id): id is string => id != null),
    );
    return saved.flatMap((row) => {
      const messageId = text(row.message_id);
      const conversationId = text(row.conversation_id);
      const savedAt = text(row.saved_at);
      const visible = messageId ? snippets.get(messageId) : undefined;
      if (!messageId || !conversationId || !savedAt || !visible) return [];
      if (visible.conversationId !== conversationId) return [];
      const item: ChatSavedMessage = {
        messageId,
        conversationId,
        savedAt,
        createdAt: visible.createdAt,
        senderId: visible.senderId,
        type: visible.type,
        snippet: visible.snippet,
      };
      return [item];
    });
  },
  { defaultInput: {}, auth: { capability: "chat.view" } },
);

const createActionFromMessageSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  action: z.enum(CHAT_ACTION_KINDS),
  locationId: z.string().uuid().optional(),
  incidentCategory: z.enum(INCIDENT_TYPES).optional(),
  incidentSeverity: z.enum(CHAT_INCIDENT_SEVERITIES).optional(),
  taskCategory: z.enum(CHAT_FACILITY_CATEGORIES).optional(),
  taskDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  handoverShift: z.enum(CHAT_HANDOVER_SHIFTS).optional(),
  reminderOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ChatActionFromMessageResult = {
  label: string;
  href: string | null;
};

/**
 * Reads the message from chat_messages_visible. Does not select chat_messages.body.
 * Creates through the module action, which checks that module's capability.
 * Shares with shareEntityInChat (FEC_ENTITY) only when that path accepts the row.
 * Does not insert a SYSTEM message.
 */
async function visibleActionBody(context: AuthContext, messageId: string, conversationId: string): Promise<string> {
  const result = await chatFrom(context, "chat_messages_visible")
    .select("id, conversation_id, body, content_hidden")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") throw new Error("You do not have access to do that.");
  const row = result.data as Record<string, unknown>;
  if (row.content_hidden === true || typeof row.body !== "string" || row.body.length === 0) {
    throw new Error("That message has no text to copy.");
  }
  return row.body;
}

async function resolveActionLocation(
  context: AuthContext,
  conversationId: string,
  chosenLocationId: string | undefined,
): Promise<string> {
  if (chosenLocationId) {
    await assertLocationAccess(context, chosenLocationId);
    return chosenLocationId;
  }
  const room = await conversationNotice(context, conversationId);
  if (!room.locationId) throw new Error("Choose a location.");
  await assertLocationAccess(context, room.locationId);
  return room.locationId;
}

async function shareCreatedRecord(
  conversationId: string,
  action: ChatShareableEntityType,
  entityId: string,
): Promise<void> {
  try {
    await shareEntityInChat({
      conversationId,
      entityType: action,
      entityId,
      clientMessageId: crypto.randomUUID(),
    });
  } catch {
    // The record already exists. A refused share still leaves the toast.
  }
}

export const createActionFromMessage = createSafeAuthenticatedAction(
  createActionFromMessageSchema,
  async (data, context): Promise<ChatActionFromMessageResult> => {
    const body = await visibleActionBody(context, data.messageId, data.conversationId);
    const prefill = chatActionPrefill(data.action, body);
    if (!prefill) throw new Error("That message has no text to copy.");
    if (prefill.kind === "REMINDER") {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
      if (!data.reminderOn || chatReminderDateIssue(data.reminderOn, today)) {
        throw new Error("Choose a reminder date.");
      }
      const { error } = await supabaseAdmin.from("planned_notifications").insert({
        user_id: context.userId,
        reminder_type: "general",
        title: prefill.title,
        body: prefill.body,
        source_type: "chat_message",
        source_id: data.messageId,
        due_date: data.reminderOn,
        scheduled_for: reminderScheduledFor(data.reminderOn),
        status: "pending",
      });
      if (error) throw new Error(error.message);
      return { label: data.reminderOn, href: "/notifications" };
    }
    const locationId = await resolveActionLocation(context, data.conversationId, data.locationId);

    let entityId = "";
    let label = "";
    if (prefill.kind === "MAINTENANCE_TICKET") {
      const created = await createIssue({
        location_id: locationId,
        title: prefill.title,
        description: prefill.description,
      });
      entityId = created.id;
      label = `MT-${chatEntityShortId(entityId)}`;
    } else if (prefill.kind === "INCIDENT") {
      if (!data.incidentCategory) throw new Error("Choose an incident type.");
      if (!data.incidentSeverity) throw new Error("Choose a severity.");
      const created = await createDailyOpsIncident({
        location_id: locationId,
        occurred_at: new Date().toISOString(),
        category: data.incidentCategory,
        severity: data.incidentSeverity,
        summary: prefill.summary,
        detail: prefill.detail,
      });
      entityId = created.id;
      label = created.reference;
    } else if (prefill.kind === "TASK") {
      if (!data.taskCategory) throw new Error("Choose a task category.");
      const created = await upsertFacilityTask({
        locationId,
        category: data.taskCategory,
        title: prefill.title,
        description: prefill.description,
        ...(data.taskDueDate ? { dueDate: data.taskDueDate } : {}),
      });
      return { label: `TASK-${chatEntityShortId(created.id)}`, href: "/facility" };
    } else if (prefill.kind === "HANDOVER") {
      if (!data.handoverShift) throw new Error("Choose a shift.");
      const briefingDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Qatar",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const existing = await context.supabase
        .from("shift_briefings")
        .select("id, supervisor_name, staff_scheduled, staff_present, key_notes, handover_items")
        .eq("location_id", locationId)
        .eq("briefing_date", briefingDate)
        .eq("shift", data.handoverShift)
        .limit(1)
        .maybeSingle();
      if (existing.error || !existing.data) {
        throw new Error("There is no shift briefing for that location and shift today.");
      }
      const previous = (existing.data.handover_items ?? "").trim();
      const next = previous.length > 0 ? `${previous}\n- ${prefill.note}` : `- ${prefill.note}`;
      if (Array.from(next).length > 4000) throw new Error("The handover notes are full.");
      await upsertShiftBriefing({
        id: existing.data.id,
        briefing_date: briefingDate,
        location_id: locationId,
        shift: data.handoverShift,
        supervisor_name: existing.data.supervisor_name,
        staff_scheduled: existing.data.staff_scheduled,
        staff_present: existing.data.staff_present,
        key_notes: existing.data.key_notes,
        handover_items: next,
      });
      return { label: data.handoverShift, href: "/daily-ops/briefings" };
    } else {
      const created = await savePurchaseRequisition({
        location_id: locationId,
        title: prefill.title,
        justification: prefill.justification,
        lines: [{ name: prefill.lineName, qty: 1, unit_price: 0 }],
      });
      entityId = created.id;
      const card = await previewEntity(context, "PURCHASE_REQUEST", entityId);
      label = card?.code ?? `PR-${chatEntityShortId(entityId)}`;
    }

    const href = chatEntityHref(prefill.kind, entityId);
    const readable = await previewEntity(context, prefill.kind, entityId);
    if (readable) await shareCreatedRecord(data.conversationId, prefill.kind, entityId);
    return { label, href };
  },
  { auth: { capability: "chat.view" } },
);

export type ChatCallSummary = {
  id: string;
  conversationId: string;
  kind: ChatCallKind;
  status: ChatCallStatus;
  startedAt: string;
  startedBy: string;
};

export type ChatCallHistoryItem = {
  id: string;
  kind: ChatCallKind;
  status: ChatCallStatus;
  startedAt: string;
  endedAt: string | null;
  startedBy: string;
  /** Ringing, started by someone else, and this member has no participant row yet. */
  awaitingViewer: boolean;
};

export type ChatCallTokenResult =
  | { state: "unconfigured"; code: "CALL_PROVIDER_UNCONFIGURED" }
  | {
      state: "issued";
      session: {
        provider: "none" | "livekit";
        roomName: string;
        token: string;
        expiresAt: string;
        serverUrl?: string;
      };
    };

const CALL_HISTORY_LIMIT = 20;

function asCallStatus(value: string | null): ChatCallStatus | null {
  if (value == null) return null;
  return CHAT_CALL_STATUSES.includes(value as ChatCallStatus) ? (value as ChatCallStatus) : null;
}

function asCallKind(value: string | null): ChatCallKind | null {
  return value === "VOICE" || value === "VIDEO" ? value : null;
}

async function assertActiveChatMember(context: AuthContext, conversationId: string): Promise<void> {
  try {
    await assertChatMember(context, conversationId);
  } catch (error) {
    if (error instanceof ChatForbiddenError) throw new Error("You do not have access to do that.");
    throw error;
  }
}

async function assertCanStartCall(context: AuthContext, conversationId: string): Promise<void> {
  try {
    await assertChatCanCall(context, conversationId);
  } catch (error) {
    if (error instanceof ChatForbiddenError) throw new Error("You do not have access to do that.");
    throw error;
  }
}

async function loadCall(context: AuthContext, callId: string): Promise<Record<string, unknown> | null> {
  const result = await chatFrom(context, "chat_calls")
    .select("id, conversation_id, kind, status, started_by, started_at, ended_at")
    .eq("id", callId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return null;
  return result.data as Record<string, unknown>;
}

function summaryFromCall(row: Record<string, unknown>): ChatCallSummary {
  const id = text(row.id);
  const conversationId = text(row.conversation_id);
  const kind = asCallKind(text(row.kind));
  const status = asCallStatus(text(row.status));
  const startedAt = text(row.started_at);
  const startedBy = text(row.started_by);
  if (!id || !conversationId || !kind || !status || !startedAt || !startedBy) {
    throw new Error("Chat request failed.");
  }
  return { id, conversationId, kind, status, startedAt, startedBy };
}

async function viewerHasCallRow(context: AuthContext, callId: string): Promise<boolean> {
  const result = await chatFrom(context, "chat_call_participants")
    .select("call_id")
    .eq("call_id", callId)
    .eq("user_id", context.userId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  return result.data != null;
}

async function viewerAcceptedCall(context: AuthContext, callId: string): Promise<boolean> {
  const result = await chatFrom(context, "chat_call_participants")
    .select("outcome")
    .eq("call_id", callId)
    .eq("user_id", context.userId)
    .limit(1)
    .maybeSingle();
  if (result.error) chatFail(result.error);
  if (!result.data || typeof result.data !== "object") return false;
  return text((result.data as Record<string, unknown>).outcome) === "ACCEPTED";
}

/**
 * Metadata only. provider stays NONE. recording_enabled is not sent.
 * The starter participant outcome is JOINED, which chat_call_participants_outcome_chk allows.
 */
export const startCall = createSafeAuthenticatedAction(
  startCallSchema,
  async (data, context): Promise<ChatCallSummary> => {
    await assertActiveChatMember(context, data.conversationId);
    await assertCanStartCall(context, data.conversationId);
    const inserted = await chatFrom(context, "chat_calls")
      .insert(chatCallInsertValues(data.conversationId, data.kind, context.userId))
      .select("id, conversation_id, kind, status, started_by, started_at")
      .maybeSingle();
    if (inserted.error) chatFail(inserted.error);
    if (!inserted.data || typeof inserted.data !== "object") throw new Error("You do not have access to do that.");
    const call = summaryFromCall(inserted.data as Record<string, unknown>);
    const participant = await chatFrom(context, "chat_call_participants")
      .insert({
        ...chatCallParticipantValues(call.id, context.userId, CHAT_CALL_STARTER_OUTCOME),
        joined_at: new Date().toISOString(),
      })
      .select("call_id")
      .maybeSingle();
    if (participant.error || participant.data == null) {
      await chatFrom(context, "chat_calls")
        .update(chatCallCloseValues("CANCELLED"))
        .eq("id", call.id)
        .eq("status", "RINGING")
        .eq("started_by", context.userId);
      if (participant.error) chatFail(participant.error);
      throw new Error("Chat request failed.");
    }
    return call;
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Active member only. ACCEPT writes participant outcome ACCEPTED.
 * REJECT writes REJECTED and does not issue a token.
 * Call status REJECTED is not appropriate for the user-scoped client:
 * chat_calls_update and chat_tg_calls_auth only allow CANCELLED or ENDED.
 * Participant rows cannot be updated, and a row for another user cannot be inserted.
 */
export const respondCall = createSafeAuthenticatedAction(
  respondCallSchema,
  async (data, context): Promise<{ callId: string; outcome: "ACCEPTED" | "REJECTED" }> => {
    const row = await loadCall(context, data.callId);
    if (!row) throw new Error("You do not have access to do that.");
    const call = summaryFromCall(row);
    await assertActiveChatMember(context, call.conversationId);
    if (call.startedBy === context.userId) throw new Error("You started this call.");
    if (call.status !== "RINGING" && call.status !== "ACTIVE") throw new Error("That call is no longer available.");
    if (await viewerHasCallRow(context, call.id)) throw new Error("You have already responded to this call.");
    const outcome = participantOutcomeForResponse(data.response);
    const values = chatCallParticipantValues(call.id, context.userId, outcome);
    if (outcome === "ACCEPTED") values.joined_at = new Date().toISOString();
    const inserted = await chatFrom(context, "chat_call_participants").insert(values).select("call_id").maybeSingle();
    if (inserted.error) chatFail(inserted.error);
    if (inserted.data == null) throw new Error("You do not have access to do that.");
    if (data.response === "REJECT" && chatUserMaySetCallStatus("REJECTED")) {
      const updated = await readRows(
        chatFrom(context, "chat_calls")
          .update({ status: "REJECTED", provider: "NONE" })
          .eq("id", call.id)
          .select("id"),
      );
      if (updated.length === 0) throw new Error("That call can no longer be changed.");
    }
    return { callId: call.id, outcome };
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Starter only, and only while RINGING.
 * MISSED for the other participant is allowed by the outcome check, but
 * chat_can_insert_call_participant requires user_id = auth.uid() and
 * authenticated users cannot update participant rows. That outcome is not written.
 */
export const cancelCall = createSafeAuthenticatedAction(
  callIdSchema,
  async (data, context): Promise<{ callId: string; status: "CANCELLED" }> => {
    const row = await loadCall(context, data.callId);
    if (!row) throw new Error("You do not have access to do that.");
    const call = summaryFromCall(row);
    await assertActiveChatMember(context, call.conversationId);
    if (call.startedBy !== context.userId) throw new Error("Only the person who started this call can cancel it.");
    if (call.status !== "RINGING") throw new Error("That call is no longer ringing.");
    const updated = await readRows(
      chatFrom(context, "chat_calls")
        .update(chatCallCloseValues("CANCELLED"))
        .eq("id", call.id)
        .eq("status", "RINGING")
        .eq("started_by", context.userId)
        .select("id"),
    );
    if (updated.length === 0) throw new Error("That call can no longer be changed.");
    return { callId: call.id, status: "CANCELLED" };
  },
  { auth: { capability: "chat.send" } },
);

/** Starter or OWNER/ADMIN. From RINGING or ACTIVE. Sets ENDED and ended_at. */
export const endCall = createSafeAuthenticatedAction(
  callIdSchema,
  async (data, context): Promise<{ callId: string; status: "ENDED"; endedAt: string }> => {
    const row = await loadCall(context, data.callId);
    if (!row) throw new Error("You do not have access to do that.");
    const call = summaryFromCall(row);
    await assertActiveChatMember(context, call.conversationId);
    const role = await chatMemberRole(context, call.conversationId);
    const manager = role === "OWNER" || role === "ADMIN";
    if (call.startedBy !== context.userId && !manager) throw new Error("You do not have access to do that.");
    if (call.status !== "RINGING" && call.status !== "ACTIVE") throw new Error("That call has already ended.");
    const endedAt = new Date().toISOString();
    const updated = await readRows(
      chatFrom(context, "chat_calls")
        .update(chatCallCloseValues("ENDED", endedAt))
        .eq("id", call.id)
        .in("status", ["RINGING", "ACTIVE"])
        .select("id, ended_at"),
    );
    if (updated.length === 0) throw new Error("That call can no longer be changed.");
    return { callId: call.id, status: "ENDED", endedAt: text(updated[0]?.ended_at) ?? endedAt };
  },
  { auth: { capability: "chat.send" } },
);

/**
 * Token only after membership, chat_can_call, and call participation checks.
 * An unconfigured provider returns CALL_PROVIDER_UNCONFIGURED and no token.
 */
export const issueCallToken = createSafeAuthenticatedAction(
  callIdSchema,
  async (data, context): Promise<ChatCallTokenResult> => {
    const row = await loadCall(context, data.callId);
    if (!row) throw new Error("You do not have access to do that.");
    const call = summaryFromCall(row);
    await assertActiveChatMember(context, call.conversationId);
    await assertCanStartCall(context, call.conversationId);
    const starter = call.startedBy === context.userId;
    const accepted = starter ? false : await viewerAcceptedCall(context, call.id);
    if (!starter && !accepted) throw new Error("You do not have access to do that.");
    if (call.status !== "RINGING" && call.status !== "ACTIVE") throw new Error("That call has already ended.");
    const displayName = (await senderDisplayName(context)) ?? "Member";
    try {
      const session = await (await getCallProvider()).issueToken({
        roomName: chatCallRoomName(call.id),
        userId: context.userId,
        displayName,
        canPublish: true,
      });
      return { state: "issued", session };
    } catch (error) {
      if (error instanceof CallProviderUnconfiguredError) {
        return { state: "unconfigured", code: error.code };
      }
      throw new Error("Calling is not configured.");
    }
  },
  { auth: { capability: "chat.send" } },
);

/** Metadata only. No tokens, room names, or provider secrets. */
export const listCallHistory = createSafeAuthenticatedAction(
  conversationIdSchema,
  async (data, context): Promise<ChatCallHistoryItem[]> => {
    await assertActiveChatMember(context, data.conversationId);
    const rows = await readRows(
      chatFrom(context, "chat_calls")
        .select("id, kind, status, started_at, ended_at, started_by")
        .eq("conversation_id", data.conversationId)
        .order("started_at", { ascending: false })
        .limit(CALL_HISTORY_LIMIT),
    );
    const ids = rows.map((row) => text(row.id)).filter((id): id is string => id != null);
    const responded = new Set<string>();
    if (ids.length > 0) {
      const mine = await readRows(
        chatFrom(context, "chat_call_participants")
          .select("call_id")
          .eq("user_id", context.userId)
          .in("call_id", ids),
      );
      for (const row of mine) {
        const callId = text(row.call_id);
        if (callId) responded.add(callId);
      }
    }
    return rows.flatMap((row) => {
      const id = text(row.id);
      const kind = asCallKind(text(row.kind));
      const status = asCallStatus(text(row.status));
      const startedAt = text(row.started_at);
      const startedBy = text(row.started_by);
      if (!id || !kind || !status || !startedAt || !startedBy) return [];
      const item: ChatCallHistoryItem = {
        id,
        kind,
        status,
        startedAt,
        endedAt: text(row.ended_at),
        startedBy,
        awaitingViewer: status === "RINGING" && startedBy !== context.userId && !responded.has(id),
      };
      return [item];
    });
  },
  { auth: { capability: "chat.send" } },
);
