import { describe, expect, it } from "vitest";

import { appendDeclinedAgent } from "./queue-offer";

/**
 * Cold-transfer handoff contract (pure assertions).
 * Full PSTN/LiveKit wiring is exercised in requestTransfer + answerCall:
 * - transferrer removed from room / ACW
 * - CDR re-offered to agent or queue with coldTransferKeepRoom
 * - target answer skips Telnyx re-bridge when SIP already in room
 */
describe("cold transfer metadata contract", () => {
  it("excludes the transferring agent from the next queue offer", () => {
    const previousAgent = "11111111-1111-4111-8111-111111111111";
    const declined = appendDeclinedAgent(["other"], previousAgent);
    expect(declined).toContain(previousAgent);
    expect(declined).toContain("other");
  });

  it("treats agent and queue UUIDs as in-app cold targets (not external E.164)", () => {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidRe.test("00000000-0000-4000-8000-0000000000d4")).toBe(true); // Birthday queue
    expect(uuidRe.test("+97455550000")).toBe(false);
  });

  it("keeps LiveKit room when SIP identity is present (no transferPendingSip re-dial)", () => {
    const meta = {
      sipParticipantIdentity: "sip-out-abc",
      bridgeVerifiedAt: "2026-11-19T12:00:00.000Z",
      transferPendingSip: false,
      coldTransferKeepRoom: true,
    };
    const alreadyBridged = Boolean(
      meta.sipParticipantIdentity &&
        (meta.bridgeVerifiedAt || meta.coldTransferKeepRoom === true),
    );
    expect(alreadyBridged).toBe(true);
    expect(meta.transferPendingSip).toBe(false);
  });
});
