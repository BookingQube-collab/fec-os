import { canActorPerform } from "@/lib/arcade/access";
import type { Capability } from "@/lib/rbac";
import { useAuth, useUserRoles } from "./use-auth";

/** Returns true if the current user may perform `capability`, including job-title arcade and Head of Operations rules. */
export function usePermission(capability: Capability): boolean {
  const roles = useUserRoles();
  const { profile, grantsVersion } = useAuth();
  void grantsVersion;
  return canActorPerform(roles, capability, {
    jobTitle: profile?.job_title,
    staffRole: profile?.staff_role,
    department: profile?.department,
  });
}