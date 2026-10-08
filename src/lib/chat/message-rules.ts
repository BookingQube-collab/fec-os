/**
 * Pure text-message rules. Postgres remains authoritative for uniqueness,
 * the keyset, membership, and the per-minute message cap.
 *
 * A retry must reuse the same client_message_id. A new id inserts another row.
 * Body and emoji are plain text. React text nodes are the XSS control.
 * Read cursors only move forward. Reaction rate limits are counted in the action.
 */
import { z } from "zod";

import { chatMentionUserIdsField } from "@/lib/chat/notification-rules";

export const CHAT_TEXT_BODY_MAX = 8000;
export const CHAT_MESSAGE_PAGE_DEFAULT = 40;
export const CHAT_MESSAGE_PAGE_MAX = 50;
export const CHAT_TEXT_RATE_PER_MINUTE = 30;
export const CHAT_TEXT_GROUP_MS = 5 * 60 * 1000;
export const CHAT_REACTION_RATE_PER_MINUTE = 60;
export const CHAT_UNREAD_CAP = 99;
export const CHAT_QUICK_EMOJI = ["👍", "❤️", "😂", "✅"] as const;

const HTML_TAG = /<\/?[a-z][^>]*>/i;
const KEYSET_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type ChatMessageCursor = {
  createdAt: string;
  id: string;
};

export type ChatTextBodyIssue = "empty" | "long" | "html";
export type ChatEmojiIssue = "empty" | "long" | "markup";
export type ChatDeliveryStatus = "uploading" | "sending" | "sent" | "failed";

export function chatTextBodyIssue(body: string): ChatTextBodyIssue | null {
  const trimmed = body.trim();
  if (trimmed.length < 1) return "empty";
  if (Array.from(trimmed).length > CHAT_TEXT_BODY_MAX) return "long";
  if (HTML_TAG.test(trimmed)) return "html";
  return null;
}

export function chatEmojiIssue(emoji: string): ChatEmojiIssue | null {
  const trimmed = emoji.trim();
  if (trimmed.length < 1) return "empty";
  if (Array.from(trimmed).length > 32) return "long";
  if (trimmed.includes("<") || trimmed.includes(">")) return "markup";
  return null;
}

/**
 * True when `next` is strictly newer than `current` in (created_at, id) order.
 * A null current cursor can always advance. An equal cursor does not.
 */
export function chatReadCursorAdvances(current: ChatMessageCursor | null, next: ChatMessageCursor): boolean {
  if (!current) return true;
  if (next.createdAt !== current.createdAt) return next.createdAt > current.createdAt;
  return next.id.toLowerCase() > current.id.toLowerCase();
}

/** True when the read cursor is the message or a newer one. */
export function chatReadCoversMessage(read: ChatMessageCursor | null, message: ChatMessageCursor): boolean {
  if (!read) return false;
  if (read.createdAt !== message.createdAt) return read.createdAt > message.createdAt;
  return read.id.toLowerCase() >= message.id.toLowerCase();
}

export function chatUnreadBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  if (count > CHAT_UNREAD_CAP) return `${CHAT_UNREAD_CAP}+`;
  return String(Math.trunc(count));
}

/** True when this row is strictly older than the cursor in (created_at DESC, id DESC). */
export function chatMessageIsBeforeCursor(row: ChatMessageCursor, cursor: ChatMessageCursor): boolean {
  if (row.createdAt !== cursor.createdAt) return row.createdAt < cursor.createdAt;
  return row.id.toLowerCase() < cursor.id.toLowerCase();
}

/**
 * PostgREST or() filter for (created_at, id) < cursor.
 * Values are quoted so ':' in timestamps cannot split the filter.
 */
