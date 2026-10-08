import { describe, expect, it } from "vitest";

import {
  CHAT_NOTIFY_PREVIEW_MAX,
  chatMentionTargets,
  chatNotificationPreview,
  chatPlainPreview,
  resolveChatNotificationLevel,
  shouldNotifyChatRecipient,
  shouldSendChatEmail,
  shouldSendChatPush,
} from "./notification-rules";

const sender = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const member = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const outsider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("chat notification preference resolution", () => {
  it("lets a conversation MUTED row beat a global ALL row", () => {
    const level = resolveChatNotificationLevel("MUTED", "ALL");
    expect(level).toBe("MUTED");
    expect(shouldNotifyChatRecipient({ level, mentioned: true, inserted: true })).toBe(false);
  });

  it("uses the global row when the conversation row is absent", () => {
    expect(resolveChatNotificationLevel(null, "MENTIONS")).toBe("MENTIONS");
    expect(resolveChatNotificationLevel(undefined, "MUTED")).toBe("MUTED");
    expect(
      shouldNotifyChatRecipient({
        level: resolveChatNotificationLevel(null, "MENTIONS"),
        mentioned: false,
        inserted: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyChatRecipient({
        level: resolveChatNotificationLevel(null, "MENTIONS"),
        mentioned: true,
        inserted: true,
      }),
    ).toBe(true);
  });

  it("defaults to ALL when neither row is set", () => {
    const level = resolveChatNotificationLevel(null, null);
    expect(level).toBe("ALL");
    expect(resolveChatNotificationLevel("NOPE", "")).toBe("ALL");
    expect(shouldNotifyChatRecipient({ level, mentioned: false, inserted: true })).toBe(true);
  });

  it("does not notify on an idempotent replay", () => {
    expect(shouldNotifyChatRecipient({ level: "ALL", mentioned: true, inserted: false })).toBe(false);
    expect(shouldNotifyChatRecipient({ level: "MENTIONS", mentioned: true, inserted: false })).toBe(false);
    expect(shouldNotifyChatRecipient({ level: "MUTED", mentioned: false, inserted: false })).toBe(false);
  });

  it("skips browser push until it is configured and skips email unless the user opted in", () => {
    expect(shouldSendChatPush(false)).toBe(false);
    expect(shouldSendChatPush(true)).toBe(true);
    expect(shouldSendChatEmail({ webhookConfigured: false, channelEmail: true })).toBe(false);
    expect(shouldSendChatEmail({ webhookConfigured: true, channelEmail: false })).toBe(false);
    expect(shouldSendChatEmail({ webhookConfigured: true, channelEmail: true })).toBe(true);
  });
});

describe("chat notification preview", () => {
  it("strips angle brackets and keeps the preview within 140 characters", () => {
    expect(chatPlainPreview("3 < 4 and <3")).toBe("3 4 and 3");
    expect(chatNotificationPreview({ body: "hello <b>there</b>", messageType: "TEXT" })).toBe("hello bthere/b");
    const long = "é".repeat(CHAT_NOTIFY_PREVIEW_MAX + 10);
    const preview = chatNotificationPreview({ body: long, messageType: "TEXT" });
    expect(Array.from(preview)).toHaveLength(CHAT_NOTIFY_PREVIEW_MAX);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.includes("<")).toBe(false);
    expect(chatNotificationPreview({ body: "   ", messageType: "VOICE_NOTE" })).toBe("Voice note");
    expect(chatNotificationPreview({ body: null, messageType: "IMAGE" })).toBe("Photo");
  });

  it("keeps only validated member ids and never the sender", () => {
    expect(chatMentionTargets([member, member, sender, outsider, "not-a-uuid"], [member, sender], sender)).toEqual([
      member,
    ]);
    expect(chatMentionTargets(undefined, [member], sender)).toEqual([]);
  });
});
