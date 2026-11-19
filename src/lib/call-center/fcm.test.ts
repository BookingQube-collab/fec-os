import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));

import {
  buildCallCenterFcmData,
  deliverCallCenterFcmOffer,
  isFirebaseAdminConfigured,
  resetFirebaseAdminForTests,
} from "./fcm";

const ORIGINAL = {
  FIREBASE_ADMIN_PROJECT_ID: process.env.FIREBASE_ADMIN_PROJECT_ID,
  FIREBASE_ADMIN_CLIENT_EMAIL: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON,
  FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH,
};

function clearFirebaseEnv() {
  delete process.env.FIREBASE_ADMIN_PROJECT_ID;
  delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH;
}

afterEach(() => {
  clearFirebaseEnv();
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetFirebaseAdminForTests();
  vi.restoreAllMocks();
});

describe("isFirebaseAdminConfigured", () => {
  it("is false when env is empty", () => {
    clearFirebaseEnv();
    expect(isFirebaseAdminConfigured({})).toBe(false);
  });

  it("is true when project + client + key are set", () => {
    expect(
      isFirebaseAdminConfigured({
        FIREBASE_ADMIN_PROJECT_ID: "fec-cc",
        FIREBASE_ADMIN_CLIENT_EMAIL: "svc@fec-cc.iam.gserviceaccount.com",
        FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
      }),
    ).toBe(true);
  });

  it("is true when service account JSON is set", () => {
    expect(
      isFirebaseAdminConfigured({
        FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
      }),
    ).toBe(true);
  });
});

describe("buildCallCenterFcmData", () => {
  it("shapes offer payload for the Android shell", () => {
    expect(
      buildCallCenterFcmData({
        callId: "11111111-1111-4111-8111-111111111111",
        from: "+97455550000",
        queue: "InflataPark",
      }),
    ).toEqual({
      type: "incoming_call",
      callId: "11111111-1111-4111-8111-111111111111",
      from: "+97455550000",
      queue: "InflataPark",
      deepLink: "/call-center?callId=11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("deliverCallCenterFcmOffer", () => {
  it("no-ops without Firebase config (does not throw)", async () => {
    clearFirebaseEnv();
    resetFirebaseAdminForTests();
    const result = await deliverCallCenterFcmOffer(
      ["user-1"],
      { callId: "c1", from: "+9741", queue: "General" },
    );
    expect(result.configured).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("firebase_not_configured");
    expect(result.attempted).toBe(0);
  });

  it("skips when there are no recipient user ids", async () => {
    clearFirebaseEnv();
    const result = await deliverCallCenterFcmOffer([], {
      callId: "c1",
      from: "+9741",
      queue: "General",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_recipients");
  });
});
