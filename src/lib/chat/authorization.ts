/**
 * Chat hub authorization.
 *
 * RLS and the SQL helpers in supabase/migrations/20261002020000_chat_hub_rls.sql
 * are authoritative. The pure functions below mirror that decision table so it
 * can be unit-tested without a database. They are not a second policy.
 *
 * Server checks call those SQL helpers through the user-scoped Supabase client
 * from getAuthenticatedContext(). This module does not import server-only code;
 * pass that context in.
 *
 * There is no account-ban flag on profiles. Do not treat staff.deleted_at as a
 * reason to hide chats the auth user still belongs to. SQL rejects a new
 * staff_id when that staff row is soft-deleted or not linked to the same user.
 *
 * Owner transfer and vote changes are deferred. Authenticated cannot SELECT
 * body or metadata on chat_messages. Readers use chat_messages_visible, which
 * masks content_hidden for everyone and a SELF delete for the deleter only.
 */
import type { AuthContext } from "@/lib/server/auth";
import { z } from "zod";

export const CHAT_MEMBER_ROLES = ["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"] as const;
export const CHAT_POSTING_POLICIES = ["MEMBERS", "ADMINS_ONLY", "READ_ONLY"] as const;
export const CHAT_FILE_POLICIES = ["MEMBERS", "ADMINS_ONLY", "DISABLED"] as const;
export const CHAT_CALL_POLICIES = ["MEMBERS", "ADMINS_ONLY", "DISABLED"] as const;

export type ChatMemberRole = (typeof CHAT_MEMBER_ROLES)[number];
export type ChatPostingPolicy = (typeof CHAT_POSTING_POLICIES)[number];
export type ChatFilePolicy = (typeof CHAT_FILE_POLICIES)[number];
export type ChatCallPolicy = (typeof CHAT_CALL_POLICIES)[number];
export type ChatDeletionScope = "SELF" | "EVERYONE";

const ADMIN_ROLES = new Set<ChatMemberRole>(["OWNER", "ADMIN"]);

export const chatConversationIdSchema = z.string().uuid();

export const chatAuditWriteSchema = z.object({
  eventType: z.string().trim().min(1).max(80),
  conversationId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

export type ChatAuditWrite = z.infer<typeof chatAuditWriteSchema>;

/** Mirrors chat_can_post. READ_ONLY posting allows nobody. MODERATOR posts only when policy is MEMBERS. */
export function chatCanPost(postingPolicy: ChatPostingPolicy, role: ChatMemberRole | null): boolean {
  if (role == null || role === "READ_ONLY") return false;
  if (postingPolicy === "READ_ONLY") return false;
  if (postingPolicy === "ADMINS_ONLY") return ADMIN_ROLES.has(role);
  return true;
}

/** Mirrors chat_can_attach. Requires chat_can_post, then the file policy. */
export function chatCanAttach(
  filePolicy: ChatFilePolicy,
  role: ChatMemberRole | null,
  postingPolicy: ChatPostingPolicy,
): boolean {
  if (!chatCanPost(postingPolicy, role) || role == null) return false;
  if (filePolicy === "DISABLED") return false;
  if (filePolicy === "ADMINS_ONLY") return ADMIN_ROLES.has(role);
  return true;
}

/**
 * Mirrors chat_can_call. Independent of posting_policy.
 * READ_ONLY role cannot call. ADMINS_ONLY is OWNER/ADMIN. DISABLED is nobody.
 */
export function chatCanCall(callPolicy: ChatCallPolicy, role: ChatMemberRole | null): boolean {
  if (role == null || role === "READ_ONLY") return false;
  if (callPolicy === "DISABLED") return false;
  if (callPolicy === "ADMINS_ONLY") return ADMIN_ROLES.has(role);
  return true;
}

export function chatCanManageMembers(role: ChatMemberRole | null): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function chatCanModerate(role: ChatMemberRole | null): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MODERATOR";
}

/**
 * Mirrors chat_can_see_poll_vote. Anonymous votes are visible only to that voter.
 * Moderator is not an input: moderators do not see anonymous voter identity.
 */
export function chatCanSeePollVote(input: {
  anonymous: boolean;
  voteUserId: string;
  viewerUserId: string;
  isActiveMember: boolean;
}): boolean {
  if (!input.isActiveMember) return false;
  if (input.anonymous) return input.voteUserId === input.viewerUserId;
  return true;
}

/** Postgres uuid comparison for canonical hex. user_low < user_high. */
export function chatDmPairOrder(userA: string, userB: string): { userLow: string; userHigh: string } {
  const left = userA.trim().toLowerCase();
  const right = userB.trim().toLowerCase();
  if (!z.string().uuid().safeParse(left).success || !z.string().uuid().safeParse(right).success) {
    throw new Error("DM pair requires two user ids");
  }
  if (left === right) throw new Error("DM pair requires two users");
  return left < right ? { userLow: left, userHigh: right } : { userLow: right, userHigh: left };
}

/** Mirrors chat_messages_visible. Does not return a previous body. */
export function chatVisibleMessageContent(input: {
  body: string | null;
  metadata: Record<string, unknown>;
  contentHidden: boolean;
  deletionScope: ChatDeletionScope | null;
  deletedBy: string | null;
  viewerUserId: string;
}): { body: string | null; metadata: Record<string, unknown> } {
  const hiddenFromViewer =
    input.contentHidden || (input.deletionScope === "SELF" && input.deletedBy === input.viewerUserId);
  if (hiddenFromViewer) return { body: null, metadata: {} };
  return { body: input.body, metadata: input.metadata };
}

/** Mirrors the keys chat_write_audit removes. SQL still strips them. */
export function stripChatAuditMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (metadata == null) return {};
  const next = { ...metadata };
  delete next.body;
  delete next.actor;
  delete next.actor_id;
  return next;
}

