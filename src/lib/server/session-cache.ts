import { createHash } from "node:crypto";

import type { AppRole } from "@/lib/rbac";

export const SESSION_CACHE_TTL_MS = 60_000;

export type SessionCacheData = {
  userId: string;
  claims: Record<string, unknown>;
  roles?: AppRole[];
};

type SessionCacheEntry = SessionCacheData & { expires: number };

const sessionCache = new Map<string, SessionCacheEntry>();

/**
 * Cache key for one cookie value. The digest covers the entire value so two
 * tokens that share a short prefix cannot collide.
 */
export function sessionCacheKey(cookieName: string, cookieValue: string): string {
  const digest = createHash("sha256").update(cookieValue).digest("hex");
  return `${cookieName}:${digest}`;
}

/** Key from every auth-token cookie, full values, in name order. */
export function authCookiesCacheKey(cookies: { name: string; value: string }[]): string | null {
  const authCookies = cookies
    .filter((cookie) => cookie.name.includes("auth-token") && cookie.value.length > 20)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!authCookies.length) return null;
  const material = authCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("\n");
  const digest = createHash("sha256").update(material).digest("hex");
  return `${authCookies[0]!.name}:${digest}`;
}

export function getCachedSession(key: string): SessionCacheData | undefined {
  const entry = sessionCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    sessionCache.delete(key);
    return undefined;
  }
  return { userId: entry.userId, claims: entry.claims, roles: entry.roles };
}

export function setCachedSession(key: string, data: SessionCacheData): void {
  sessionCache.set(key, { ...data, expires: Date.now() + SESSION_CACHE_TTL_MS });
}

export function primeAuthSessionCache(key: string, data: SessionCacheData): void {
  setCachedSession(key, data);
}

export function updateAuthRolesCache(userId: string, roles: AppRole[]): void {
  for (const [key, entry] of sessionCache.entries()) {
    if (entry.userId === userId && Date.now() <= entry.expires) {
      sessionCache.set(key, { ...entry, roles });
    }
  }
}

export function clearServerSessionCache(): { cleared: number } {
  const cleared = sessionCache.size;
  sessionCache.clear();
  return { cleared };
}
