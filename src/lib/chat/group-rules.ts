/**
 * Pure conversation rules for phase 4. RLS and the RPCs in
 * supabase/migrations/20261002030000_chat_hub_groups.sql are authoritative.
 *
 * Sensitive chats: app roles hr, ceo, and coo only. That matches hr.manage
 * (ceo and coo already bypass HR checks). CFO can view sensitive HR profiles
 * and is not allowed to mark a conversation sensitive.
 *
 * Directory search is not rate-limited in SQL. Callers must send 2–80
 * characters; the server returns at most 50 staff rows.
 * Group creation is capped in SQL at CHAT_CREATE_HOURLY_LIMIT per user.
 */
import { z } from "zod";

import {
  CHAT_CALL_POLICIES,
  CHAT_FILE_POLICIES,
  CHAT_POSTING_POLICIES,
} from "@/lib/chat/authorization";

export { CHAT_CALL_POLICIES, CHAT_FILE_POLICIES, CHAT_POSTING_POLICIES };

export const CHAT_GROUP_KINDS = [
  "PUBLIC",
  "PRIVATE",
  "DEPARTMENT",
  "SITE",
  "PROJECT",
  "MANAGEMENT",
  "ANNOUNCEMENT",
  "TEMPORARY",
] as const;

export const CHAT_RETENTION_POLICIES = ["FOREVER", "ONE_YEAR", "TWO_YEARS", "CUSTOM"] as const;

export const CHAT_ASSIGNABLE_ROLES = ["ADMIN", "MODERATOR", "MEMBER", "READ_ONLY"] as const;

export const CHAT_SENSITIVE_ROLES = ["hr", "ceo", "coo"] as const;

/** Mirrored by chat_assert_hourly_create_limit. Direct opens count. Existing DMs do not. */
export const CHAT_CREATE_HOURLY_LIMIT = 20;

export const CHAT_DIRECTORY_MAX_QUERY = 80;
export const CHAT_DIRECTORY_RESULT_CAP = 50;

export type ChatGroupKind = (typeof CHAT_GROUP_KINDS)[number];
export type ChatCreateFieldError = "kind" | "department" | "location" | "retention" | "sensitive";

export function chatCanMarkSensitive(roles: readonly string[]): boolean {
  return roles.some((role) => role === "hr" || role === "ceo" || role === "coo");
}

export function chatAssignableMemberRole(role: string): boolean {
  return (CHAT_ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

export function chatRetentionShape(policy: string, until: string | null | undefined): boolean {
  if (policy === "CUSTOM") return until != null && until !== "";
  return until == null || until === "";
}

/**
 * Kind rules for a new group. DIRECT and SYSTEM are rejected.
 * DEPARTMENT needs a department. SITE needs a location.
 */
export function chatCreateFieldError(input: {
  kind: string;
  locationId?: string | null;
  departmentId?: string | null;
  retentionPolicy?: string;
  retentionUntil?: string | null;
  sensitive?: boolean;
  roles?: readonly string[];
}): ChatCreateFieldError | null {
  if (input.kind === "DIRECT" || input.kind === "SYSTEM" || !(CHAT_GROUP_KINDS as readonly string[]).includes(input.kind)) {
    return "kind";
  }
  if (input.kind === "DEPARTMENT" && !input.departmentId) return "department";
  if (input.kind === "SITE" && !input.locationId) return "location";
  const retention = input.retentionPolicy ?? "FOREVER";
  if (!chatRetentionShape(retention, input.retentionUntil)) return "retention";
  if (input.sensitive && !chatCanMarkSensitive(input.roles ?? [])) return "sensitive";
  return null;
}

/** Strip characters that would break a PostgREST or() filter. Null when fewer than 2 remain. */
export function chatDirectoryLikeTerm(query: string): string | null {
  const cleaned = query
    .trim()
    .replace(/[^\p{L}\p{N}\s.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_DIRECTORY_MAX_QUERY);
  if (cleaned.length < 2) return null;
  return cleaned;
}

const timestampSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.")
  .nullable()
  .optional();

export const createConversationSchema = z
  .object({
    title: z.string().trim().min(1, "Name is required.").max(120, "Name must be 120 characters or less."),
    description: z.string().trim().max(2000, "Description must be 2000 characters or less.").nullable().optional(),
    kind: z.enum(CHAT_GROUP_KINDS),
    locationId: z.string().uuid().nullable().optional(),
    departmentId: z.string().uuid().nullable().optional(),
    sensitive: z.boolean().optional(),
    postingPolicy: z.enum(CHAT_POSTING_POLICIES).optional(),
    filePolicy: z.enum(CHAT_FILE_POLICIES).optional(),
    callPolicy: z.enum(CHAT_CALL_POLICIES).optional(),
    retentionPolicy: z.enum(CHAT_RETENTION_POLICIES).optional(),
    retentionUntil: timestampSchema,
    archiveAt: timestampSchema,
  })
  .superRefine((value, ctx) => {
    const issue = chatCreateFieldError({
      kind: value.kind,
      locationId: value.locationId,
      departmentId: value.departmentId,
      retentionPolicy: value.retentionPolicy,
      retentionUntil: value.retentionUntil,
    });
    if (issue === "department") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a department for this conversation.", path: ["departmentId"] });
    }
    if (issue === "location") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a location for this site conversation.", path: ["locationId"] });
    }
    if (issue === "retention") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom retention needs an end date. Other retention policies do not.",
        path: ["retentionUntil"],
      });
    }
  });

