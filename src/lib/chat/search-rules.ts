/**
 * Pure search, snippet, and file-type rules for chat phase 9.
 * Postgres RLS is authoritative. These helpers only shape filters and text
 * that the user-scoped query is allowed to return.
 *
 * Query length and the result cap are the rate control. There is no OFFSET.
 */
import { z } from "zod";

import { chatDirectoryLikeTerm } from "@/lib/chat/group-rules";

export const CHAT_SEARCH_QUERY_MIN = 2;
export const CHAT_SEARCH_QUERY_MAX = 80;
export const CHAT_SEARCH_LIMIT_DEFAULT = 20;
export const CHAT_SEARCH_LIMIT_MAX = 30;
export const CHAT_SEARCH_SNIPPET_MAX = 160;

export const CHAT_SEARCH_FILE_TYPES = ["image", "video", "audio", "document", "voice"] as const;

export type ChatSearchFileType = (typeof CHAT_SEARCH_FILE_TYPES)[number];
export type ChatSearchQueryIssue = "short" | "long";

const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MESSAGE_TYPES: Record<ChatSearchFileType, readonly string[]> = {
  image: ["IMAGE"],
  video: ["VIDEO"],
  audio: ["AUDIO"],
  document: ["DOCUMENT"],
  voice: ["VOICE_NOTE"],
};

const MIME_PREFIXES: Record<ChatSearchFileType, readonly string[]> = {
  image: ["image/"],
  video: ["video/"],
  audio: ["audio/"],
  document: ["application/", "text/"],
  voice: ["audio/"],
};

export function chatSearchQueryIssue(query: string): ChatSearchQueryIssue | null {
  const trimmed = query.trim();
  if (trimmed.length < CHAT_SEARCH_QUERY_MIN) return "short";
  if (trimmed.length > CHAT_SEARCH_QUERY_MAX) return "long";
  return null;
}

/** Quoted PostgREST ilike fragment. Null when fewer than 2 safe characters remain. */
export function chatSearchLikePattern(query: string): string | null {
  const term = chatDirectoryLikeTerm(query);
  if (!term) return null;
  return `"*${term.replace(/[%_*"]/g, "")}*"`;
}

/** Value for a single-column ilike filter. Null when the term is too short. */
export function chatSearchIlikeValue(query: string): string | null {
  const term = chatDirectoryLikeTerm(query);
  if (!term) return null;
  return `%${term}%`;
}

/**
 * Plain text, tags removed, collapsed whitespace, cut to 160 code points.
 * The ellipsis is added only when the text was cut.
 */
export function chatSearchSnippet(body: string, max = CHAT_SEARCH_SNIPPET_MAX): string {
  const plain = body
    .replace(HTML_TAG, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(plain);
  if (chars.length <= max) return plain;
  return `${chars.slice(0, max).join("").trimEnd()}…`;
}

export function chatSearchMessageTypes(fileType: ChatSearchFileType): readonly string[] {
  return MESSAGE_TYPES[fileType];
}

export function chatSearchMimePrefixes(fileType: ChatSearchFileType): readonly string[] {
  return MIME_PREFIXES[fileType];
}

/** PostgREST or() filter. Prefixes are fixed; callers must not pass raw user text here. */
export function chatSearchMimeOrFilter(fileType: ChatSearchFileType): string {
  return chatSearchMimePrefixes(fileType)
    .map((prefix) => `mime_type.ilike."${prefix}*"`)
    .join(",");
}

/** Date-only values cover the whole UTC day. Timestamps pass through as ISO. */
export function chatSearchDateBound(value: string, edge: "from" | "to"): string {
  if (DATE_ONLY.test(value)) {
    return edge === "from" ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid date.");
  return parsed.toISOString();
}

const searchDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.");

export const searchChatSchema = z.object({
  query: z.string().trim().superRefine((value, ctx) => {
    const issue = chatSearchQueryIssue(value);
    if (issue === "short") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Type at least 2 characters." });
    }
    if (issue === "long") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Search must be 80 characters or less." });
    }
  }),
  conversationId: z.string().uuid().optional(),
  senderId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  from: searchDate.optional(),
  to: searchDate.optional(),
  fileType: z.enum(CHAT_SEARCH_FILE_TYPES).optional(),
  limit: z.number().int().min(1).max(CHAT_SEARCH_LIMIT_MAX).default(CHAT_SEARCH_LIMIT_DEFAULT),
});

export const chatMessageTargetSchema = z.object({
  messageId: z.string().uuid(),
});
