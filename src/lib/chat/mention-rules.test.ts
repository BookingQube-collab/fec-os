import { describe, expect, it } from "vitest";

import {
  CHAT_COMPOSER_MENTION_CAP,
  activeMentionQuery,
  applyMentionChoice,
  mentionIdsForSend,
  pruneComposerMentions,
  type ComposerMention,
} from "./mention-rules";

const ada = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bo = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const outsider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function person(index: number): ComposerMention {
  const suffix = (index + 1).toString(16).padStart(12, "0");
  return {
    userId: `dddddddd-dddd-4ddd-8ddd-${suffix}`,
    label: `Person${index + 1}`,
  };
}

describe("composer mention query", () => {
  it("parses the active @query at the caret", () => {
    expect(activeMentionQuery("hi @", 4)).toEqual({ start: 3, query: "" });
    expect(activeMentionQuery("hi @sam", 7)).toEqual({ start: 3, query: "sam" });
    expect(activeMentionQuery("hi @sam", 5)).toEqual({ start: 3, query: "s" });
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMentionQuery("a@b.com", 7)).toBeNull();
    expect(activeMentionQuery("see @Ada Lovelace", 9)).toBeNull();
    expect(activeMentionQuery("@sam please", 5)).toBeNull();
  });
});

describe("composer mention selection", () => {
  it("drops a mention when its label is removed", () => {
    const mentions = [{ userId: ada, label: "Ada Lovelace" }];
    expect(pruneComposerMentions("@Ada Lovelace hello", mentions)).toEqual(mentions);
    expect(pruneComposerMentions("@Ada Lovelace,", mentions)).toEqual(mentions);
    expect(pruneComposerMentions("@Ada", mentions)).toEqual([]);
    expect(pruneComposerMentions("@Adaline", [{ userId: ada, label: "Ada" }])).toEqual([]);
    expect(pruneComposerMentions("hello", mentions)).toEqual([]);
    expect(
      mentionIdsForSend({
        text: "hello",
        mentions,
        requested: [ada],
      }),
    ).toEqual({ ok: true, ids: [] });
  });

  it("rejects more than 10 mentions", () => {
    const mentions = Array.from({ length: CHAT_COMPOSER_MENTION_CAP + 1 }, (_, index) => person(index));
    const text = mentions.map((mention) => `@${mention.label}`).join(" ");
    expect(
      mentionIdsForSend({
        text,
        mentions,
        requested: mentions.map((mention) => mention.userId),
      }),
    ).toEqual({ ok: false, reason: "limit" });

    const kept = mentions.slice(0, CHAT_COMPOSER_MENTION_CAP);
    const draft = `${kept.map((mention) => `@${mention.label}`).join(" ")} @`;
    const extra = person(CHAT_COMPOSER_MENTION_CAP);
    expect(
      applyMentionChoice({
        text: draft,
        caret: draft.length,
        label: extra.label,
        userId: extra.userId,
        mentions: kept,
      }),
    ).toEqual({ ok: false, reason: "limit" });
  });

  it("ignores a user id that was not picked", () => {
    const mentions = [{ userId: ada, label: "Ada" }];
    expect(
      mentionIdsForSend({
        text: "@Ada",
        mentions,
        requested: [ada, outsider, "not-a-uuid"],
      }),
    ).toEqual({ ok: true, ids: [ada] });
    expect(
      mentionIdsForSend({
        text: "@Ada",
        mentions,
        requested: [outsider, bo],
      }),
    ).toEqual({ ok: true, ids: [] });
  });
});
