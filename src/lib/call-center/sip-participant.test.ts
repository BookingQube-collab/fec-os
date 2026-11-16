import { describe, expect, it } from "vitest";

import { isAgentSoftphoneIdentity, looksLikeSipParticipant } from "./sip-participant";

describe("isAgentSoftphoneIdentity", () => {
  it("detects FEC softphone identities", () => {
    expect(isAgentSoftphoneIdentity("cc-agent-82ef566b-7325-41bf-9be1-616aafbe21ae")).toBe(true);
    expect(isAgentSoftphoneIdentity("cc-supervisor-abc")).toBe(true);
    expect(isAgentSoftphoneIdentity("sip_+97450080408")).toBe(false);
  });
});

describe("looksLikeSipParticipant", () => {
  it("accepts SIP kind / sip_ identity / E.164", () => {
    expect(looksLikeSipParticipant({ identity: "x", kind: 3 })).toBe(true);
    expect(looksLikeSipParticipant({ identity: "sip_+97450080408" })).toBe(true);
    expect(looksLikeSipParticipant({ identity: "+97450080408" })).toBe(true);
    expect(
      looksLikeSipParticipant({ identity: "caller-1", attributes: { "sip.callID": "abc" } }),
    ).toBe(true);
  });

  it("rejects agent softphone even when it is the only room participant", () => {
    // Production bug: waitForSip fell back to ANY identity and marked the agent as SIP.
    expect(
      looksLikeSipParticipant({
        identity: "cc-agent-82ef566b-7325-41bf-9be1-616aafbe21ae",
        kind: 0,
      }),
    ).toBe(false);
  });
});
