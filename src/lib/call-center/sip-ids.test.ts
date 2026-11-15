import { describe, expect, it } from "vitest";

import {
  isLiveKitDispatchRuleIdShape,
  isLiveKitTrunkIdShape,
  looksLikeSipHostNotId,
} from "./sip-ids";

describe("looksLikeSipHostNotId", () => {
  it("detects LiveKit SIP hosts", () => {
    expect(looksLikeSipHostNotId("k4xpylvcnur.sip.livekit.cloud")).toBe(true);
    expect(looksLikeSipHostNotId("sip:k4xpylvcnur.sip.livekit.cloud")).toBe(true);
    expect(looksLikeSipHostNotId("https://example.sip.livekit.cloud")).toBe(true);
  });

  it("allows real trunk / dispatch ids", () => {
    expect(looksLikeSipHostNotId("ST_abc123XYZ")).toBe(false);
    expect(looksLikeSipHostNotId("SDR_abc123XYZ")).toBe(false);
    expect(looksLikeSipHostNotId("")).toBe(false);
  });
});

describe("LiveKit id shapes", () => {
  it("matches ST_ / SDR_ prefixes", () => {
    expect(isLiveKitTrunkIdShape("ST_abc123")).toBe(true);
    expect(isLiveKitTrunkIdShape("k4xpylvcnur.sip.livekit.cloud")).toBe(false);
    expect(isLiveKitDispatchRuleIdShape("SDR_abc123")).toBe(true);
    expect(isLiveKitDispatchRuleIdShape("ST_abc123")).toBe(false);
  });
});
