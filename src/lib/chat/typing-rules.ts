/**
 * Ephemeral typing signals for an open chat.
 * The browser broadcasts these on the conversation presence channel.
 * Nothing is written per keystroke. The sender is never a visible peer.
 */

export const CHAT_TYPING_HEARTBEAT_MS = 2000;
export const CHAT_TYPING_IDLE_MS = 3000;
/** Outlives one throttled heartbeat plus the idle clear, so the indicator does not blink off mid-sentence. */
export const CHAT_TYPING_TTL_MS = CHAT_TYPING_HEARTBEAT_MS + CHAT_TYPING_IDLE_MS;

export type ChatTypingPeer = {
  userId: string;
  expiresAt: number;
};

export type ChatTypingSignal = {
  userId: string;
  typing: boolean;
};

export type ChatTypingLabel =
  | { kind: "none" }
  | { kind: "someone" }
  | { kind: "named"; name: string }
  | { kind: "many"; names: string };

export function nextTypingEmit(
  typing: boolean,
  now: number,
  lastTrueAt: number,
  heartbeatMs = CHAT_TYPING_HEARTBEAT_MS,
): { emit: boolean; lastTrueAt: number } {
  if (!typing) return { emit: true, lastTrueAt: 0 };
  if (lastTrueAt > 0 && now - lastTrueAt < heartbeatMs) return { emit: false, lastTrueAt };
  return { emit: true, lastTrueAt: now };
}

export function chatTypingSignalFromUnknown(value: unknown): ChatTypingSignal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.payload;
  const source =
    nested && typeof nested === "object" && !Array.isArray(nested) ? (nested as Record<string, unknown>) : record;
  const userId = source.userId;
  if (typeof userId !== "string" || userId.length === 0) return null;
  return { userId, typing: source.typing === true };
}

export function expireChatTypingPeers(peers: readonly ChatTypingPeer[], now: number): ChatTypingPeer[] {
  const next = peers.filter((peer) => peer.expiresAt > now);
  return next.length === peers.length ? (peers as ChatTypingPeer[]) : next;
}

export function applyChatTypingSignal(
  peers: readonly ChatTypingPeer[],
  signal: ChatTypingSignal,
  selfId: string | null,
  now: number,
  ttlMs = CHAT_TYPING_TTL_MS,
): ChatTypingPeer[] {
  const live = expireChatTypingPeers(peers, now);
  if (!signal.userId || (selfId != null && signal.userId === selfId)) return live;
  const without = live.filter((peer) => peer.userId !== signal.userId);
  if (!signal.typing) return without.length === live.length ? live : without;
  const next = [...without, { userId: signal.userId, expiresAt: now + ttlMs }];
  next.sort((left, right) => left.userId.localeCompare(right.userId));
  return next;
}

export function chatTypingLabel(
  peers: readonly ChatTypingPeer[],
  nameFor: (userId: string) => string | null | undefined,
  now: number,
): ChatTypingLabel {
  const active = expireChatTypingPeers(peers, now);
  if (active.length === 0) return { kind: "none" };
  const names: string[] = [];
  for (const peer of active) {
    const name = nameFor(peer.userId)?.trim();
    if (name) names.push(name);
  }
  names.sort((left, right) => left.localeCompare(right));
  if (names.length === 0) return { kind: "someone" };
  if (names.length === 1) return { kind: "named", name: names[0] ?? "" };
  return { kind: "many", names: names.join(", ") };
}
