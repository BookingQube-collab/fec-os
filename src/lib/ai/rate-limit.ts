type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = input.now ?? Date.now();
  const current = buckets.get(input.key);
  if (!current || now >= current.resetAt) {
    buckets.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { ok: true };
  }
  if (current.count >= input.limit) {
    return { ok: false, retryAfterMs: current.resetAt - now };
  }
  current.count += 1;
  return { ok: true };
}

export function resetRateLimitForTests() {
  buckets.clear();
}
