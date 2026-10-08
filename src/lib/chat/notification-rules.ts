/**
 * Pure chat notification decisions. Postgres stores the preference rows.
 * Delivery uses the existing in-app notifications table.
 *
 * Cross-device "already viewing this conversation" suppression is not implemented.
 * The sender is excluded by the caller. Presence is not written to Postgres.
 * An idempotent replay of the same client_message_id must pass inserted: false.
 */
import { z } from "zod";

export const CHAT_NOTIFY_LEVELS = ["ALL", "MENTIONS", "MUTED"] as const;
export const CHAT_NOTIFY_PREVIEW_MAX = 140;
export const CHAT_MENTION_LIMIT = 20;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChatNotificationLevel = (typeof CHAT_NOTIFY_LEVELS)[number];

export const chatNotificationLevelSchema = z.enum(CHAT_NOTIFY_LEVELS);

export const chatMentionUserIdsField = z.array(z.string().uuid()).max(CHAT_MENTION_LIMIT).optional();

export const setConversationChatNotificationSchema = z.object({
  conversationId: z.string().uuid(),
  level: chatNotificationLevelSchema,
});

export const setGlobalChatNotificationSchema = z.object({
  level: chatNotificationLevelSchema,
  notifyCalls: z.boolean(),
  notifyAnnouncements: z.boolean(),
});

export function chatNotificationLevel(value: string | null | undefined): ChatNotificationLevel | null {
  if (value === "ALL" || value === "MENTIONS" || value === "MUTED") return value;
  return null;
}

/** Conversation row wins. Otherwise the global row. Otherwise ALL. */
export function resolveChatNotificationLevel(
  conversationLevel: string | null | undefined,
  globalLevel: string | null | undefined,
): ChatNotificationLevel {
  return chatNotificationLevel(conversationLevel) ?? chatNotificationLevel(globalLevel) ?? "ALL";
}

/**
 * inserted is false when the send returned an existing row for the same client_message_id.
 * MENTIONS without a validated mention does not notify. MUTED never notifies.
 */
export function shouldNotifyChatRecipient(input: {
  level: ChatNotificationLevel;
  mentioned: boolean;
  inserted: boolean;
}): boolean {
  if (!input.inserted) return false;
  if (input.level === "MUTED") return false;
  if (input.level === "MENTIONS") return input.mentioned;
  return true;
}

/** Browser push is a second channel. It still requires the in-app recipient decision first. */
export function shouldSendChatPush(pushConfigured: boolean): boolean {
  return pushConfigured;
}

/**
 * Email uses the existing webhook. No preference row means email stays off.
 * A missing webhook never sends.
 */
export function shouldSendChatEmail(input: { webhookConfigured: boolean; channelEmail: boolean }): boolean {
  return input.webhookConfigured && input.channelEmail;
}

export function chatPreferenceFlags(level: ChatNotificationLevel): {
  notifyMessages: boolean;
  notifyMentions: boolean;
} {
  if (level === "MUTED") return { notifyMessages: false, notifyMentions: false };
  if (level === "MENTIONS") return { notifyMessages: false, notifyMentions: true };
  return { notifyMessages: true, notifyMentions: true };
}

/** Drops the sender, non-members, duplicates, and anything that is not a uuid. */
export function chatMentionTargets(
  requested: readonly string[] | undefined,
  activeMemberIds: readonly string[],
  senderId: string,
): string[] {
  const members = new Set(activeMemberIds.map((id) => id.toLowerCase()));
  const sender = senderId.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of requested ?? []) {
    if (!UUID_RE.test(id)) continue;
    const key = id.toLowerCase();
    if (key === sender || !members.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(id);
    if (out.length >= CHAT_MENTION_LIMIT) break;
  }
  return out;
}

/** Plain text only. Angle brackets are removed so a preview cannot carry markup. */
export function chatPlainPreview(value: string | null | undefined, max = CHAT_NOTIFY_PREVIEW_MAX): string {
  const clean = (value ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  if (max <= 1) return "…";
  return `${chars.slice(0, max - 1).join("")}…`;
}

export function chatNotificationPreview(input: {
  body: string | null | undefined;
  messageType: string;
}): string {
  const text = chatPlainPreview(input.body);
  if (text) return text;
  if (input.messageType === "VOICE_NOTE") return "Voice note";
  if (input.messageType === "IMAGE") return "Photo";
  if (input.messageType === "VIDEO") return "Video";
  if (input.messageType === "AUDIO") return "Audio";
  if (input.messageType === "DOCUMENT") return "Document";
  return "New message";
}

export function chatNotificationTitle(input: {
  senderName: string | null;
  conversationTitle: string | null;
}): string {
  const sender = chatPlainPreview(input.senderName, 40) || "Someone";
  const room = chatPlainPreview(input.conversationTitle, 60);
  const title = room ? `${sender} in ${room}` : `Message from ${sender}`;
  return chatPlainPreview(title, 120) || "New chat message";
}
