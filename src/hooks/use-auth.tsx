"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import {
  clearAuthSessionCache,
  fetchAuthSession,
  isAuthSessionHydrated,
  shouldHardResetAuthSession,
  type AuthProfile,
} from "@/lib/auth-session";
import { listCapabilityGrants } from "@/lib/admin.functions";
import { setActiveCapabilityGrants, toGrantMap } from "@/lib/rbac-grants";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { AppRole, RoleAssignment } from "@/lib/rbac";

export type Profile = AuthProfile;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: RoleAssignment[];
  loading: boolean;
  /**
   * True after a successful session fetch (or cache hit) for the current user.
   * False while roles are unknown — must not be treated as "no assigned role".
   */
  rolesSettled: boolean;
  /** Bumps when capability grant overrides hydrate/refresh — consumers re-read canUserDo. */
  grantsVersion: number;
  signOut: () => Promise<void>;
  /** Re-fetch profiles/roles into auth context (e.g. after self-service profile edit). */
  refreshProfile: () => Promise<Profile | null>;
  /** Re-fetch DB capability overrides into the active grant cache. */
  refreshCapabilityGrants: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_EVENTS = new Set<AuthChangeEvent>([
  "INITIAL_SESSION",
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<RoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesSettled, setRolesSettled] = useState(false);
  const [grantsVersion, setGrantsVersion] = useState(0);
  /** Tracks uid across auth events — effect closure must not read stale React state. */
  const userIdRef = useRef<string | null>(null);

  const hydrateCapabilityGrants = async () => {
    try {
      const rows = await listCapabilityGrants();
      setActiveCapabilityGrants(toGrantMap(rows));
      queryClient.setQueryData(queryKeys.admin.capabilityGrants(), rows);
      setGrantsVersion((v) => v + 1);
    } catch (error) {
      console.warn("[auth] Failed to load capability grants", error);
      setActiveCapabilityGrants(toGrantMap([]));
      setGrantsVersion((v) => v + 1);
    }
  };

  useEffect(() => {
    let mounted = true;

    const applyUserData = (uid: string): boolean => {
      const cachedProfile = queryClient.getQueryData<Profile | null>(queryKeys.auth.profile(uid));
      const cachedRoles = queryClient.getQueryData<RoleAssignment[]>(queryKeys.auth.roles(uid));
      if (cachedProfile !== undefined && cachedRoles !== undefined) {
        setProfile(cachedProfile);
        setRoles(cachedRoles);
        setRolesSettled(true);
        return true;
      }
      return false;
    };

    const loadUserData = async (uid: string) => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const data = await fetchAuthSession(uid, queryClient);
          if (!mounted) return;
          setProfile(data.profile);
          setRoles(data.roles);
          setRolesSettled(true);
          await hydrateCapabilityGrants();
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          }
        }
      }
      console.warn("[auth] Failed to load session profile/roles", lastError);
      if (!mounted) return;
      // Prefer cached roles over a false "no role" settlement.
      if (!applyUserData(uid)) {
        setRolesSettled(false);
      }
    };

    const handleAuthChange = (event: AuthChangeEvent, newSession: Session | null) => {
      if (!mounted) return;
      if (!SESSION_EVENTS.has(event)) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      const finishInitialLoad = () => {
        // Role fetch may finish after SIGNED_IN; always clear the gate spinner
        // once this event's work completes (not only INITIAL_SESSION).
        setLoading(false);
      };

      if (!newSession?.user) {
        userIdRef.current = null;
        clearAuthSessionCache(queryClient);
        setProfile(null);
        setRoles([]);
        setRolesSettled(true);
        setActiveCapabilityGrants(null);
        setGrantsVersion((v) => v + 1);
        finishInitialLoad();
        return;
      }

      const uid = newSession.user.id;
      const hardReset = shouldHardResetAuthSession(event, userIdRef.current, uid);
      userIdRef.current = uid;

      // Account switch only — same-user SIGNED_IN (tab focus / token recovery) must not
      // clear roles or ProtectedGate will skeleton-remount heavy pages (attendance matrix).
      if (hardReset) {
        clearAuthSessionCache(queryClient);
        setProfile(null);
        setRoles([]);
        setRolesSettled(false);
        setLoading(true);
      }

      const shouldFetch = hardReset || !isAuthSessionHydrated(uid, queryClient);

      if (shouldFetch) {
        setRolesSettled(false);
        void loadUserData(uid).finally(finishInitialLoad);
      } else if (applyUserData(uid)) {
        // Same-user SIGNED_IN: keep roles, skip grant churn. INITIAL_SESSION still hydrates grants.
        if (event === "INITIAL_SESSION") {
          void hydrateCapabilityGrants().finally(finishInitialLoad);
        } else {
          finishInitialLoad();
        }
      } else {
        // Module flag said hydrated but cache miss (HMR / new QueryClient).
        setRolesSettled(false);
        void loadUserData(uid).finally(finishInitialLoad);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Defer to avoid Supabase auth callback deadlock.
        setTimeout(() => handleAuthChange(event, newSession), 0);
        return;
      }
      handleAuthChange(event, newSession);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  // Soft recovery: user present but roles never settled (cookie lag / transient 401).
  // Retry a few times; stay on skeleton rather than a false "Access pending".
  useEffect(() => {
    if (!user || rolesSettled || loading) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled || !user || attempts >= 5) return;
      attempts += 1;
      try {
        clearAuthSessionCache(queryClient);
        const data = await fetchAuthSession(user.id, queryClient);
        if (cancelled) return;
        setProfile(data.profile);
        setRoles(data.roles);
        setRolesSettled(true);
      } catch (error) {
        console.warn("[auth] Retry session profile/roles failed", error);
      }
    };
    const timer = window.setInterval(() => void tick(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user, rolesSettled, loading, queryClient]);

  const signOut = async () => {
    userIdRef.current = null;
    clearAuthSessionCache(queryClient);
    setProfile(null);
    setRoles([]);
    setRolesSettled(true);
    setActiveCapabilityGrants(null);
    setGrantsVersion((v) => v + 1);
    await supabase.auth.signOut({ scope: "local" });
  };

  const refreshProfile = async () => {
    if (!user) return null;
    clearAuthSessionCache(queryClient);
    setRolesSettled(false);
    try {
      const data = await fetchAuthSession(user.id, queryClient);
      setProfile(data.profile);
      setRoles(data.roles);
      setRolesSettled(true);
      return data.profile;
    } catch (error) {
      console.warn("[auth] Failed to refresh profile", error);
      setRolesSettled(false);
      return profile;
    }
  };

  const refreshCapabilityGrants = async () => {
    await hydrateCapabilityGrants();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        rolesSettled,
        grantsVersion,
        signOut,
        refreshProfile,
        refreshCapabilityGrants,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useUserRoles(): AppRole[] {
  const { roles, grantsVersion } = useAuth();
  void grantsVersion;
  return roles.map((r) => r.role);
}
