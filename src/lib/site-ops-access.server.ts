import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isHeadOfOperationsTitle } from "@/lib/attendance-hr/missed-punch-approval";
import { loadLinkedStaffIdentity, loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { ForbiddenError, getUserRoles } from "@/lib/server/authorize";

import { attendanceMappingIsCompanyWide } from "@/lib/attendance-listing-access";
import type { AppRole } from "@/lib/rbac";
import {
  canCorrectTeamAttendance,
  canEditAttendanceMapping,
  canManageMonthlyRoster,
  canOpenShiftRoster,
} from "@/lib/site-ops-access";

/** Direct report of a Head of Operations title on the ops reporting chart. */
export async function viewerReportsToHeadOfOperations(staffId: string): Promise<boolean> {
  const { data: ext, error: extErr } = await supabaseAdmin
    .from("staff_profile_ext")
    .select("reporting_manager_staff_id")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (extErr) throw new Error(extErr.message);
  const managerId = ext?.reporting_manager_staff_id ? String(ext.reporting_manager_staff_id) : "";
  if (!managerId) return false;
  const { data: manager, error: managerErr } = await supabaseAdmin
    .from("staff")
    .select("job_title")
    .eq("id", managerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (managerErr) throw new Error(managerErr.message);
  return isHeadOfOperationsTitle(manager?.job_title ? String(manager.job_title) : null);
}

/** Resolve reportsToHeadOfOperations for the signed-in user's linked staff row. */
export async function loadReportsToHeadOfOperations(userId: string): Promise<boolean> {
  const linked = await loadLinkedStaffRecord(userId);
  if (!linked?.id) return false;
  return viewerReportsToHeadOfOperations(linked.id);
}

/** Monthly roster create / edit / delete. Site / Operations supervisors and HoO peers included. */
export async function assertCanManageMonthlyRoster(userId: string): Promise<void> {
  const [identity, reportsToHeadOfOperations] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    loadReportsToHeadOfOperations(userId),
  ]);
  if (!canManageMonthlyRoster({ ...identity, reportsToHeadOfOperations })) {
    throw new ForbiddenError("Forbidden: missing capability to change the monthly roster.");
  }
}

/**
 * Attendance mapping save / unmap / remove.
 * Company-wide mappers (CEO / HR / COO / GM) keep edit; otherwise Venue /
 * Sr. Site / F&B Supervisor only.
 */
export async function assertCanEditAttendanceMapping(userId: string): Promise<void> {
  const [identity, roles] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    getUserRoles(supabaseAdmin, userId),
  ]);
  if (attendanceMappingIsCompanyWide(roles as AppRole[])) return;
  if (!canEditAttendanceMapping(identity)) {
    throw new ForbiddenError("Forbidden: missing capability to change attendance mapping.");
  }
}

/** Shift roster upload and monthly roster edits. CEO, GM, Adil, HoO Operations peers, and the General Manager are included. */
export async function assertCanOpenShiftRoster(userId: string): Promise<void> {
  const [identity, roles, reportsToHeadOfOperations] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    getUserRoles(supabaseAdmin, userId),
    loadReportsToHeadOfOperations(userId),
  ]);
  if (!canOpenShiftRoster({ ...identity, roles, reportsToHeadOfOperations })) {
    throw new ForbiddenError("Forbidden: missing capability to upload a shift roster.");
  }
}

/** Team corrections for someone other than yourself. Includes HoO Operations peers. */
export async function loadCanCorrectTeamAttendance(userId: string): Promise<boolean> {
  const [identity, reportsToHeadOfOperations] = await Promise.all([
    loadLinkedStaffIdentity(userId),
    loadReportsToHeadOfOperations(userId),
  ]);
  return canCorrectTeamAttendance({ ...identity, reportsToHeadOfOperations });
}
