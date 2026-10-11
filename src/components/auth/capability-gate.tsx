"use client";

import type { ReactNode } from "react";

import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";

interface CapabilityGateProps {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
  /** Extra allow, such as a reporting manager opening their own team. The server still scopes the data. */
  alsoAllow?: boolean;
}

/** Hides children when the current user lacks the required capability. */
export function CapabilityGate({ capability, children, fallback = null, alsoAllow = false }: CapabilityGateProps) {
  const roles = useUserRoles();
  const { profile } = useAuth();
  if (
    alsoAllow ||
    canActorPerform(roles, capability, {
      jobTitle: profile?.job_title,
      staffRole: profile?.staff_role,
      department: profile?.department,
    })
  ) {
    return children;
  }
  return fallback;
}
