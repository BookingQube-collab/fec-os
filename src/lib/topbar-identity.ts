import type { AppRole } from "@/lib/rbac";

/** Roles that should not inherit "FEC Operations Command" as personal chrome. */
const NON_OPS_COMMAND_ROLES = new Set<AppRole>(["hr", "customer_service"]);

/** True when the topbar subtitle should use ops command branding. */
export function usesOpsCommandSubtitle(role?: AppRole | string | null): boolean {
  if (!role) return true;
  return !NON_OPS_COMMAND_ROLES.has(role as AppRole);
}
