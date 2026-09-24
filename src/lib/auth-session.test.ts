import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthSessionCache,
  fetchAuthSession,
  isAuthSessionHydrated,
  shouldHardResetAuthSession,
} from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";

describe("shouldHardResetAuthSession", () => {
  it("does not reset on same-user SIGNED_IN (tab focus / token recovery)", () => {
    expect(shouldHardResetAuthSession("SIGNED_IN", "user-1", "user-1")).toBe(false);
  });

  it("resets on account switch SIGNED_IN", () => {
    expect(shouldHardResetAuthSession("SIGNED_IN", "user-1", "user-2")).toBe(true);
  });

  it("resets on first SIGNED_IN when no prior user", () => {
    expect(shouldHardResetAuthSession("SIGNED_IN", null, "user-1")).toBe(true);
  });

  it("ignores TOKEN_REFRESHED and INITIAL_SESSION", () => {
    expect(shouldHardResetAuthSession("TOKEN_REFRESHED", "user-1", "user-1")).toBe(false);
    expect(shouldHardResetAuthSession("INITIAL_SESSION", null, "user-1")).toBe(false);
  });
});

describe("auth-session hydration", () => {
  afterEach(() => {
    clearAuthSessionCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("isAuthSessionHydrated is false when module flag is set but QueryClient cache was wiped", async () => {
    const qc = new QueryClient();
    const uid = "user-1";
    const payload = {
      user: { id: uid, email: "a@b.c" },
      profile: {
        id: uid,
        display_name: "A",
        employee_code: null,
        preferred_language: "en",
        avatar_url: null,
      },
      roles: [{ role: "ceo", role_level: null, location_ids: null }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await fetchAuthSession(uid, qc);
    expect(isAuthSessionHydrated(uid, qc)).toBe(true);

    // HMR / new provider: module flag survives, React Query cache does not.
    qc.removeQueries({ queryKey: queryKeys.auth.all });
    expect(isAuthSessionHydrated(uid, qc)).toBe(false);
  });

  it("does not treat 401 as empty roles for an expected user", async () => {
    const qc = new QueryClient();
    const uid = "user-admin";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAuthSession(uid, qc)).rejects.toThrow(/unauthorized/i);
    expect(qc.getQueryData(queryKeys.auth.roles(uid))).toBeUndefined();
  });

  it("retries 401 then accepts a later session payload", async () => {
    const qc = new QueryClient();
    const uid = "user-admin";
    const payload = {
      user: { id: uid, email: "a@b.c" },
      profile: {
        id: uid,
        display_name: "Admin",
        employee_code: null,
        preferred_language: "en",
        avatar_url: null,
      },
      roles: [{ role: "ceo", role_level: null, location_ids: null }],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchAuthSession(uid, qc);
    expect(data.roles).toHaveLength(1);
    expect(data.roles[0]?.role).toBe("ceo");
    expect(isAuthSessionHydrated(uid, qc)).toBe(true);
  });
});
