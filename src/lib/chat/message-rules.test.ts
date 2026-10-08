import { describe, expect, it } from "vitest";

import { mapChatError } from "./group-rules";
import {
  CHAT_TEXT_BODY_MAX,
  CHAT_TEXT_RATE_PER_MINUTE,
  addReactionSchema,
  chatCallerCanPost,
  chatGroupsWithPrevious,
  chatKeysetFilter,
  chatKeysetThroughFilter,
  chatMessageIsBeforeCursor,
  chatReadCoversMessage,
  chatReadCursorAdvances,
  chatRealtimeStatusFromChannel,
  chatResolveClientMessageId,
  chatStripRealtimeContent,
  chatTextBodyIssue,
  removeReactionSchema,
  sendTextMessageSchema,
} from "./message-rules";

const older = "2026-10-02T10:00:00.000Z";
const newer = "2026-10-02T10:05:00.000Z";
const lowId = "11111111-1111-4111-8111-111111111111";
const highId = "22222222-2222-4222-8222-222222222222";

describe("chat message cursor", () => {
  it("keeps rows strictly before the cursor in descending created_at, id order", () => {
    expect(chatMessageIsBeforeCursor({ createdAt: older, id: highId }, { createdAt: newer, id: lowId })).toBe(true);
    expect(chatMessageIsBeforeCursor({ createdAt: newer, id: lowId }, { createdAt: older, id: highId })).toBe(false);
    expect(chatMessageIsBeforeCursor({ createdAt: newer, id: lowId }, { createdAt: newer, id: highId })).toBe(true);
    expect(chatMessageIsBeforeCursor({ createdAt: newer, id: highId }, { createdAt: newer, id: lowId })).toBe(false);
    expect(chatMessageIsBeforeCursor({ createdAt: newer, id: lowId }, { createdAt: newer, id: lowId })).toBe(false);
  });

  it("builds a quoted keyset filter without offset", () => {
    const filter = chatKeysetFilter({ createdAt: newer, id: lowId });
    expect(filter).toContain(`created_at.lt."${newer}"`);
    expect(filter).toContain(`created_at.eq."${newer}"`);
    expect(filter).toContain(`id.lt."${lowId}"`);
    expect(filter).not.toContain("offset");
    expect(() => chatKeysetFilter({ createdAt: "yesterday", id: lowId })).toThrow(/Chat request failed/);
  });

  it("includes the anchored message when loading that cursor", () => {
    const filter = chatKeysetThroughFilter({ createdAt: newer, id: lowId });
    expect(filter).toContain(`created_at.lt."${newer}"`);
    expect(filter).toContain(`id.lte."${lowId}"`);
    expect(filter).not.toContain("offset");
    expect(() => chatKeysetThroughFilter({ createdAt: "yesterday", id: lowId })).toThrow(/Chat request failed/);
  });
});

describe("chat text body", () => {
  it("accepts 1 to 8000 plain characters and rejects empty, long, and html tags", () => {
    expect(chatTextBodyIssue("  hi  ")).toBeNull();
    expect(chatTextBodyIssue("   ")).toBe("empty");
    expect(chatTextBodyIssue("a".repeat(CHAT_TEXT_BODY_MAX))).toBeNull();
    expect(chatTextBodyIssue("a".repeat(CHAT_TEXT_BODY_MAX + 1))).toBe("long");
    expect(chatTextBodyIssue("3 < 4 and <3")).toBeNull();
    expect(chatTextBodyIssue("hello <b>there</b>")).toBe("html");
    expect(chatTextBodyIssue("<script>alert(1)</script>")).toBe("html");
    expect(sendTextMessageSchema.safeParse({ conversationId: lowId, body: "<i>x</i>", clientMessageId: highId }).success).toBe(
      false,
    );
    expect(sendTextMessageSchema.safeParse({ conversationId: lowId, body: "hello", clientMessageId: highId }).success).toBe(
      true,
    );
  });
});

describe("chat idempotency key", () => {
  it("reuses the client id for retry and in-flight sends", () => {
    expect(
      chatResolveClientMessageId({ status: "failed", clientMessageId: lowId, nextId: highId }),
    ).toBe(lowId);
    expect(
      chatResolveClientMessageId({ status: "sending", clientMessageId: lowId, nextId: highId }),
    ).toBe(lowId);
    expect(chatResolveClientMessageId({ status: "uploading", clientMessageId: lowId, nextId: highId })).toBe(lowId);
    expect(chatResolveClientMessageId({ status: "sent", clientMessageId: lowId, nextId: highId })).toBe(highId);
    expect(chatResolveClientMessageId({ status: null, clientMessageId: null, nextId: highId })).toBe(highId);
  });
});

describe("chat realtime payload", () => {
  it("drops body and metadata and maps channel status", () => {
    const payload = {
      new: { id: lowId, body: "secret", metadata: { token: "nope" } },
      old: { body: "previous", metadata: { a: 1 } },
    };
    chatStripRealtimeContent(payload);
    expect(payload.new).toEqual({ id: lowId });
    expect(payload.old).toEqual({});
    expect(chatRealtimeStatusFromChannel("SUBSCRIBED")).toBe("subscribed");
    expect(chatRealtimeStatusFromChannel("TIMED_OUT")).toBe("reconnecting");
    expect(chatRealtimeStatusFromChannel("CHANNEL_ERROR")).toBe("error");
    expect(chatRealtimeStatusFromChannel("CLOSED", "connecting")).toBe("reconnecting");
    expect(chatRealtimeStatusFromChannel("CLOSED", "closed")).toBe("closed");
  });
});

