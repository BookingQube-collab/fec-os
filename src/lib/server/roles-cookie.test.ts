import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readRolesCookie, ROLES_COOKIE_NAME, writeRolesCookie } from "./roles-cookie";

type Store = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string) => void;
  delete: (name: string) => void;
};

function memoryCookieStore(): Store & { jar: Map<string, string> } {
  const jar = new Map<string, string>();
  return {
    jar,
    get: (name) => {
      const value = jar.get(name);
      return value == null ? undefined : { value };
    },
    set: (name, value) => {
      jar.set(name, value);
    },
    delete: (name) => {
      jar.delete(name);
    },
  };
}

describe("roles cookie", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-roles-cookie-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("round-trips non-empty roles", () => {
    const store = memoryCookieStore();
    writeRolesCookie(store as never, "user-1", ["regional_ops"]);
    expect(readRolesCookie(store as never, "user-1")).toEqual(["regional_ops"]);
  });

  it("treats empty roles as a cache miss and clears the cookie on write", () => {
    const store = memoryCookieStore();
    writeRolesCookie(store as never, "user-1", ["regional_ops"]);
    expect(store.jar.has(ROLES_COOKIE_NAME)).toBe(true);

    writeRolesCookie(store as never, "user-1", []);
    expect(store.jar.has(ROLES_COOKIE_NAME)).toBe(false);
    expect(readRolesCookie(store as never, "user-1")).toBeNull();
  });
});
