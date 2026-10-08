import { describe, expect, it } from "vitest";

import { announcementRequiresAcknowledgement } from "./message-rules";
import {
  CHAT_POLL_OPTIONS_MAX,
  CHAT_POLL_OPTIONS_MIN,
  chatAcknowledgementRows,
  chatPollOptionCountIssue,
  chatPollVoteBlock,
  createPollSchema,
  shapePollResult,
} from "./poll-rules";

const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const optionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const optionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const messageId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const clientId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const conversationId = "11111111-1111-4111-8111-111111111111";

describe("poll option bounds", () => {
  it("accepts 2 to 6 labels and rejects fewer or more", () => {
    expect(chatPollOptionCountIssue(CHAT_POLL_OPTIONS_MIN)).toBeNull();
    expect(chatPollOptionCountIssue(CHAT_POLL_OPTIONS_MAX)).toBeNull();
    expect(chatPollOptionCountIssue(1)).toBe("few");
    expect(chatPollOptionCountIssue(7)).toBe("many");
    expect(chatPollOptionCountIssue(0)).toBe("few");

    const base = {
      conversationId,
      clientMessageId: clientId,
      question: "Which shift?",
      allowMultiple: false,
      anonymous: false,
    };
    expect(createPollSchema.safeParse({ ...base, options: ["Morning", "Night"] }).success).toBe(true);
    expect(createPollSchema.safeParse({ ...base, options: ["Only one"] }).success).toBe(false);
    expect(
      createPollSchema.safeParse({
        ...base,
        options: ["1", "2", "3", "4", "5", "6", "7"],
      }).success,
    ).toBe(false);
    expect(createPollSchema.safeParse({ ...base, options: ["<b>Yes</b>", "No"] }).success).toBe(false);
    expect(createPollSchema.safeParse({ ...base, question: "<i>x</i>", options: ["A", "B"] }).success).toBe(false);
  });
});

describe("anonymous poll results", () => {
  it("shows counts and the caller selection without voter ids", () => {
    const shaped = shapePollResult({
      anonymous: true,
      viewerUserId: viewer,
      options: [
        { id: optionA, label: "Yes", position: 0 },
        { id: optionB, label: "No", position: 1 },
      ],
      votes: [
        { optionId: optionA, userId: viewer },
        { optionId: optionB, userId: other },
      ],
      counts: new Map([
        [optionA, 4],
        [optionB, 2],
      ]),
    });

    const serialized = JSON.stringify(shaped).toLowerCase();
    expect(serialized).not.toContain(other.toLowerCase());
    expect(serialized).not.toContain(viewer.toLowerCase());
    expect(shaped.every((option) => option.voterIds.length === 0)).toBe(true);
    expect(shaped.find((option) => option.id === optionA)).toMatchObject({ count: 4, selected: true });
    expect(shaped.find((option) => option.id === optionB)).toMatchObject({ count: 2, selected: false });
  });

  it("does not treat the caller's vote as the anonymous total", () => {
    const shaped = shapePollResult({
      anonymous: true,
      viewerUserId: viewer,
      options: [{ id: optionA, label: "Yes", position: 0 }],
      votes: [{ optionId: optionA, userId: viewer }],
      counts: null,
    });
    expect(shaped[0]?.count).toBeNull();
    expect(shaped[0]?.voterIds).toEqual([]);
  });
});

describe("expired polls", () => {
  it("rejects a vote after expires_at", () => {
    const now = Date.parse("2026-10-02T12:00:00.000Z");
    expect(
      chatPollVoteBlock({
        expiresAt: "2026-10-02T11:59:00.000Z",
        nowMs: now,
        allowMultiple: false,
        optionIds: [optionA],
        alreadyVoted: false,
      }),
    ).toBe("expired");
    expect(
      chatPollVoteBlock({
        expiresAt: "2026-10-03T12:00:00.000Z",
        nowMs: now,
        allowMultiple: false,
        optionIds: [optionA],
        alreadyVoted: false,
      }),
    ).toBeNull();
    expect(
      chatPollVoteBlock({
        expiresAt: null,
        nowMs: now,
        allowMultiple: true,
        optionIds: [optionA, optionB],
        alreadyVoted: false,
      }),
    ).toBeNull();
  });
});

describe("acknowledgements", () => {
  it("keeps one row per user on a message", () => {
    const first = chatAcknowledgementRows([], { messageId, userId: viewer });
    const repeat = chatAcknowledgementRows(first, { messageId, userId: viewer.toUpperCase() });
    const otherUser = chatAcknowledgementRows(repeat, { messageId, userId: other });
    expect(repeat).toHaveLength(1);
    expect(repeat[0]).toEqual({ messageId, userId: viewer });
    expect(otherUser).toHaveLength(2);
  });

  it("shows acknowledge unless require_ack is explicitly false", () => {
    expect(
      announcementRequiresAcknowledgement({
        type: "ANNOUNCEMENT",
        metadata: { require_ack: true },
        contentHidden: false,
      }),
    ).toBe(true);
    expect(
      announcementRequiresAcknowledgement({
        type: "ANNOUNCEMENT",
        metadata: { require_ack: false },
        contentHidden: false,
      }),
    ).toBe(false);
    expect(
      announcementRequiresAcknowledgement({
        type: "ANNOUNCEMENT",
        metadata: {},
        contentHidden: false,
      }),
    ).toBe(true);
    expect(
      announcementRequiresAcknowledgement({
        type: "ANNOUNCEMENT",
        metadata: { require_ack: false },
        contentHidden: true,
      }),
    ).toBe(true);
    expect(
      announcementRequiresAcknowledgement({
        type: "TEXT",
        metadata: { require_ack: true },
        contentHidden: false,
      }),
    ).toBe(false);
  });
});
