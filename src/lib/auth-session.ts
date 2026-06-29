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

export function isAuthSessionHydrated(userId: string): boolean {
  return hydratedUserId === userId;
}

export function clearAuthSessionCache(queryClient?: QueryClient) {
  if (hydratedUserId && queryClient) {
    queryClient.removeQueries({ queryKey: queryKeys.auth.profile(hydratedUserId) });
    queryClient.removeQueries({ queryKey: queryKeys.auth.roles(hydratedUserId) });
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

export async function fetchAuthSession(
  userId: string,
  queryClient: QueryClient,
): Promise<AuthSessionPayload> {
  const cached = readCachedSession(queryClient, userId);
  if (cached) return cached;

  const existing = inflight.get(userId);
  if (existing) return existing;

  const task = fetchSessionResponse()
    .then(async (res) => {
      if (res.status === 401) {
        return { user: null, profile: null, roles: [] } satisfies AuthSessionPayload;
      }
      if (!res.ok) throw new Error("Auth session fetch failed");
      return (await res.json()) as AuthSessionPayload;
    })
    .then((data) => {
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
