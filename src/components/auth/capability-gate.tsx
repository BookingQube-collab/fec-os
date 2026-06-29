"use client";

import type { ReactNode } from "react";

import { useUserRoles } from "@/hooks/use-auth";
import { canUserDo, type Capability } from "@/lib/rbac";

interface CapabilityGateProps {
  capability: Capability;
  children: ReactNode;
  fallback?: ReactNode;
}

/** Hides children when the current user lacks the required capability. */
export function CapabilityGate({ capability, children, fallback = null }: CapabilityGateProps) {
  const roles = useUserRoles();
  if (!canUserDo(roles, capability)) return fallback;
  return children;
}
