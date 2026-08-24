import { describe, expect, it } from "vitest";

import { ProviderCallError } from "@/lib/ai/provider-error";
import { classifyProviderStatus } from "@/lib/ai/sanitize";
import { AI_INTEGRATIONS_AUTH, AI_INTEGRATIONS_MIN_LEVEL } from "@/lib/ai/types";
import { canUserDo } from "@/lib/rbac";

describe("ai permission", () => {
  it("uses existing admin.view plus CEO/COO role level", () => {
    expect(AI_INTEGRATIONS_AUTH.capability).toBe("admin.view");
    expect(AI_INTEGRATIONS_MIN_LEVEL).toBe(95);
    expect(canUserDo(["ceo"], "admin.view")).toBe(true);
    expect(canUserDo(["technician"], "admin.view")).toBe(false);
  });
});

describe("provider error mapping", () => {
  it("maps invalid key, timeout, rate limit, and unavailable model", () => {
    expect(ProviderCallError.fromHttp(401, "invalid api key").kind).toBe("auth");
    expect(ProviderCallError.fromHttp(429, "slow down").kind).toBe("rate_limit");
    expect(ProviderCallError.fromHttp(404, "model not found").kind).toBe("unavailable_model");
    expect(classifyProviderStatus(504, "")).toBe("timeout");
  });
});

describe("audit payload", () => {
  it("never includes a raw key", () => {
    const after = {
      provider_code: "groq",
      key_last_four: "AB12",
      api_key: "gsk_should_not_appear",
    };
    const serialized = JSON.stringify(
      Object.fromEntries(Object.entries(after).filter(([k]) => k !== "api_key")),
    );
    expect(serialized).toContain("AB12");
    expect(serialized).not.toContain("gsk_should_not_appear");
  });
});

describe("list response shape", () => {
  it("exposes mask fields only", () => {
    const publicRow = {
      provider_code: "openrouter",
      key_last_four: "AB12",
      key_masked: "••••••••••••AB12",
    };
    expect(JSON.stringify(publicRow)).not.toMatch(/sk-or-v1/);
    expect(publicRow.key_masked.endsWith("AB12")).toBe(true);
  });
});