export class ChatForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ChatForbiddenError";
  }
}

type ChatRpcName =
  | "chat_is_active_member"
  | "chat_member_role"
  | "chat_can_post"
  | "chat_can_manage_members"
  | "chat_can_moderate"
  | "chat_can_attach"
  | "chat_can_call";

async function chatRpc(context: AuthContext, fn: ChatRpcName, conversationId: string): Promise<unknown> {
  const id = chatConversationIdSchema.parse(conversationId);
  const supabase = context.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await supabase.rpc(fn, { _conversation_id: id });
  if (error) throw new Error(error.message);
  return data;
}

export async function chatIsActiveMember(context: AuthContext, conversationId: string): Promise<boolean> {
  return (await chatRpc(context, "chat_is_active_member", conversationId)) === true;
}

export async function chatMemberRole(context: AuthContext, conversationId: string): Promise<string | null> {
  const role = await chatRpc(context, "chat_member_role", conversationId);
  return typeof role === "string" ? role : null;
}

async function assertChatFlag(context: AuthContext, fn: ChatRpcName, conversationId: string): Promise<void> {
  const allowed = await chatRpc(context, fn, conversationId);
  if (allowed !== true) throw new ChatForbiddenError();
}

export async function assertChatMember(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_is_active_member", conversationId);
}

export async function assertChatCanPost(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_can_post", conversationId);
}

export async function assertChatCanManageMembers(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_can_manage_members", conversationId);
}

export async function assertChatCanModerate(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_can_moderate", conversationId);
}

export async function assertChatCanAttach(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_can_attach", conversationId);
}

export async function assertChatCanCall(context: AuthContext, conversationId: string): Promise<void> {
  await assertChatFlag(context, "chat_can_call", conversationId);
}

export async function writeChatAudit(context: AuthContext, input: ChatAuditWrite): Promise<void> {
  const parsed = chatAuditWriteSchema.parse(input);
  const supabase = context.supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { error } = await supabase.rpc("chat_write_audit", {
    _event_type: parsed.eventType,
    _conversation_id: parsed.conversationId,
    _metadata: stripChatAuditMetadata(parsed.metadata),
  });
  if (error) throw new Error(error.message);
}
