import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { HIERARCHY_EDIT_ROLE_LEVEL, canOpenStaffProfile, staffProfileOpenIds } from "@/lib/hierarchy-access";
import { canUserDo, type AppRole } from "@/lib/rbac";
import { loadDirectReportStaffIds } from "@/lib/reporting-manager-access.server";
import type { AuthContext } from "@/lib/server/auth";
import { ForbiddenError } from "@/lib/server/authorize";

export const STAFF_PROFILE_DENIED = "You can open your own profile and your team's profiles.";

export type StaffProfileReadScope = "company" | "team";

export type StaffProfileReadAccess = {
  scope: StaffProfileReadScope;
  viewerStaffId: string | null;
};

type ReportingLine = { staffId: string; reportingManagerStaffId: string | null };

async function loadReportingLines(): Promise<ReportingLine[]> {
  const size = 1000;
  const rows: ReportingLine[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, reporting_manager_staff_id")
      .order("staff_id")
      .range(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      rows.push({
        staffId: row.staff_id,
        reportingManagerStaffId: row.reporting_manager_staff_id,
      });
    }
    if (page.length < size) break;
  }
  return rows;
}

/**
 * CEO and COO keep company profile reads.
 * A manager or supervisor may read their own profile and people who report through them.
 * A boss, and anyone outside that team, stays closed.
 * Someone who is not a reporting manager keeps the staff directory they already have.
 */
export async function resolveStaffProfileReadAccess(
  context: Pick<AuthContext, "userId" | "supabase"> & { roles?: AppRole[] | null },
  targetStaffId: string,
): Promise<StaffProfileReadAccess> {
  const { data: levelData, error: levelError } = await context.supabase.rpc("current_user_role_level");
  if (levelError) throw new Error(levelError.message);
  const maxRoleLevel = typeof levelData === "number" ? levelData : 0;
  if (maxRoleLevel >= HIERARCHY_EDIT_ROLE_LEVEL) {
    return { scope: "company", viewerStaffId: null };
  }

  const rosterAccess = canUserDo(context.roles ?? [], "people.view_roster");
  const access = await loadDirectReportStaffIds(context.userId);
  const teamLimited = access.directReportStaffIds.length > 0;
  if (!teamLimited) {
    if (!rosterAccess) throw new ForbiddenError(STAFF_PROFILE_DENIED);
    return { scope: "company", viewerStaffId: access.staffId };
  }

  const openIds = staffProfileOpenIds(
    await loadReportingLines(),
    access.staffId,
    access.directReportStaffIds,
  );
  if (
    !canOpenStaffProfile({
      companyWide: false,
      rosterAccess,
      teamLimited: true,
      viewerStaffId: access.staffId,
      targetStaffId,
      openIds,
    })
  ) {
    throw new ForbiddenError(STAFF_PROFILE_DENIED);
  }
  return { scope: "team", viewerStaffId: access.staffId };
}
