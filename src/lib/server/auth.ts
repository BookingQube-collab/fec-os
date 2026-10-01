import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/rbac";
import { createTimer } from "@/lib/performance/timer";
import { readRolesCookie } from "./roles-cookie";
import {
  authCookiesCacheKey,
  clearServerSessionCache,
  getCachedSession,
  primeAuthSessionCache,
  setCachedSession,
  updateAuthRolesCache,
} from "./session-cache";

export { clearServerSessionCache, primeAuthSessionCache, updateAuthRolesCache };

export type AuthContext = {
  supabase: ReturnType<typeof createServerClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
  /** Populated once per server action by enforceActionAuth */
  roles?: AppRole[];
};

function authTokenFingerprint(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  return authCookiesCacheKey(cookieStore.getAll());
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
    const claims = data?.claims;
    const sub = typeof claims?.sub === "string" ? claims.sub : null;
    if (!error && sub) {
      return {
        userId: sub,
        claims: {
          sub,
          email: typeof claims?.email === "string" ? claims.email : null,
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
