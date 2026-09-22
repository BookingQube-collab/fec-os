"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import {
  clearAuthSessionCache,
  fetchAuthSession,
  isAuthSessionHydrated,
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
  const [grantsVersion, setGrantsVersion] = useState(0);

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

    const applyUserData = (uid: string) => {
      const cachedProfile = queryClient.getQueryData<Profile | null>(queryKeys.auth.profile(uid));
      const cachedRoles = queryClient.getQueryData<RoleAssignment[]>(queryKeys.auth.roles(uid));
      if (cachedProfile !== undefined && cachedRoles !== undefined) {
        setProfile(cachedProfile);
        setRoles(cachedRoles);
      }
    };

    const loadUserData = async (uid: string) => {
      try {
        const data = await fetchAuthSession(uid, queryClient);
        if (!mounted) return;
        setProfile(data.profile);
        setRoles(data.roles);
        await hydrateCapabilityGrants();
      } catch (error) {
        console.warn("[auth] Failed to load session profile/roles", error);
        if (!mounted) return;
        applyUserData(uid);
      }
    };

    const handleAuthChange = (event: AuthChangeEvent, newSession: Session | null) => {
      if (!mounted) return;
      if (!SESSION_EVENTS.has(event)) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      const finishInitialLoad = () => {
        if (event === "INITIAL_SESSION") setLoading(false);
      };

      if (!newSession?.user) {
        clearAuthSessionCache(queryClient);
        setProfile(null);
        setRoles([]);
        setActiveCapabilityGrants(null);
        setGrantsVersion((v) => v + 1);
        finishInitialLoad();
        return;
      }

      const uid = newSession.user.id;
      // Account switch: drop prior user's profile/roles before hydrating the new one.
      if (event === "SIGNED_IN") {
        clearAuthSessionCache(queryClient);
        setProfile(null);
        setRoles([]);
      }

      const shouldFetch =
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        !isAuthSessionHydrated(uid);

      if (shouldFetch) {
        void loadUserData(uid).finally(finishInitialLoad);
      } else {
        applyUserData(uid);
        void hydrateCapabilityGrants().finally(finishInitialLoad);
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

  const signOut = async () => {
    clearAuthSessionCache(queryClient);
    setProfile(null);
    setRoles([]);
    setActiveCapabilityGrants(null);
    setGrantsVersion((v) => v + 1);
    await supabase.auth.signOut({ scope: "local" });
  };

  const refreshProfile = async () => {
    if (!user) return null;
    clearAuthSessionCache(queryClient);
    try {
      const data = await fetchAuthSession(user.id, queryClient);
      setProfile(data.profile);
      setRoles(data.roles);
      return data.profile;
    } catch (error) {
      console.warn("[auth] Failed to refresh profile", error);
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
