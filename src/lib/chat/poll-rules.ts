/**
 * Pure poll and acknowledgement rules. Postgres remains authoritative for
 * membership, single-choice, expiry, and vote identity.
 *
 * Anonymous results never include voter ids. Counts come from a separate map
 * (chat_poll_option_counts) so the shape can show totals without identities.
 * When that map is missing, anonymous counts stay null rather than a partial tally.
 */
import { z } from "zod";

export const CHAT_POLL_QUESTION_MAX = 500;
export const CHAT_POLL_OPTION_LABEL_MAX = 200;
export const CHAT_POLL_OPTIONS_MIN = 2;
export const CHAT_POLL_OPTIONS_MAX = 6;
export const CHAT_POLL_MAX_MS = 30 * 24 * 60 * 60 * 1000;

const HTML_TAG = /<\/?[a-z][^>]*>/i;

export type ChatPollOptionCountIssue = "few" | "many";
export type ChatPollVoteBlock = "expired" | "single" | "empty" | "voted";

export type ChatPollVoteInput = {
  optionId: string;
  userId: string;
};

export type ChatPollOptionModel = {
  id: string;
  label: string;
  position: number;
  count: number | null;
  selected: boolean;
  /** Empty when the poll is anonymous. Never a substitute for a hidden voter. */
  voterIds: string[];
};

export type ChatPollModel = {
  id: string;
  allowMultiple: boolean;
  anonymous: boolean;
  expiresAt: string | null;
  options: ChatPollOptionModel[];
};

type PlainIssue = "empty" | "long" | "html";

function plainIssue(value: string, max: number): PlainIssue | null {
  const trimmed = value.trim();
  if (trimmed.length < 1) return "empty";
  if (Array.from(trimmed).length > max) return "long";
  if (HTML_TAG.test(trimmed)) return "html";
  return null;
}

const plainMessages: Record<PlainIssue, string> = {
  empty: "Enter some text.",
  long: "That text is too long.",
  html: "Use plain text.",
};

function plainField(max: number) {
  return z.string().trim().superRefine((value, ctx) => {
    const issue = plainIssue(value, max);
    if (!issue) return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: plainMessages[issue] });
  });
}

/** 2–6 options. The database allows a longer label; the app stops at 200. */
export function chatPollOptionCountIssue(count: number): ChatPollOptionCountIssue | null {
  if (!Number.isInteger(count) || count < CHAT_POLL_OPTIONS_MIN) return "few";
  if (count > CHAT_POLL_OPTIONS_MAX) return "many";
  return null;
}

/** True when expires_at is set and is not strictly after now. A null expiry stays open. */
export function chatPollIsExpired(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return true;
  return time <= nowMs;
}

export function chatPollVoteBlock(input: {
  expiresAt: string | null;
  nowMs: number;
  allowMultiple: boolean;
  optionIds: readonly string[];
  alreadyVoted: boolean;
}): ChatPollVoteBlock | null {
  if (input.alreadyVoted) return "voted";
  if (chatPollIsExpired(input.expiresAt, input.nowMs)) return "expired";
  const ids = [...new Set(input.optionIds)];
  if (ids.length < 1) return "empty";
  if (!input.allowMultiple && ids.length !== 1) return "single";
  return null;
}

/**
 * One acknowledgement row per user per message. A repeat returns the same list.
 * Postgres enforces this with PRIMARY KEY (message_id, user_id). This is the
 * client-side mirror used by tests.
 */
export function chatAcknowledgementRows(
  rows: readonly { messageId: string; userId: string }[],
  next: { messageId: string; userId: string },
): { messageId: string; userId: string }[] {
  const seen = rows.some(
    (row) => row.messageId === next.messageId && row.userId.toLowerCase() === next.userId.toLowerCase(),
  );
  if (seen) return rows.slice();
  return [...rows, { messageId: next.messageId, userId: next.userId }];
}

/**
 * Builds the poll card. Anonymous output has voterIds [] for every option.
 * Counts prefer the aggregate map. Without that map, a non-anonymous poll uses
 * the visible vote rows. An anonymous poll does not turn the caller's own vote
 * into a total.
 */
export function shapePollResult(input: {
  anonymous: boolean;
  viewerUserId: string;
  options: readonly { id: string; label: string; position: number }[];
  votes: readonly ChatPollVoteInput[];
  counts: ReadonlyMap<string, number> | null;
}): ChatPollOptionModel[] {
  const viewer = input.viewerUserId.toLowerCase();
  return [...input.options]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((option) => {
      const optionVotes = input.votes.filter((vote) => vote.optionId === option.id);
      const selected = optionVotes.some((vote) => vote.userId.toLowerCase() === viewer);
      if (input.anonymous) {
        return {
          id: option.id,
          label: option.label,
          position: option.position,
          count: input.counts?.get(option.id) ?? null,
          selected,
          voterIds: [],
        };
      }
      const voterIds = [...new Set(optionVotes.map((vote) => vote.userId))];
      return {
        id: option.id,
        label: option.label,
        position: option.position,
        count: input.counts?.get(option.id) ?? voterIds.length,
        selected,
        voterIds,
      };
    });
}

export const createPollSchema = z
  .object({
    conversationId: z.string().uuid(),
    clientMessageId: z.string().uuid(),
    question: plainField(CHAT_POLL_QUESTION_MAX),
    options: z.array(plainField(CHAT_POLL_OPTION_LABEL_MAX)),
    allowMultiple: z.boolean(),
    anonymous: z.boolean(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, ctx) => {
    const countIssue = chatPollOptionCountIssue(value.options.length);
    if (countIssue === "few") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least 2 options.", path: ["options"] });
    }
    if (countIssue === "many") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Use 6 options or fewer.", path: ["options"] });
    }
    if (!value.expiresAt) return;
    const time = Date.parse(value.expiresAt);
    const now = Date.now();
    if (!Number.isFinite(time) || time <= now) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose an end time in the future.", path: ["expiresAt"] });
      return;
    }
    if (time > now + CHAT_POLL_MAX_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A poll can stay open for 30 days at most.",
        path: ["expiresAt"],
      });
    }
  });

export const castVoteSchema = z.object({
  pollId: z.string().uuid(),
  optionIds: z.array(z.string().uuid()).min(1).max(CHAT_POLL_OPTIONS_MAX),
});

export const acknowledgeAnnouncementSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export const pollVoteMessages: Record<ChatPollVoteBlock, string> = {
  expired: "This poll has ended.",
  single: "Choose one option.",
  empty: "Choose an option.",
  voted: "You have already voted.",
};
