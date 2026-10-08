"use client";

import type { ReactNode } from "react";

import { useUserRoles } from "@/hooks/use-auth";
import { canUserDo, type Capability } from "@/lib/rbac";

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
  if (alsoAllow || canUserDo(roles, capability)) return children;
  return fallback;
}