export const openDirectSchema = z.object({
  otherUserId: z.string().uuid("Choose a person to message."),
});

export const updateConversationSchema = z
  .object({
    conversationId: z.string().uuid(),
    title: z.string().trim().min(1, "Name is required.").max(120, "Name must be 120 characters or less.").optional(),
    description: z.string().trim().max(2000, "Description must be 2000 characters or less.").nullable().optional(),
    postingPolicy: z.enum(CHAT_POSTING_POLICIES).optional(),
    filePolicy: z.enum(CHAT_FILE_POLICIES).optional(),
    callPolicy: z.enum(CHAT_CALL_POLICIES).optional(),
    retentionPolicy: z.enum(CHAT_RETENTION_POLICIES).optional(),
    retentionUntil: timestampSchema,
    archiveAt: timestampSchema,
    archivedAt: timestampSchema,
    sensitive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const fields = [
      value.title,
      value.description,
      value.postingPolicy,
      value.filePolicy,
      value.callPolicy,
      value.retentionPolicy,
      value.retentionUntil,
      value.archiveAt,
      value.archivedAt,
      value.sensitive,
    ];
    if (fields.every((field) => field === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nothing to update." });
    }
    if (value.retentionPolicy && !chatRetentionShape(value.retentionPolicy, value.retentionUntil)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom retention needs an end date. Other retention policies do not.",
        path: ["retentionUntil"],
      });
    }
  });

export const directoryQuerySchema = z.object({
  query: z.string().trim().max(CHAT_DIRECTORY_MAX_QUERY).optional().default(""),
});

export const conversationIdSchema = z.object({
  conversationId: z.string().uuid(),
});

export const addMemberSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(CHAT_ASSIGNABLE_ROLES).optional(),
});

export const memberTargetSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const setMemberRoleSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(CHAT_ASSIGNABLE_ROLES),
});

const SAFE_CHAT_ERRORS: Array<[RegExp, string]> = [
  [/call recording is disabled/, "Call recording is not available."],
  [/call provider must be none|call room_name is not used|call identity columns are immutable/, "That call could not be saved."],
  [/status can only move to cancelled or ended|call participants cannot be updated/, "That call can no longer be changed."],
  [/call is already closed/, "That call has already ended."],
  [/chat message rate limit/, "You are sending messages too quickly. Wait a moment and try again."],
  [/attachment rate limit/, "You are attaching files too quickly. Wait a moment and try again."],
  [/scan_status changes are service-role only|scan_status must be pending|bucket not found/, "Attachments are not available yet."],
  [/cannot post in an archived conversation/, "This conversation is archived."],
  [/cannot post this message type/, "You cannot send a message in this conversation."],
  [/does not allow multiple choices/, "Choose one option."],
  [/poll votes cannot be changed/, "You have already voted."],
  [/this direct conversation is closed/, "This direct conversation is closed."],
  [/cannot set left_at on the last active owner/, "The last owner cannot leave. Ownership transfer is not available yet."],
  [/cannot change left_at/, "Department and site memberships cannot be removed here."],
  [/sensitive conversations require/, "Only HR, CEO, or COO can mark a conversation sensitive."],
  [/only the owner can clear sensitive/, "Only the owner can clear the sensitive flag."],
  [/chat create rate limit/, "You have created too many conversations this hour. Try again later."],
  [/direct message target is not available|other_user_id is required/, "That person is not available for a direct conversation."],
  [/cannot message yourself/, "You cannot start a direct conversation with yourself."],
  [/location is not accessible|location_id is required/, "Choose a location you can access."],
  [/department_id is required|department is not available/, "Choose a department for this conversation."],
  [/direct conversations use|kind is not allowed/, "That conversation kind is not allowed."],
  [/a role is required|no role assigned/, "A role is required to use chat."],
  [/owner transfer is deferred|conversation already has an owner/, "The owner role cannot be changed here."],
  [/conversation scope is immutable/, "Kind, location, and department cannot be changed."],
  [/title is required/, "Name is required."],
  [/description is too long/, "Description must be 2000 characters or less."],
  [/retention_until is required|retention_until is not allowed|retention policy is not allowed/, "Check the retention settings and try again."],
  [/posting policy is not allowed|file policy is not allowed|call policy is not allowed/, "That policy is not allowed."],
  [/schema cache|could not find the function|does not exist|pgrst202/, "Chat is not available yet. Apply the chat database migrations, then try again."],
  [/row-level security|permission denied|insufficient_privilege|forbidden/, "You do not have access to do that."],
  [/auth\.uid\(\) is required|unauthorized/, "You need to sign in again."],
];

/** Never returns SQL text, constraint names, or ids that arrived inside the database error. */
export function mapChatError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const details =
    error && typeof error === "object" && "details" in error && typeof error.details === "string" ? error.details : "";
  const blob = `${message}\n${details}`.toLowerCase();
  if (!blob.trim()) return "Chat request failed.";
  for (const [pattern, safe] of SAFE_CHAT_ERRORS) {
    if (pattern.test(blob)) return safe;
  }
  if (/foreign key/.test(blob)) {
    if (/location/.test(blob)) return "Choose a location you can access.";
    if (/department/.test(blob)) return "Choose a department for this conversation.";
    return "Chat request failed.";
  }
  return "Chat request failed.";
}
