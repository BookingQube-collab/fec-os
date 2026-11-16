import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  parseInstagramInboundMessages,
  verifyMetaHubSignature,
  verifyMetaWebhookChallenge,
} from "./webhook";

describe("verifyMetaWebhookChallenge", () => {
  it("returns challenge when mode/token match", () => {
    expect(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "secret-token",
        challenge: "12345",
        expectedToken: "secret-token",
      }),
    ).toBe("12345");
  });

  it("rejects bad token or mode", () => {
    expect(
      verifyMetaWebhookChallenge({
        mode: "subscribe",
        token: "wrong",
        challenge: "12345",
        expectedToken: "secret-token",
      }),
    ).toBeNull();
  });
});

describe("verifyMetaHubSignature", () => {
  it("validates sha256 HMAC", () => {
    const secret = "app-secret";
    const rawBody = '{"object":"instagram"}';
    const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    expect(
      verifyMetaHubSignature({
        rawBody,
        signatureHeader: `sha256=${digest}`,
        appSecret: secret,
      }),
    ).toBe(true);
  });

  it("fails closed when requireSignature and secret missing", () => {
    expect(
      verifyMetaHubSignature({
        rawBody: "{}",
        signatureHeader: null,
        appSecret: "",
        requireSignature: true,
      }),
    ).toBe(false);
  });
});

describe("parseInstagramInboundMessages", () => {
  it("parses Messenger-style messaging arrays", () => {
    const parsed = parseInstagramInboundMessages({
      object: "instagram",
      entry: [
        {
          messaging: [
            {
              sender: { id: "igsid_1" },
              recipient: { id: "page_1" },
              timestamp: 1,
              message: { mid: "m1", text: "hi" },
            },
          ],
        },
      ],
    });
    expect(parsed).toEqual([
      {
        senderId: "igsid_1",
        recipientId: "page_1",
        mid: "m1",
        text: "hi",
        isEcho: false,
        timestamp: 1,
      },
    ]);
  });
});
