import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("./livekit-settings", async () => {
  const actual = await vi.importActual<typeof import("./livekit-settings")>("./livekit-settings");
  return {
    ...actual,
    loadLiveKitSettingsRow: vi.fn(async () => null),
  };
});

import { CallProviderUnconfiguredError, getCallProvider } from "./call-provider";
import {
  keepLiveKitSecret,
  loadLiveKitSettingsRow,
  resolveLiveKitCredentials,
  toPublicLiveKitSettings,
  type LiveKitSettingsRow,
} from "./livekit-settings";

const SERVER_KEYS = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;
const FAKE_SECRET = "unit-test-livekit-secret-value";

function clearServerLiveKitEnv() {
  for (const key of SERVER_KEYS) delete process.env[key];
  delete process.env.NEXT_PUBLIC_LIVEKIT_URL;
  delete process.env.NEXT_PUBLIC_LIVEKIT_API_KEY;
  delete process.env.NEXT_PUBLIC_LIVEKIT_API_SECRET;
}

const tokenRequest = {
  roomName: "fec-chat-00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000001",
  displayName: "Member",
  canPublish: true,
};

describe("getCallProvider", () => {
  beforeEach(() => {
    clearServerLiveKitEnv();
    vi.mocked(loadLiveKitSettingsRow).mockReset();
    vi.mocked(loadLiveKitSettingsRow).mockResolvedValue(null);
  });

  it("stays unconfigured with no database row and no env", async () => {
    const provider = await getCallProvider();
    expect(provider.name).toBe("none");
    await expect(provider.issueToken(tokenRequest)).rejects.toBeInstanceOf(CallProviderUnconfiguredError);
  });

  it("stays none when only some server env vars are set", async () => {
    process.env.LIVEKIT_URL = "wss://example.invalid";
    expect((await getCallProvider()).name).toBe("none");
  });

  it("does not treat public env copies as configuration", async () => {
    process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://example.invalid";
    process.env.NEXT_PUBLIC_LIVEKIT_API_KEY = "public-key";
    process.env.NEXT_PUBLIC_LIVEKIT_API_SECRET = "public-secret";
    expect((await getCallProvider()).name).toBe("none");
  });

  it("issues a short-lived token from env when the database row is missing", async () => {
    process.env.LIVEKIT_URL = "wss://example.invalid";
    process.env.LIVEKIT_API_KEY = "test-key-abcd";
    process.env.LIVEKIT_API_SECRET = FAKE_SECRET;
    const provider = await getCallProvider();
    expect(provider.name).toBe("livekit");
    const session = await provider.issueToken(tokenRequest);
    expect(session.provider).toBe("livekit");
    expect(session.roomName).toBe(tokenRequest.roomName);
    expect(session.serverUrl).toBe("wss://example.invalid");
    expect(session.token.split(".")).toHaveLength(3);
    expect(session.token).not.toContain(FAKE_SECRET);
    expect(JSON.stringify(session)).not.toContain(FAKE_SECRET);
    expect(JSON.stringify(session)).not.toContain("test-key-abcd");
    const remainingMs = Date.parse(session.expiresAt) - Date.now();
    expect(remainingMs).toBeGreaterThan(14 * 60 * 1000);
    expect(remainingMs).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("prefers a complete enabled database row over env", async () => {
    process.env.LIVEKIT_URL = "wss://env.example.invalid";
    process.env.LIVEKIT_API_KEY = "env-key-zzzz";
    process.env.LIVEKIT_API_SECRET = "env-secret-value";
    vi.mocked(loadLiveKitSettingsRow).mockResolvedValue({
      enabled: true,
      server_url: "wss://db.example.invalid",
      api_key: "db-key-wxyz",
      api_secret: "db-secret-value",
    });
    const session = await (await getCallProvider()).issueToken(tokenRequest);
    expect(session.serverUrl).toBe("wss://db.example.invalid");
    expect(session.token).not.toContain("db-secret-value");
    expect(JSON.stringify(session)).not.toContain("db-key-wxyz");
  });

  it("does not fall back to env when a complete database row is disabled", async () => {
    process.env.LIVEKIT_URL = "wss://env.example.invalid";
    process.env.LIVEKIT_API_KEY = "env-key-zzzz";
    process.env.LIVEKIT_API_SECRET = "env-secret-value";
    vi.mocked(loadLiveKitSettingsRow).mockResolvedValue({
      enabled: false,
      server_url: "wss://db.example.invalid",
      api_key: "db-key-wxyz",
      api_secret: "db-secret-value",
    });
    const provider = await getCallProvider();
    expect(provider.name).toBe("none");
    await expect(provider.issueToken(tokenRequest)).rejects.toBeInstanceOf(CallProviderUnconfiguredError);
  });
});

describe("unconfigured call token", () => {
  beforeEach(() => {
    clearServerLiveKitEnv();
    vi.mocked(loadLiveKitSettingsRow).mockReset();
    vi.mocked(loadLiveKitSettingsRow).mockResolvedValue(null);
  });

  it("rejects with a typed error that is not a token", async () => {
    const provider = await getCallProvider();
    await expect(provider.issueToken({ ...tokenRequest, canPublish: false })).rejects.toBeInstanceOf(
      CallProviderUnconfiguredError,
    );
    try {
      await provider.issueToken(tokenRequest);
      expect.fail("issueToken should reject");
    } catch (error) {
      expect(error).toBeInstanceOf(CallProviderUnconfiguredError);
      expect(error).not.toHaveProperty("token");
      expect(error).not.toHaveProperty("serverUrl");
      expect(error).not.toHaveProperty("roomName");
      if (!(error instanceof CallProviderUnconfiguredError)) return;
      expect(error.code).toBe("CALL_PROVIDER_UNCONFIGURED");
      expect(error.message).toBe("Calling is not configured.");
      const serialized = JSON.stringify(error);
      expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
      expect(serialized.toLowerCase()).not.toContain("placeholder");
      expect(serialized).not.toContain(FAKE_SECRET);
    }
  });
});

describe("livekit settings shaping", () => {
  it("returns only the last four key characters and a secret flag", () => {
    const row: LiveKitSettingsRow = {
      enabled: true,
      server_url: "wss://db.example.invalid",
      api_key: "db-key-wxyz",
      api_secret: FAKE_SECRET,
    };
    const pub = toPublicLiveKitSettings(row);
    expect(pub).toEqual({
      enabled: true,
      serverUrl: "wss://db.example.invalid",
      keyLast4: "wxyz",
      secretSet: true,
    });
    expect(JSON.stringify(pub)).not.toContain(FAKE_SECRET);
    expect(JSON.stringify(pub)).not.toContain("db-key-");
  });

  it("keeps the previous secret when the submitted secret is blank", () => {
    expect(keepLiveKitSecret("stored-secret", "   ")).toBe("stored-secret");
    expect(keepLiveKitSecret("stored-secret", "next-secret")).toBe("next-secret");
  });

  it("uses env only for a missing or incomplete row", () => {
    const env = { url: "wss://env.example.invalid", apiKey: "env-key", apiSecret: "env-secret" };
    expect(resolveLiveKitCredentials(null, env)?.serverUrl).toBe("wss://env.example.invalid");
    expect(
      resolveLiveKitCredentials(
        { enabled: true, server_url: "wss://db.example.invalid", api_key: "", api_secret: "" },
        env,
      )?.serverUrl,
    ).toBe("wss://env.example.invalid");
    expect(
      resolveLiveKitCredentials(
        { enabled: false, server_url: "wss://db.example.invalid", api_key: "k", api_secret: "s" },
        env,
      ),
    ).toBeNull();
  });
});
