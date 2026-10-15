import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadLinkedStaffIdentity } from "@/lib/linked-staff-job-title.server";
import { ForbiddenError, getUserRoles } from "@/lib/server/authorize";

import { canManageMonthlyRoster, canOpenShiftRoster } from "@/lib/site-ops-access";

export async function assertCanManageMonthlyRoster(userId: string): Promise<void> {
  const identity = await loadLinkedStaffIdentity(userId);
  if (!canManageMonthlyRoster(identity)) {
    throw new ForbiddenError("Forbidden: missing capability to change the roster, mapping, or team corrections.");
  }
}

/** Shift roster upload and monthly roster edits. CEO, GM, Adil, and the General Manager are included. */
export async function assertCanOpenShiftRoster(userId: string): Promise<void> {
  const [identity, roles] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    getUserRoles(supabaseAdmin, userId),
  ]);
  if (!canOpenShiftRoster({ ...identity, roles })) {
    throw new ForbiddenError("Forbidden: missing capability to upload a shift roster.");
  }
}
