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
  signOut: () => Promise<void>;
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
        finishInitialLoad();
        return;
      }

      const uid = newSession.user.id;
      const shouldFetch =
        event === "SIGNED_IN" ||
        event === "USER_UPDATED" ||
        !isAuthSessionHydrated(uid);

      if (shouldFetch) {
        void loadUserData(uid).finally(finishInitialLoad);
      } else {
        applyUserData(uid);
        finishInitialLoad();
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signOut }}>
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
  const { roles } = useAuth();
  return roles.map((r) => r.role);
}
