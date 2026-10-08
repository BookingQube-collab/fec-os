import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));

import {
  keepPushPrivateKey,
  readPushEnv,
  resolvePushCredentials,
  toClientPushConfig,
  toPublicPushSettings,
  type PushSettingsRow,
} from "./push-settings";

const PUBLIC = "B".repeat(80);
const PRIVATE = "A".repeat(48);
const SUBJECT = "mailto:chat@example.com";

const SERVER_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

function clearPushEnv() {
  for (const key of SERVER_KEYS) delete process.env[key];
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY;
  delete process.env.NEXT_PUBLIC_VAPID_SUBJECT;
}

const disabledEmpty: PushSettingsRow = {
  enabled: false,
  vapid_public_key: "",
  vapid_private_key: "",
};

describe("chat push stays off until keys are saved", () => {
  beforeEach(() => {
    clearPushEnv();
  });

  it("does not send when the settings row is disabled, even if env keys exist", () => {
    process.env.VAPID_PUBLIC_KEY = PUBLIC;
    process.env.VAPID_PRIVATE_KEY = PRIVATE;
    process.env.VAPID_SUBJECT = SUBJECT;
    expect(resolvePushCredentials(disabledEmpty, readPushEnv())).toBeNull();
    expect(toClientPushConfig(null)).toEqual({ enabled: false, publicKey: null });
  });

  it("does not treat public env copies as configuration when the row is missing", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = PUBLIC;
    process.env.NEXT_PUBLIC_VAPID_PRIVATE_KEY = PRIVATE;
    process.env.NEXT_PUBLIC_VAPID_SUBJECT = SUBJECT;
    expect(resolvePushCredentials(null, readPushEnv())).toBeNull();
  });

  it("stays off when keys are saved but the subject is missing", () => {
    const row: PushSettingsRow = {
      enabled: true,
      vapid_public_key: PUBLIC,
      vapid_private_key: PRIVATE,
    };
    expect(resolvePushCredentials(row, readPushEnv())).toBeNull();
  });

  it("sends only after an enabled row has both keys and a server subject", () => {
    process.env.VAPID_SUBJECT = SUBJECT;
    const row: PushSettingsRow = {
      enabled: true,
      vapid_public_key: PUBLIC,
      vapid_private_key: PRIVATE,
    };
    const credentials = resolvePushCredentials(row, readPushEnv());
    expect(credentials).toEqual({ publicKey: PUBLIC, privateKey: PRIVATE, subject: SUBJECT });
    expect(toClientPushConfig(credentials)).toEqual({ enabled: true, publicKey: PUBLIC });
  });
});

describe("chat push client load shape", () => {
  it("never includes the private key", () => {
    const secret = "private-key-must-not-leak-aaaaaaaaaaaaaaaa";
    const pub = toPublicPushSettings({
      enabled: true,
      vapid_public_key: PUBLIC,
      vapid_private_key: secret,
    });
    expect(Object.keys(pub).sort()).toEqual(["enabled", "privateKeySet", "publicKey"]);
    expect(pub.privateKeySet).toBe(true);
    expect(JSON.stringify(pub)).not.toContain(secret);
    expect(JSON.stringify(toClientPushConfig(null))).not.toContain("private");
    expect(keepPushPrivateKey(secret, "")).toBe(secret);
    expect(keepPushPrivateKey(secret, "B".repeat(48))).toBe("B".repeat(48));
  });
});
