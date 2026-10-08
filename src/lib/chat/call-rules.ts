import { z } from "zod";

import { chatCanCall, type ChatCallPolicy, type ChatMemberRole } from "@/lib/chat/authorization";

export const CHAT_CALL_KINDS = ["VOICE", "VIDEO"] as const;
export const CHAT_CALL_RESPONSES = ["ACCEPT", "REJECT"] as const;
export const CHAT_CALL_STATUSES = ["RINGING", "ACTIVE", "ENDED", "MISSED", "REJECTED", "CANCELLED"] as const;
export const CHAT_CALL_PARTICIPANT_OUTCOMES = ["ACCEPTED", "REJECTED", "MISSED", "CANCELLED", "JOINED"] as const;

export const CHAT_CALL_STARTER_OUTCOME = "JOINED" as const;

export type ChatCallKind = (typeof CHAT_CALL_KINDS)[number];
export type ChatCallResponse = (typeof CHAT_CALL_RESPONSES)[number];
export type ChatCallStatus = (typeof CHAT_CALL_STATUSES)[number];
export type ChatCallParticipantOutcome = (typeof CHAT_CALL_PARTICIPANT_OUTCOMES)[number];

/**
 * Authenticated updates of chat_calls may only become CANCELLED or ENDED.
 * chat_calls_update and chat_tg_calls_auth reject every other status, including REJECTED.
 */
const USER_CALL_STATUS_UPDATES = new Set<ChatCallStatus>(["CANCELLED", "ENDED"]);

export function chatUserMaySetCallStatus(status: string): status is "CANCELLED" | "ENDED" {
  return USER_CALL_STATUS_UPDATES.has(status as ChatCallStatus);
}

export const startCallSchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(CHAT_CALL_KINDS),
});

export const respondCallSchema = z.object({
  callId: z.string().uuid(),
  response: z.enum(CHAT_CALL_RESPONSES),
});

export const callIdSchema = z.object({
  callId: z.string().uuid(),
});

/** In-memory room label passed to the provider. Never written to chat_calls. */
export function chatCallRoomName(callId: string): string {
  return `fec-chat-${callId}`;
}

/**
 * Insert payload for chat_calls. provider stays NONE.
 * recording_enabled is omitted so the flag is never sent; the column default is false
 * and the auth trigger rejects true.
 */
export function chatCallInsertValues(conversationId: string, kind: ChatCallKind, startedBy: string): Record<string, unknown> {
  return {
    conversation_id: conversationId,
    kind,
    status: "RINGING",
    started_by: startedBy,
    provider: "NONE",
  };
}

export function chatCallParticipantValues(
  callId: string,
  userId: string,
  outcome: "JOINED" | "ACCEPTED" | "REJECTED",
): Record<string, unknown> {
  return {
    call_id: callId,
    user_id: userId,
    outcome,
  };
}

export function chatCallCloseValues(status: "CANCELLED" | "ENDED", endedAt?: string): Record<string, unknown> {
  const values: Record<string, unknown> = {
    status,
    provider: "NONE",
  };
  if (endedAt) values.ended_at = endedAt;
  return values;
}

export function participantOutcomeForResponse(response: ChatCallResponse): "ACCEPTED" | "REJECTED" {
  return response === "ACCEPT" ? "ACCEPTED" : "REJECTED";
}

export type ChatCallBlock = "send" | "role" | "policy" | "admins";

const KNOWN_ROLES = new Set<ChatMemberRole>(["OWNER", "ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"]);

export function chatCallDisabledReason(callPolicy: string, role: string | null, canSend: boolean): ChatCallBlock | null {
  if (!canSend) return "send";
  if (role == null || !KNOWN_ROLES.has(role as ChatMemberRole)) return "role";
  const policy: ChatCallPolicy =
    callPolicy === "MEMBERS" || callPolicy === "ADMINS_ONLY" || callPolicy === "DISABLED" ? callPolicy : "DISABLED";
  if (chatCanCall(policy, role as ChatMemberRole)) return null;
  if (role === "READ_ONLY") return "role";
  if (policy === "DISABLED" || policy === "ADMINS_ONLY") return policy === "DISABLED" ? "policy" : "admins";
  return "role";
}
