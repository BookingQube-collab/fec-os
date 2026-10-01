import { describe, expect, it } from "vitest";

import {
  clearServerSessionCache,
  getCachedSession,
  primeAuthSessionCache,
  sessionCacheKey,
} from "./session-cache";

describe("session identity cache", () => {
  it("does not share a cache entry when tokens share a 48-character prefix", () => {
    clearServerSessionCache();
    const prefix = "a".repeat(48);
    const tokenA = `${prefix.slice(0, 48)}user-a-rest-of-access-token`;
    const tokenB = `${prefix.slice(0, 48)}user-b-different-access-token`;
    expect(tokenA.slice(0, 48)).toBe(tokenB.slice(0, 48));
    expect(tokenA).not.toBe(tokenB);

    const keyA = sessionCacheKey("sb-project-auth-token", tokenA);
    const keyB = sessionCacheKey("sb-project-auth-token", tokenB);
    expect(keyA).not.toBe(keyB);
    expect(keyA.startsWith("sb-project-auth-token:")).toBe(true);
    expect(keyA.includes(tokenA.slice(0, 48))).toBe(false);

    primeAuthSessionCache(keyA, { userId: "user-a", claims: { sub: "user-a" } });
    expect(getCachedSession(keyA)?.userId).toBe("user-a");
    expect(getCachedSession(keyB)).toBeUndefined();
  });
});