export function chatKeysetFilter(cursor: ChatMessageCursor): string {
  if (!KEYSET_TIMESTAMP.test(cursor.createdAt) || !z.string().uuid().safeParse(cursor.id).success) {
    throw new Error("Chat request failed.");
  }
  const createdAt = `"${cursor.createdAt}"`;
  const id = `"${cursor.id}"`;
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

/**
 * PostgREST or() filter for (created_at, id) <= cursor.
 * The anchored message is included. Same quoting rules as the older-page filter.
 */
export function chatKeysetThroughFilter(cursor: ChatMessageCursor): string {
  if (!KEYSET_TIMESTAMP.test(cursor.createdAt) || !z.string().uuid().safeParse(cursor.id).success) {
    throw new Error("Chat request failed.");
  }
  const createdAt = `"${cursor.createdAt}"`;
  const id = `"${cursor.id}"`;
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lte.${id})`;
}

/** PostgREST or() filter for (created_at, id) > cursor. Same quoting rules as the older-page filter. */
export function chatKeysetAfterFilter(cursor: ChatMessageCursor): string {
  if (!KEYSET_TIMESTAMP.test(cursor.createdAt) || !z.string().uuid().safeParse(cursor.id).success) {
    throw new Error("Chat request failed.");
  }
  const createdAt = `"${cursor.createdAt}"`;
  const id = `"${cursor.id}"`;
  return `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`;
}

/**
 * Failed and in-flight sends keep their client id. A completed send starts a new one.
 * `nextId` is supplied by the caller so tests do not depend on random uuid generation.
 */
export function chatResolveClientMessageId(input: {
  status: ChatDeliveryStatus | null;
  clientMessageId: string | null;
  nextId: string;
}): string {
  if (
    (input.status === "failed" || input.status === "sending" || input.status === "uploading") &&
    input.clientMessageId
  ) {
    return input.clientMessageId;
  }
  return input.nextId;
}

export function chatCallerCanPost(input: {
  role: string | null;
  postingPolicy: string;
  archivedAt: string | null;
}): boolean {
  if (input.archivedAt) return false;
  const role = input.role;
  if (!role || role === "READ_ONLY" || input.postingPolicy === "READ_ONLY") return false;
  if (input.postingPolicy === "ADMINS_ONLY") return role === "OWNER" || role === "ADMIN";
  if (input.postingPolicy === "MEMBERS") {
    return role === "OWNER" || role === "ADMIN" || role === "MODERATOR" || role === "MEMBER";
  }
  return false;
}

export function chatGroupsWithPrevious(
  previous: {
    senderId: string;
    type: string;
    createdAt: string;
    contentHidden: boolean;
    body: string | null;
  } | null,
  current: {
    senderId: string;
    type: string;
    createdAt: string;
    contentHidden: boolean;
    body: string | null;
  },
): boolean {
  if (!previous) return false;
  if (previous.type !== "TEXT" || current.type !== "TEXT") return false;
  if (previous.contentHidden || current.contentHidden || previous.body == null || current.body == null) return false;
  if (previous.senderId !== current.senderId) return false;
  const delta = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
  return Number.isFinite(delta) && delta >= 0 && delta <= CHAT_TEXT_GROUP_MS;
}

/** Drop content columns if a realtime payload includes them. The row is not rendered. */
export function chatStripRealtimeContent(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const record = payload as { new?: unknown; old?: unknown };
  for (const key of ["new", "old"] as const) {
    const row = record[key];
    if (!row || typeof row !== "object") continue;
    const fields = row as Record<string, unknown>;
    delete fields.body;
    delete fields.metadata;
  }
}

export type ChatRealtimeStatus = "subscribed" | "closed" | "error" | "reconnecting";

export function chatRealtimeStatusFromChannel(status: string, socketState?: string | null): ChatRealtimeStatus {
  if (status === "SUBSCRIBED") return "subscribed";
  if (status === "CHANNEL_ERROR") return "error";
  if (status === "TIMED_OUT") return "reconnecting";
  if (status === "CLOSED") {
    if (socketState === "connecting" || socketState === "closing") return "reconnecting";
    return "closed";
  }
  return "reconnecting";
}

const bodyMessages: Record<ChatTextBodyIssue, string> = {
  empty: "Write a message.",
  long: "Message must be 8000 characters or less.",
  html: "Messages are plain text.",
};

const emojiMessages: Record<ChatEmojiIssue, string> = {
  empty: "Choose an emoji.",
  long: "Emoji must be 32 characters or less.",
  markup: "Emoji cannot include markup.",
};

/**
 * Announcement acknowledgement flag.
 *
 * chat_messages_visible returns metadata for a normal row. content_hidden and a
 * SELF delete for the deleter replace metadata with {}. Authenticated cannot
 * select metadata on chat_messages itself.
 *
 * Posters store { require_ack: true } or { require_ack: false } on type
 * ANNOUNCEMENT. An explicit false hides the button. A missing key, a null
 * metadata value, or a hidden row shows Acknowledge, because the flag cannot
 * be read. The button is hidden after the caller has a chat_acknowledgements row.
 */
export function announcementRequiresAcknowledgement(input: {
  type: string;
  metadata: unknown;
  contentHidden: boolean;
}): boolean {
  if (input.type !== "ANNOUNCEMENT") return false;
  if (input.contentHidden) return true;
  const record = metadataObject(input.metadata);
  if (!record || !Object.prototype.hasOwnProperty.call(record, "require_ack")) return true;
  return record.require_ack === true;
}

function metadataObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return metadataObject(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export const sendTextMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().superRefine((value, ctx) => {
    const issue = chatTextBodyIssue(value);
    if (!issue) return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: bodyMessages[issue] });
  }),
  clientMessageId: z.string().uuid(),
  replyToMessageId: z.string().uuid().optional(),
  mentionUserIds: chatMentionUserIdsField,
  /** Stored as metadata.require_ack on ANNOUNCEMENT messages. Ignored for other kinds. */
  requireAcknowledgement: z.boolean().optional(),
});

export const markConversationReadSchema = z.object({
  conversationId: z.string().uuid(),
  lastReadMessageId: z.string().uuid(),
});

const emojiField = z.string().trim().superRefine((value, ctx) => {
  const issue = chatEmojiIssue(value);
  if (!issue) return;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: emojiMessages[issue] });
});

export const addReactionSchema = z.object({
  messageId: z.string().uuid(),
  emoji: emojiField,
});

export const removeReactionSchema = addReactionSchema;

const listCursorSchema = z.object({
  createdAt: z.string().trim().regex(KEYSET_TIMESTAMP, "Enter a valid date."),
  id: z.string().uuid(),
});

export const listMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  cursor: listCursorSchema.optional(),
  through: listCursorSchema.optional(),
  limit: z.number().int().min(1).max(CHAT_MESSAGE_PAGE_MAX).default(CHAT_MESSAGE_PAGE_DEFAULT),
});
