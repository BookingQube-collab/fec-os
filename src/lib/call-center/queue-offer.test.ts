import { describe, expect, it } from "vitest";

import {
  appendDeclinedAgent,
  isOrderedQueueStrategy,
  shouldAdvanceSequentialOffer,
} from "./queue-offer";

describe("isOrderedQueueStrategy", () => {
  it("treats sequential / round_robin / longest_idle as ordered", () => {
    expect(isOrderedQueueStrategy("sequential")).toBe(true);
    expect(isOrderedQueueStrategy("round_robin")).toBe(true);
    expect(isOrderedQueueStrategy("longest_idle")).toBe(true);
    expect(isOrderedQueueStrategy("simultaneous")).toBe(false);
  });
});

describe("shouldAdvanceSequentialOffer", () => {
  const offeredAt = "2026-11-19T12:00:00.000Z";
  const t0 = Date.parse(offeredAt);

  it("advances sequential offers after offer_ring_seconds", () => {
    expect(
      shouldAdvanceSequentialOffer({
        status: "offered",
        strategy: "sequential",
        offerRingSeconds: 15,
        offeredAt,
        nowMs: t0 + 14_000,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceSequentialOffer({
        status: "offered",
        strategy: "sequential",
        offerRingSeconds: 15,
        offeredAt,
        nowMs: t0 + 15_000,
      }),
    ).toBe(true);
  });

  it("does not advance simultaneous or ring-seconds=0", () => {
    expect(
      shouldAdvanceSequentialOffer({
        status: "offered",
        strategy: "simultaneous",
        offerRingSeconds: 15,
        offeredAt,
        nowMs: t0 + 60_000,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceSequentialOffer({
        status: "offered",
        strategy: "sequential",
        offerRingSeconds: 0,
        offeredAt,
        nowMs: t0 + 60_000,
      }),
    ).toBe(false);
  });

  it("does not advance non-offered statuses", () => {
    expect(
      shouldAdvanceSequentialOffer({
        status: "queued",
        strategy: "sequential",
        offerRingSeconds: 15,
        offeredAt,
        nowMs: t0 + 60_000,
      }),
    ).toBe(false);
  });

  it("advances round_robin when offer_ring_seconds is set", () => {
    expect(
      shouldAdvanceSequentialOffer({
        status: "offered",
        strategy: "round_robin",
        offerRingSeconds: 10,
        offeredAt,
        nowMs: t0 + 10_000,
      }),
    ).toBe(true);
  });
});

describe("appendDeclinedAgent", () => {
  it("dedupes declined agents for cascade skip", () => {
    expect(appendDeclinedAgent(["a"], "b")).toEqual(["a", "b"]);
    expect(appendDeclinedAgent(["a"], "a")).toEqual(["a"]);
    expect(appendDeclinedAgent(null, "a")).toEqual(["a"]);
  });
});
