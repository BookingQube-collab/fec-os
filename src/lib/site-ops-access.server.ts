import "server-only";

import { loadLinkedStaffIdentity } from "@/lib/linked-staff-job-title.server";
import { ForbiddenError } from "@/lib/server/authorize";

import { canManageMonthlyRoster } from "@/lib/site-ops-access";

export async function assertCanManageMonthlyRoster(userId: string): Promise<void> {
  const identity = await loadLinkedStaffIdentity(userId);
  if (!canManageMonthlyRoster(identity)) {
    throw new ForbiddenError("Forbidden: missing capability to change the roster, mapping, or team corrections.");
  }
}
