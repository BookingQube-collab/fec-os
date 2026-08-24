import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";
import { readRolesCookie } from "./roles-cookie";

export type AuthContext = {
  supabase: ReturnType<typeof createServerClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
  /** Populated once per server action by enforceActionAuth */
  roles?: AppRole[];
};

type SessionCacheEntry = {
  userId: string;
  claims: Record<string, unknown>;
  roles?: AppRole[];
  expires: number;
};

const SESSION_CACHE_TTL_MS = 60_000;
const sessionCache = new Map<string, SessionCacheEntry>();

function authTokenFingerprint(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  const authCookie = cookieStore
    .getAll()
    .find((c) => c.name.includes("auth-token") && c.value.length > 20);
  if (!authCookie) return null;
  return `${authCookie.name}:${authCookie.value.slice(0, 48)}`;
}

function getCachedSession(fingerprint: string): SessionCacheEntry | undefined {
  const entry = sessionCache.get(fingerprint);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    sessionCache.delete(fingerprint);
    return undefined;
  }
  return entry;
}

function setCachedSession(fingerprint: string, entry: Omit<SessionCacheEntry, "expires">): void {
  sessionCache.set(fingerprint, { ...entry, expires: Date.now() + SESSION_CACHE_TTL_MS });
}

export function primeAuthSessionCache(
  fingerprint: string,
  data: { userId: string; claims: Record<string, unknown>; roles?: AppRole[] },
): void {
  setCachedSession(fingerprint, data);
}

export function updateAuthRolesCache(userId: string, roles: AppRole[]): void {
  for (const [key, entry] of sessionCache.entries()) {
    if (entry.userId === userId && Date.now() <= entry.expires) {
      sessionCache.set(key, { ...entry, roles });
    }
  }
}

/** Drop short-lived auth session cache entries (this Node isolate only). */
export function clearServerSessionCache(): { cleared: number } {
  const cleared = sessionCache.size;
  sessionCache.clear();
  return { cleared };
}

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const missing = [
      ...(!supabaseUrl ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
      ...(!supabaseKey ? ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}`);
  }

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — cookie writes are ignored.
        }
      },
    },
  });
}

async function resolveUserFromJwt(
  supabase: ReturnType<typeof createSupabaseClient>,
): Promise<{ userId: string; claims: Record<string, unknown> }> {
  const auth = supabase.auth as typeof supabase.auth & {
    getClaims?: () => Promise<{
      data: { claims?: Record<string, unknown> } | null;
      error: { message: string } | null;
    }>;
  };
  if (typeof auth.getClaims === "function") {
    const { data, error } = await auth.getClaims();
    const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    if (!error && sub) {
      return {
        userId: sub,
        claims: {
          sub,
          email: typeof data.claims?.email === "string" ? data.claims.email : null,
        },
      };
    }
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error(error?.message ? `Unauthorized: ${error.message}` : "Unauthorized");
  }
  return {
    userId: user.id,
    claims: { sub: user.id, email: user.email ?? null },
  };
}

async function resolveAuthenticatedContext(): Promise<AuthContext> {
  const timer = createTimer("getAuthenticatedContext", "auth.jwt");
  const cookieStore = await cookies();
  const fingerprint = authTokenFingerprint(cookieStore);
  const supabase = createSupabaseClient(cookieStore);

  if (fingerprint) {
    const cached = getCachedSession(fingerprint);
    if (cached) {
      timer.end({ rowCount: 1 });
      return {
        supabase,
        userId: cached.userId,
        claims: cached.claims,
        roles: cached.roles,
      };
    }
  }

  let userId: string;
  let claims: Record<string, unknown>;
  try {
    ({ userId, claims } = await resolveUserFromJwt(supabase));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    timer.end({ error: msg });
    throw new Error("Unauthorized");
  }

  const roles = readRolesCookie(cookieStore, userId) ?? undefined;
  const context: AuthContext = { supabase, userId, claims, roles };

  if (fingerprint) {
    setCachedSession(fingerprint, { userId, claims, roles });
  }

  timer.end({ rowCount: 1 });
  return context;
}

/** Request-scoped dedupe + short-lived session cache across parallel API calls. */
export const getAuthenticatedContext = cache(resolveAuthenticatedContext);
