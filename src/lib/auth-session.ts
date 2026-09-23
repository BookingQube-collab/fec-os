import type { QueryClient } from "@tanstack/react-query";

import type { RoleAssignment } from "@/lib/rbac";
import { queryKeys } from "@/lib/query-keys";

export interface AuthProfile {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  preferred_language: string;
  avatar_url: string | null;
}

export interface AuthSessionPayload {
  user: { id: string; email?: string | null } | null;
  profile: AuthProfile | null;
  roles: RoleAssignment[];
}

const AUTH_STALE_MS = 10 * 60_000;

const inflight = new Map<string, Promise<AuthSessionPayload>>();
let hydratedUserId: string | null = null;

function readCachedSession(queryClient: QueryClient, userId: string): AuthSessionPayload | null {
  const profile = queryClient.getQueryData<AuthProfile | null>(queryKeys.auth.profile(userId));
  const roles = queryClient.getQueryData<RoleAssignment[]>(queryKeys.auth.roles(userId));
  if (profile === undefined || roles === undefined) return null;
  return { user: { id: userId }, profile, roles };
}

function writeSessionCache(queryClient: QueryClient, userId: string, data: AuthSessionPayload) {
  queryClient.setQueryData(queryKeys.auth.profile(userId), data.profile, {
    updatedAt: Date.now(),
  });
  queryClient.setQueryData(queryKeys.auth.roles(userId), data.roles, {
    updatedAt: Date.now(),
  });
  hydratedUserId = userId;
}

/**
 * True only when this uid was hydrated AND the React Query cache still holds
 * profile/roles. Module flag alone is not enough — HMR / new QueryClient can
 * leave hydratedUserId set with an empty cache (false "Access pending").
 */
export function isAuthSessionHydrated(userId: string, queryClient?: QueryClient): boolean {
  if (hydratedUserId !== userId) return false;
  if (!queryClient) return true;
  return readCachedSession(queryClient, userId) !== null;
}

export function clearAuthSessionCache(queryClient?: QueryClient) {
  // Drop all auth profile/roles entries — switching users must not reuse the prior uid's cache.
  if (queryClient) {
    queryClient.removeQueries({ queryKey: queryKeys.auth.all });
  }
  hydratedUserId = null;
}

async function fetchSessionResponse(retries = 2): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch("/api/auth/session", { credentials: "include" });
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Auth session fetch failed");
}

/** Parse JSON body; 401 with an expected client uid is cookie lag — retry, don't treat as no roles. */
async function readSessionPayload(
  userId: string,
  res: Response,
  allowUnauthorizedRetry: boolean,
): Promise<AuthSessionPayload> {
  if (res.status === 401) {
    if (allowUnauthorizedRetry) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const retry = await fetchSessionResponse(1);
      return readSessionPayload(userId, retry, false);
    }
    // Client has a user; server cookies are missing. Do not map to empty roles
    // (that becomes a sticky "Access pending" false positive).
    throw new Error("Auth session unauthorized");
  }
  if (!res.ok) throw new Error("Auth session fetch failed");
  return (await res.json()) as AuthSessionPayload;
}

export async function fetchAuthSession(
  userId: string,
  queryClient: QueryClient,
): Promise<AuthSessionPayload> {
  const cached = readCachedSession(queryClient, userId);
  if (cached) return cached;

  const existing = inflight.get(userId);
  if (existing) return existing;

  const task = fetchSessionResponse()
    .then(async (res) => readSessionPayload(userId, res, true))
    .then(async (data) => {
      // Cookie session can lag behind a just-switched client user — never attach the wrong profile.
      if (data.user?.id && data.user.id !== userId) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const retry = await fetchSessionResponse(1);
        data = await readSessionPayload(userId, retry, false);
        if (data.user?.id && data.user.id !== userId) {
          throw new Error("Auth session user mismatch");
        }
      }
      if (data.user?.id) writeSessionCache(queryClient, data.user.id, data);
      return data;
    })
    .catch((error) => {
      const fallback = readCachedSession(queryClient, userId);
      if (fallback) return fallback;
      throw error;
    });

  inflight.set(userId, task);
  try {
    return await task;
  } finally {
    inflight.delete(userId);
  }
}

export const authQueryOptions = {
  staleTime: AUTH_STALE_MS,
} as const;
