import { describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  lastFourOfKey,
  maskApiKey,
  maskFromLastFour,
  parseEncryptionKey,
} from "@/lib/ai/crypto";
import { stripSecrets, sanitizeProviderError, classifyProviderStatus, canFallback } from "@/lib/ai/sanitize";
import { decideAfterFailure, buildFallbackChain } from "@/lib/ai/routing";
import { dropFromRouting, eligibleForRouting, normalizeApiKey, replaceKeyResetsStatus } from "@/lib/ai/validation";
import { checkRateLimit, resetRateLimitForTests } from "@/lib/ai/rate-limit";

const MASTER = "0".repeat(64);
const KEY = parseEncryptionKey(MASTER);

describe("ai crypto", () => {
  it("round-trips encrypt/decrypt", () => {
    const secret = "sk-test-not-a-real-key-ABCD";
    const cipher = encryptSecret(secret, KEY);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain(secret);
    expect(decryptSecret(cipher, KEY)).toBe(secret);
  });

  it("masks to last four only", () => {
    expect(lastFourOfKey("sk-or-v1-EXAMPLEKEY12")).toBe("EY12");
    expect(maskApiKey("sk-or-v1-EXAMPLEKEY12")).toBe("••••••••••••EY12");
    expect(maskFromLastFour("AB12")).toBe("••••••••••••AB12");
  });
});

describe("ai sanitize", () => {
  it("strips secret fields from serialized objects", () => {
    const clean = stripSecrets({
      provider: "gemini",
      api_key: "should-not-leak",
      encrypted_api_key: "v1:cipher",
      authorization: "Bearer abc",
      key_last_four: "AB12",
    });
    expect(JSON.stringify(clean)).not.toMatch(/should-not-leak|v1:cipher|Bearer abc/);
    expect(clean.key_last_four).toBe("AB12");
  });

  it("classifies and sanitizes provider errors", () => {
    expect(classifyProviderStatus(401, "invalid api key sk-secret-12345678")).toBe("auth");
    expect(classifyProviderStatus(429, "rate")).toBe("rate_limit");
    expect(classifyProviderStatus(404, "model not found")).toBe("unavailable_model");
    expect(classifyProviderStatus(503, "oops")).toBe("server");
    expect(sanitizeProviderError("timeout", "timeout")).toMatch(/timed out/i);
    expect(canFallback("auth")).toBe(false);
    expect(canFallback("rate_limit")).toBe(true);
  });
});

describe("ai routing and validation", () => {
  it("does not retry or fall back on auth failures", () => {
    expect(
      decideAfterFailure({
        kind: "auth",
        attempt: 0,
        maxRetries: 2,
        autoFallback: true,
        hasNext: true,
      }),
    ).toEqual({ action: "stop" });
  });

  it("falls back on timeout/429/5xx/unavailable model", () => {
    expect(
      decideAfterFailure({
        kind: "timeout",
        attempt: 1,
        maxRetries: 1,
        autoFallback: true,
        hasNext: true,
      }),
    ).toEqual({ action: "fallback" });
  });

  it("builds a unique eligible chain", () => {
    const chain = buildFallbackChain(
      {
        primary: "gemini",
        secondary: "groq",
        tertiary: "openrouter",
        timeout_ms: 30000,
        max_retries: 1,
        auto_fallback: true,
        monthly_limit_usd: null,
        provider_monthly_limits: {},
      },
      [
        { provider: "gemini", eligible: true },
        { provider: "groq", eligible: false },
        { provider: "openrouter", eligible: true },
      ],
    );
    expect(chain).toEqual(["gemini", "openrouter"]);
  });

  it("validates save/replace/remove routing rules", () => {
    expect(normalizeApiKey("  sk-test-key  ")).toBe("sk-test-key");
    expect(replaceKeyResetsStatus(true, "new-key-value")).toBe(true);
    expect(eligibleForRouting({ enabled: true, connection_status: "connected", has_key: true })).toBe(true);
    expect(eligibleForRouting({ enabled: true, connection_status: "untested", has_key: true })).toBe(false);
    const dropped = dropFromRouting(
      {
        primary: "gemini",
        secondary: "groq",
        tertiary: null,
        timeout_ms: 30000,
        max_retries: 1,
        auto_fallback: true,
        monthly_limit_usd: null,
        provider_monthly_limits: {},
      },
      "gemini",
    );
    expect(dropped.primary).toBeNull();
  });
});

describe("ai rate limit", () => {
  it("blocks after the window fills", () => {
    resetRateLimitForTests();
    const now = 1_000_000;
    expect(checkRateLimit({ key: "ai:test:user", limit: 2, windowMs: 60_000, now }).ok).toBe(true);
    expect(checkRateLimit({ key: "ai:test:user", limit: 2, windowMs: 60_000, now }).ok).toBe(true);
    expect(checkRateLimit({ key: "ai:test:user", limit: 2, windowMs: 60_000, now }).ok).toBe(false);
  });
});
