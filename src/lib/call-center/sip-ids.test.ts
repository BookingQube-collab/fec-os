import { describe, expect, it } from "vitest";

import {
  extractSipHostCandidate,
  isLiveKitDispatchRuleIdShape,
  isLiveKitTrunkIdShape,
  looksLikeSipHostNotId,
  recoverMisplacedOutboundSipHost,
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

describe("extractSipHostCandidate", () => {
  it("strips schemes and paths", () => {
    expect(extractSipHostCandidate("sip:k4xpylvcnur.sip.livekit.cloud")).toBe(
      "k4xpylvcnur.sip.livekit.cloud",
    );
    expect(extractSipHostCandidate("room@k4xpylvcnur.sip.livekit.cloud")).toBe(
      "k4xpylvcnur.sip.livekit.cloud",
    );
  });
});

describe("recoverMisplacedOutboundSipHost", () => {
  it("moves a SIP host into an empty SIP URI field and clears trunk id", () => {
    expect(
      recoverMisplacedOutboundSipHost({
        outboundTrunkId: "k4xpylvcnur.sip.livekit.cloud",
        sipUri: "",
      }),
    ).toEqual({
      outboundTrunkId: "",
      sipUri: "k4xpylvcnur.sip.livekit.cloud",
      recovered: true,
    });
  });

  it("clears trunk id when SIP URI already has the same host", () => {
    expect(
      recoverMisplacedOutboundSipHost({
        outboundTrunkId: "sip:k4xpylvcnur.sip.livekit.cloud",
        sipUri: "k4xpylvcnur.sip.livekit.cloud",
      }),
    ).toEqual({
      outboundTrunkId: "",
      sipUri: "k4xpylvcnur.sip.livekit.cloud",
      recovered: true,
    });
  });

  it("clears trunk id without overwriting a different SIP URI host", () => {
    expect(
      recoverMisplacedOutboundSipHost({
        outboundTrunkId: "k4xpylvcnur.sip.livekit.cloud",
        sipUri: "other.sip.livekit.cloud",
      }),
    ).toEqual({
      outboundTrunkId: "",
      sipUri: "other.sip.livekit.cloud",
      recovered: true,
    });
  });

  it("leaves a real ST_ trunk id alone", () => {
    expect(
      recoverMisplacedOutboundSipHost({
        outboundTrunkId: "ST_abc123XYZ",
        sipUri: "k4xpylvcnur.sip.livekit.cloud",
      }),
    ).toEqual({
      outboundTrunkId: "ST_abc123XYZ",
      sipUri: "k4xpylvcnur.sip.livekit.cloud",
      recovered: false,
    });
  });
});
