/**
 * Pure helpers for sequential / ordered queue offer timing.
 * Kept free of server-only imports so vitest can cover timeout advance logic.
 */

export type QueueOfferStrategy =
  | "simultaneous"
  | "round_robin"
  | "longest_idle"
  | "sequential";

/** Ordered strategies offer one agent; simultaneous rings everyone. */
export function isOrderedQueueStrategy(strategy: QueueOfferStrategy | string): boolean {
  return strategy === "sequential" || strategy === "round_robin" || strategy === "longest_idle";
}

/**
 * True when an offered call should skip the current agent and ring the next.
 * Uses offeredAt (reset on each offerCallToQueue) vs offer_ring_seconds.
 */
export function shouldAdvanceSequentialOffer(params: {
  status: string;
  strategy: QueueOfferStrategy | string;
  offerRingSeconds: number;
  offeredAt: string | null | undefined;
  nowMs?: number;
}): boolean {
  if (params.status !== "offered") return false;
  if (!isOrderedQueueStrategy(params.strategy)) return false;
  const ringSec = Math.max(0, Number(params.offerRingSeconds) || 0);
  if (ringSec <= 0) return false;
  if (!params.offeredAt) return false;
  const offeredMs = new Date(params.offeredAt).getTime();
  if (!Number.isFinite(offeredMs)) return false;
  const nowMs = params.nowMs ?? Date.now();
  const ageSec = Math.floor((nowMs - offeredMs) / 1000);
  return ageSec >= ringSec;
}

export function appendDeclinedAgent(
  declinedRaw: unknown,
  agentUserId: string,
): string[] {
  const prior = Array.isArray(declinedRaw)
    ? declinedRaw.filter((id): id is string => typeof id === "string")
    : [];
  return [...new Set([...prior, agentUserId])];
}
