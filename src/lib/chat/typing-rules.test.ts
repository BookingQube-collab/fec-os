import { describe, expect, it } from "vitest";

import {
  CHAT_TYPING_HEARTBEAT_MS,
  CHAT_TYPING_IDLE_MS,
  CHAT_TYPING_TTL_MS,
  applyChatTypingSignal,
  chatTypingLabel,
  chatTypingSignalFromUnknown,
  expireChatTypingPeers,
  nextTypingEmit,
  type ChatTypingPeer,
} from "./typing-rules";

const agnes = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ruben = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sam = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("typing heartbeat", () => {
  it("emits a stop immediately and lets the next start through", () => {
    const started = nextTypingEmit(true, 1_000, 0);
    expect(started).toEqual({ emit: true, lastTrueAt: 1_000 });

    const held = nextTypingEmit(true, 1_000 + CHAT_TYPING_HEARTBEAT_MS - 1, started.lastTrueAt);
    expect(held).toEqual({ emit: false, lastTrueAt: started.lastTrueAt });

    const stopped = nextTypingEmit(false, 1_500, started.lastTrueAt);
    expect(stopped).toEqual({ emit: true, lastTrueAt: 0 });

    const again = nextTypingEmit(true, 1_600, stopped.lastTrueAt);
    expect(again.emit).toBe(true);
  });

  it("keeps the idle window inside a few seconds and longer than one heartbeat", () => {
    expect(CHAT_TYPING_IDLE_MS).toBeGreaterThanOrEqual(2_000);
    expect(CHAT_TYPING_IDLE_MS).toBeLessThanOrEqual(3_000);
    expect(CHAT_TYPING_TTL_MS).toBeGreaterThanOrEqual(CHAT_TYPING_HEARTBEAT_MS + CHAT_TYPING_IDLE_MS);
  });
});

describe("who is typing", () => {
  it("ignores the sender and drops a peer when they stop or time out", () => {
    const now = 10_000;
    const started = applyChatTypingSignal([], { userId: agnes, typing: true }, ruben, now);
    expect(started).toEqual([{ userId: agnes, expiresAt: now + CHAT_TYPING_TTL_MS }]);

    const self = applyChatTypingSignal(started, { userId: ruben, typing: true }, ruben, now + 100);
    expect(self.map((peer) => peer.userId)).toEqual([agnes]);

    const stopped = applyChatTypingSignal(started, { userId: agnes, typing: false }, ruben, now + 200);
    expect(stopped).toEqual([]);

    const again = applyChatTypingSignal([], { userId: agnes, typing: true }, ruben, now);
    expect(expireChatTypingPeers(again, now + CHAT_TYPING_TTL_MS)).toEqual([]);
    expect(chatTypingLabel(again, () => "Agnes Kirorio", now + CHAT_TYPING_TTL_MS)).toEqual({ kind: "none" });
  });

  it("names one person, lists a group, and falls back when the name is unknown", () => {
    const now = 20_000;
    const peers: ChatTypingPeer[] = [
      { userId: agnes, expiresAt: now + 1000 },
      { userId: ruben, expiresAt: now + 1000 },
      { userId: sam, expiresAt: now + 1000 },
    ];
    const names = new Map<string, string>([
      [agnes, "Agnes Kirorio"],
      [ruben, "Ruben Yaralyan"],
    ]);

    expect(chatTypingLabel(peers.slice(0, 1), (id) => names.get(id), now)).toEqual({
      kind: "named",
      name: "Agnes Kirorio",
    });
    expect(chatTypingLabel(peers.slice(0, 2), (id) => names.get(id), now)).toEqual({
      kind: "many",
      names: "Agnes Kirorio, Ruben Yaralyan",
    });
    expect(chatTypingLabel(peers, (id) => names.get(id), now).kind).toBe("many");
    expect(chatTypingLabel([{ userId: sam, expiresAt: now + 1000 }], () => null, now)).toEqual({ kind: "someone" });
  });

  it("reads a broadcast payload and ignores junk", () => {
    expect(chatTypingSignalFromUnknown({ event: "typing", payload: { userId: agnes, typing: true } })).toEqual({
      userId: agnes,
      typing: true,
    });
    expect(chatTypingSignalFromUnknown({ userId: agnes, typing: false })).toEqual({ userId: agnes, typing: false });
    expect(chatTypingSignalFromUnknown({ payload: { typing: true } })).toBeNull();
    expect(chatTypingSignalFromUnknown(null)).toBeNull();
  });
});