describe("chat posting gate", () => {
  it("blocks read-only roles, read-only policy, and archived rooms", () => {
    expect(chatCallerCanPost({ role: "MEMBER", postingPolicy: "MEMBERS", archivedAt: null })).toBe(true);
    expect(chatCallerCanPost({ role: "READ_ONLY", postingPolicy: "MEMBERS", archivedAt: null })).toBe(false);
    expect(chatCallerCanPost({ role: "MEMBER", postingPolicy: "ADMINS_ONLY", archivedAt: null })).toBe(false);
    expect(chatCallerCanPost({ role: "ADMIN", postingPolicy: "ADMINS_ONLY", archivedAt: null })).toBe(true);
    expect(chatCallerCanPost({ role: "OWNER", postingPolicy: "MEMBERS", archivedAt: newer })).toBe(false);
    expect(CHAT_TEXT_RATE_PER_MINUTE).toBe(30);
  });

  it("groups consecutive text from the same sender within five minutes", () => {
    const base = {
      senderId: lowId,
      type: "TEXT",
      createdAt: older,
      contentHidden: false,
      body: "one",
    };
    expect(
      chatGroupsWithPrevious(base, { ...base, createdAt: "2026-10-02T10:04:00.000Z", body: "two" }),
    ).toBe(true);
    expect(
      chatGroupsWithPrevious(base, { ...base, createdAt: "2026-10-02T10:06:00.000Z", body: "two" }),
    ).toBe(false);
    expect(chatGroupsWithPrevious(base, { ...base, body: null, contentHidden: true })).toBe(false);
  });
});

describe("chat read cursor", () => {
  it("moves forward only", () => {
    const olderCursor = { createdAt: older, id: lowId };
    const newerCursor = { createdAt: newer, id: highId };
    expect(chatReadCursorAdvances(null, olderCursor)).toBe(true);
    expect(chatReadCursorAdvances(olderCursor, newerCursor)).toBe(true);
    expect(chatReadCursorAdvances(newerCursor, olderCursor)).toBe(false);
    expect(chatReadCursorAdvances({ createdAt: newer, id: lowId }, { createdAt: newer, id: highId })).toBe(true);
    expect(chatReadCursorAdvances({ createdAt: newer, id: highId }, { createdAt: newer, id: lowId })).toBe(false);
    expect(chatReadCursorAdvances(newerCursor, newerCursor)).toBe(false);
    expect(chatReadCoversMessage(null, olderCursor)).toBe(false);
    expect(chatReadCoversMessage(newerCursor, olderCursor)).toBe(true);
    expect(chatReadCoversMessage(newerCursor, newerCursor)).toBe(true);
    expect(chatReadCoversMessage(olderCursor, newerCursor)).toBe(false);
  });
});

describe("chat reactions and replies", () => {
  it("rejects empty emoji and markup, and requires a uuid reply id", () => {
    expect(addReactionSchema.safeParse({ messageId: lowId, emoji: "👍" }).success).toBe(true);
    expect(addReactionSchema.safeParse({ messageId: lowId, emoji: "   " }).success).toBe(false);
    expect(addReactionSchema.safeParse({ messageId: lowId, emoji: "<img>" }).success).toBe(false);
    expect(addReactionSchema.safeParse({ messageId: lowId, emoji: "a>b" }).success).toBe(false);
    expect(addReactionSchema.safeParse({ messageId: lowId, emoji: "x".repeat(33) }).success).toBe(false);
    expect(removeReactionSchema.safeParse({ messageId: "not-a-uuid", emoji: "👍" }).success).toBe(false);
    expect(
      sendTextMessageSchema.safeParse({
        conversationId: lowId,
        body: "hello",
        clientMessageId: highId,
        replyToMessageId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      sendTextMessageSchema.safeParse({
        conversationId: lowId,
        body: "hello",
        clientMessageId: highId,
        replyToMessageId: lowId,
      }).success,
    ).toBe(true);
    expect(sendTextMessageSchema.safeParse({ conversationId: lowId, body: "hello", clientMessageId: highId }).success).toBe(
      true,
    );
  });
});

describe("mapChatError message denials", () => {
  it("maps rate limit, archive, and post denials without SQL", () => {
    const leaked = "SELECT body FROM chat_messages WHERE id = 'secret'";
    expect(mapChatError({ message: "chat message rate limit exceeded", details: leaked })).toBe(
      "You are sending messages too quickly. Wait a moment and try again.",
    );
    expect(mapChatError({ message: "cannot post in an archived conversation", details: leaked })).toBe(
      "This conversation is archived.",
    );
    expect(mapChatError({ message: "cannot post this message type", details: leaked })).toBe(
      "You cannot send a message in this conversation.",
    );
    expect(mapChatError({ message: "cannot post this message type", details: leaked })).not.toContain("SELECT");
  });
});
