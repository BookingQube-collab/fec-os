import { describe, expect, it } from "vitest";

import {
  canShowIncomingOffer,
  pickActiveIncomingOffer,
  shouldSkipHoldMusic,
} from "./incoming-offer";
import type { CallCenterCall } from "./types";

function call(partial: Partial<CallCenterCall> & Pick<CallCenterCall, "id" | "status">): CallCenterCall {
  return partial as CallCenterCall;
}

describe("canShowIncomingOffer", () => {
  it("allows only Available agents with no active call or ACW timer", () => {
    expect(
      canShowIncomingOffer({ workspaceStatus: "available", activeCall: false, acwRemaining: null }),
    ).toBe(true);
    expect(
      canShowIncomingOffer({ workspaceStatus: "acw", activeCall: false, acwRemaining: 19 }),
    ).toBe(false);
    expect(
      canShowIncomingOffer({ workspaceStatus: "available", activeCall: true, acwRemaining: null }),
    ).toBe(false);
    expect(
      canShowIncomingOffer({ workspaceStatus: "available", activeCall: false, acwRemaining: 5 }),
    ).toBe(false);
    expect(
      canShowIncomingOffer({ workspaceStatus: "busy", activeCall: false, acwRemaining: null }),
    ).toBe(false);
  });
});

describe("pickActiveIncomingOffer", () => {
  it("returns the first ringing/offered/queued candidate", () => {
    const offered = call({ id: "a", status: "offered" });
    expect(pickActiveIncomingOffer([offered])).toEqual(offered);
  });

  it("suppresses stale offers that Recent already marked declined/missed/ended", () => {
    const stale = call({ id: "a", status: "offered" });
    const recent = call({ id: "a", status: "declined" });
    expect(pickActiveIncomingOffer([stale], [recent])).toBeNull();
  });

  it("skips non-offer statuses", () => {
    expect(pickActiveIncomingOffer([call({ id: "a", status: "ivr" })])).toBeNull();
    expect(pickActiveIncomingOffer([call({ id: "a", status: "answered" })])).toBeNull();
  });
});

describe("shouldSkipHoldMusic", () => {
  it("skips when Answer claimed or bridge in progress", () => {
    expect(shouldSkipHoldMusic({ status: "offered", metadata: { answerClaimedBy: "u1" } })).toBe(true);
    expect(shouldSkipHoldMusic({ status: "queued", metadata: { bridgeInProgress: true } })).toBe(true);
    expect(shouldSkipHoldMusic({ status: "offered", metadata: { bridgedAt: "2026-01-01" } })).toBe(true);
    expect(shouldSkipHoldMusic({ status: "answered", metadata: null })).toBe(true);
    expect(shouldSkipHoldMusic({ status: "offered", metadata: null })).toBe(false);
  });
});
