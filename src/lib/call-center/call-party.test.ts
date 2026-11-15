import { describe, expect, it } from "vitest";

import { collectOwnedE164s, isPhantomDidInbound, remotePartyE164 } from "./call-party";

describe("call-party", () => {
  const owned = collectOwnedE164s({
    outboundCallerIdE164: "+18704772102",
    didE164s: ["+18704772102"],
  });

  it("shows customer ANI for inbound", () => {
    expect(
      remotePartyE164(
        { direction: "inbound", fromE164: "+97466768618", toE164: "+18704772102" },
        owned,
      ),
    ).toBe("+97466768618");
  });

  it("does not show DID as customer", () => {
    expect(
      remotePartyE164(
        { direction: "inbound", fromE164: "+18704772102", toE164: "+7327404554438047" },
        owned,
      ),
    ).toBe("");
  });

  it("detects phantom DID bridge rows", () => {
    expect(
      isPhantomDidInbound(
        {
          direction: "inbound",
          fromE164: "+18704772102",
          toE164: "+7327404554438047",
          provider: "livekit_sip",
          livekitRoom: "cc-_+18704772102_pKbU3jHJqYWs",
          metadata: { livekitSipInbound: true },
        },
        owned,
      ),
    ).toBe(true);
  });

  it("keeps real Telnyx inbound", () => {
    expect(
      isPhantomDidInbound(
        {
          direction: "inbound",
          fromE164: "+97466768618",
          toE164: "+18704772102",
          provider: "telnyx",
          livekitRoom: "cc-7de32740d455443b8cfec047",
        },
        owned,
      ),
    ).toBe(false);
  });
});
