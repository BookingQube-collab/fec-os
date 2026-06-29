import { canUserDo, type Capability } from "@/lib/rbac";
import { useUserRoles } from "./use-auth";

/** Returns true if the current user holds a role permitted to perform `capability`. */
export function usePermission(capability: Capability): boolean {
  const roles = useUserRoles();
  return canUserDo(roles, capability);
}