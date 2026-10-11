import type { AppRole } from "@/lib/rbac";

/** Roles that should not inherit "FEC Operations Command" as personal chrome. */
const NON_OPS_COMMAND_ROLES = new Set<AppRole>(["hr", "customer_service"]);

/** True when the topbar subtitle should use ops command branding. */
export function usesOpsCommandSubtitle(role?: AppRole | string | null): boolean {
  if (!role) return true;
  return !NON_OPS_COMMAND_ROLES.has(role as AppRole);
}

/**
 * Greeting subtitle and avatar menu.
 * A linked staff job title replaces the login-role label. Blank title keeps the role label.
 * Callers keep any location or department prefix they already render around this label.
 */
export function topbarIdentityLabel(jobTitle: string | null | undefined, roleLabel: string): string {
  const title = jobTitle?.trim();
  return title || roleLabel;
}
