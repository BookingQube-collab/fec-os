import { isFloorSupervisorView } from "@/lib/rbac";
import { useUserRoles } from "./use-auth";

/** True when the user should see simplified floor-supervisor forms (no finance/extra fields). */
export function useFloorSupervisorView(): boolean {
  const roles = useUserRoles();
  return isFloorSupervisorView(roles);
}
