import { afterEach, describe, expect, it } from "vitest";

import { encryptSecret, parseEncryptionKey } from "@/lib/ai/crypto";

import {
  SENDPULSE_WEBHOOK_SECRET_DECRYPT_ERROR,
  revealSendPulseWebhookSecretFromSettings,
} from "./sendpulse-secret";

const TEST_KEY_HEX = "a".repeat(64);
const TEST_KEY = parseEncryptionKey(TEST_KEY_HEX);
const OTHER_KEY_HEX = "b".repeat(64);

describe("revealSendPulseWebhookSecretFromSettings", () => {
  const prevKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  const prevSendPulse = process.env.SENDPULSE_WEBHOOK_SECRET;
  const prevShared = process.env.CALL_CENTER_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = prevKey;
    process.env.SENDPULSE_WEBHOOK_SECRET = prevSendPulse;
    process.env.CALL_CENTER_WEBHOOK_SECRET = prevShared;
  });

  it("returns decrypted admin secret when sealed value is present", () => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY_HEX;
    process.env.SENDPULSE_WEBHOOK_SECRET = "env-should-not-win";
    const sealed = encryptSecret("admin-sendpulse-secret-D9sG", TEST_KEY);
    expect(
      revealSendPulseWebhookSecretFromSettings({
        sendpulse_webhook_secret: sealed,
        webhook_shared_secret: "",
      }),
    ).toBe("admin-sendpulse-secret-D9sG");
  });

  it("falls back to env when admin field is empty (Reveal must not say nothing saved)", () => {
    process.env.SENDPULSE_WEBHOOK_SECRET = "env-secret-D9sG";
    expect(
      revealSendPulseWebhookSecretFromSettings({
        sendpulse_webhook_secret: "",
        webhook_shared_secret: "",
      }),
    ).toBe("env-secret-D9sG");
  });

  it("falls back to shared webhook secret when admin and SENDPULSE env are empty", () => {
    delete process.env.SENDPULSE_WEBHOOK_SECRET;
    delete process.env.CALL_CENTER_WEBHOOK_SECRET;
    expect(
      revealSendPulseWebhookSecretFromSettings({
        sendpulse_webhook_secret: "",
        webhook_shared_secret: "shared-secret-ZZ99",
      }),
    ).toBe("shared-secret-ZZ99");
  });

  it("throws a clear decrypt error when AI_CREDENTIALS_ENCRYPTION_KEY mismatches", () => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY_HEX;
    const sealed = encryptSecret("admin-secret", TEST_KEY);
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = OTHER_KEY_HEX;
    expect(() =>
      revealSendPulseWebhookSecretFromSettings({
        sendpulse_webhook_secret: sealed,
        webhook_shared_secret: "",
      }),
    ).toThrow(SENDPULSE_WEBHOOK_SECRET_DECRYPT_ERROR);
  });
});
