"use client";

import type { ReactNode } from "react";

import { CallCenterAudioGate } from "@/components/call-center/call-center-audio-gate";
import { CallCenterSoftphoneProvider } from "@/components/call-center/softphone-provider";
import { useAuth } from "@/hooks/use-auth";
import { canUserDo, type AppRole } from "@/lib/rbac";

function hasCallCenterAgentAccess(roles: AppRole[]): boolean {
  return canUserDo(roles, "call_center.view") || canUserDo(roles, "call_center.agent");
}

/**
 * Mounts the softphone (incoming poll + overlay + LiveKit room) for call-center
 * agents across the entire protected shell — not only on `/call-center`.
 * Cashiers and other non-agent roles get a no-op pass-through.
 */
export function CallCenterShellSoftphone({ children }: { children: ReactNode }) {
  const { roles } = useAuth();
  const roleNames = roles.map((r) => r.role);
  if (!hasCallCenterAgentAccess(roleNames)) {
    return <>{children}</>;
  }

  return (
    <CallCenterAudioGate>
      <CallCenterSoftphoneProvider>{children}</CallCenterSoftphoneProvider>
    </CallCenterAudioGate>
  );
}
