type CacheEntry<T> = { value: T; expires: number };

const store = new Map<string, CacheEntry<unknown>>();

export function getRouteCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setRouteCache<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export const ROUTE_CACHE_TTL = {
  kpis: 30_000,
  lists: 60_000,
  sites: 10 * 60_000,
} as const;

export function routeCacheKey(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(":");
}
