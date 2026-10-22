import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFnbManager } from "@/lib/arcade/access";
import {
  isFoodBeverageStaff,
  opsApprovalLaneForStaff,
  opsStepApproverLabel,
} from "@/lib/approval-ops-routing";
import { loadLinkedStaffIdentity } from "@/lib/linked-staff-job-title.server";
import { loadCanCorrectTeamAttendance } from "@/lib/site-ops-access.server";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  approverUserIdsForStep,
  canCorrectStaffPunch,
  canRequestAttendanceCorrection,
  canRequesterEditMissedPunch,
  canUserActOnCorrectionWithTeam,
  correctionIdsForReview,
  correctionOpsLane,
  correctionStepSeed,
  correctionWaitingStep,
  employeeHomeCorrectionRows,
  correctionVisibleToUser,
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
  nearestSiteSupervisorUserId,
  siteApproverLocationMap,
  missedPunchCopiesExecutives,
  managerTeamCorrectionNote,
  missedPunchRequestSide,
  nextMissedPunchStep,
  buildMissedPunchNewValue,
  previousPunchesFromOriginalValue,
  punchesFromCorrectionValue,
  punchCorrectionRequestSide,
  ownCorrectionRouteAfterLineManagerCheck,
  punchCorrectionRoute,
  requesterLineManagerUserIds,
  shouldApplyCorrectionPunchOnApprove,
  shouldHealOwnCorrectionToOpsFirst,
  teamCorrectionRouteAfterOpsCheck,
  type ApprovalDirectory,
  type CorrectionApprovalView,
  type CorrectionPunchSide,
  type MissedPunchQueue,
  type MissedPunchStepRole,
  type PunchCorrectionRoutedTo,
} from "@/lib/attendance-hr/missed-punch-approval";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { notifyUsers } from "@/lib/notifications/action-notify";
import { canUserDo, type AppRole } from "@/lib/rbac";
import {
  loadDirectReportStaffIds,
  loadManagerTeamStaffIds,
  loadReportingTreeStaffIds,
  loadSupervisorOtTeamStaffIds,
} from "@/lib/reporting-manager-access.server";
import { ForbiddenError } from "@/lib/server/authorize";

type CorrectionRow = {
  id: string;
  location_id: string;
  staff_id: string | null;
  work_date: string | null;
  summary_id: string | null;
  kind: string;
  reason: string;
  status: string;
  requested_by: string;
  requested_at: string;
  current_step_role?: string | null;
  review_note?: string | null;
  new_value?: Record<string, unknown> | null;
  original_value?: Record<string, unknown> | null;
  punch_id?: string | null;
  request_number?: string | null;
};

export type MissedPunchQueueRow = {
  id: string;
  kind: string;
  workDate: string | null;
  reason: string;
  status: string;
  locationId: string;
  staffId: string | null;
  summaryId: string | null;
  staffName: string | null;
  employeeCode: string | null;
  department: string | null;
  jobTitle: string | null;
  requestNumber: string | null;
  currentStepRole: MissedPunchStepRole | null;
  requestedBy: string;
  requestedAt: string;
  punchType: CorrectionPunchSide | null;
  /** Primary clock (punch-in when both, else the only side). Null when the request has no stored time. */
  punchAt: string | null;
  punchInAt: string | null;
  punchOutAt: string | null;
  /** Existing device / summary punch-in when the request did not ask to change it. */
  previousPunchIn: string | null;
  /** Existing device / summary punch-out when the request did not ask to change it. */
  previousPunchOut: string | null;
  reviewNote: string | null;
  steps: Array<{
    stepRole: string;
    status: string;
    actedByName: string | null;
    actedAt: string | null;
  }>;
  canAct: boolean;
};

async function nextMissedPunchRequestNumber(): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("generate_missed_punch_request_number");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `MP-${day}-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function punchesOf(value: Record<string, unknown> | null | undefined) {
  return punchesFromCorrectionValue(value);
}

function asStep(value: string | null | undefined): MissedPunchStepRole | null {
  if (value === "manager" || value === "ops" || value === "hr") return value;
  return null;
}

function toView(row: CorrectionRow, requesterStaffId?: string | null): CorrectionApprovalView {
  return {
    status: String(row.status),
    currentStepRole: asStep(row.current_step_role),
    locationId: String(row.location_id),
    staffId: row.staff_id ? String(row.staff_id) : null,
    requestedBy: String(row.requested_by),
    requesterStaffId: requesterStaffId ?? null,
  };
}

async function loadCallerRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => row.role as AppRole);
}

async function staffIdByUserId(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, user_id")
    .in("user_id", ids)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.user_id && row.id) map.set(String(row.user_id), String(row.id));
  }
  return map;
}

async function callerCorrectionAccess(userId: string) {
  const [roles, reports, reportingTree, managerTeam, identity, canCorrectTeam] = await Promise.all([
    loadCallerRoles(userId),
    loadDirectReportStaffIds(userId),
    loadReportingTreeStaffIds(userId),
    loadManagerTeamStaffIds(userId),
    loadLinkedStaffIdentity(userId),
    loadCanCorrectTeamAttendance(userId),
  ]);
  return {
    roles,
    staffId: reports.staffId,
    directReportStaffIds: reports.directReportStaffIds,
    /** Direct reports, the reporting tree, and each supervisor's team on this line. */
    teamStaffIds: [
      ...new Set([...reports.directReportStaffIds, ...reportingTree, ...managerTeam.teamStaffIds]),
    ],
    canRequest: canRequestAttendanceCorrection({
      roles,
      hasDirectReports: reports.directReportStaffIds.length > 0,
      jobTitle: identity.jobTitle,
    }),
    /** Corrections for other people. Own punch requests do not use this flag. */
    canCorrectTeam,
  };
}

export async function loadMissedPunchDirectory(staffIds: string[]): Promise<ApprovalDirectory> {
  const uniqueStaff = [...new Set(staffIds.filter(Boolean))];
  const [rolesRes, supervisorsRes, reportingRes, subjectRes, fnbManagerRes] = await Promise.all([
    supabaseAdmin
      .from("user_roles")
      .select("user_id, role, location_ids")
      .in("role", ["branch_gm", "duty_manager", "tech_supervisor", "regional_ops", "hr"]),
    supabaseAdmin
      .from("staff")
      .select("id, user_id, location_id, job_title, staff_role, status")
      .eq("status", "active")
      .is("deleted_at", null)
      .or("staff_role.eq.venue_supervisor,job_title.ilike.%supervisor%,job_title.ilike.%head%of%operations%"),
    uniqueStaff.length
      ? supabaseAdmin
          .from("staff_profile_ext")
          .select("staff_id, reporting_manager_staff_id")
          .in("staff_id", uniqueStaff)
      : Promise.resolve({ data: [] as Array<{ staff_id: string; reporting_manager_staff_id: string | null }>, error: null }),
    uniqueStaff.length
      ? supabaseAdmin
          .from("staff")
          .select("id, job_title, department")
          .in("id", uniqueStaff)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as Array<{ id: string; job_title: string | null; department: string | null }>, error: null }),
    supabaseAdmin
      .from("staff")
      .select("id, user_id, job_title, department")
      .eq("status", "active")
      .is("deleted_at", null)
      .ilike("job_title", "%manager%"),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (supervisorsRes.error) throw supervisorsRes.error;
  if (reportingRes.error && !/does not exist|schema cache/i.test(reportingRes.error.message)) throw reportingRes.error;
  if (subjectRes.error) throw subjectRes.error;
  if (fnbManagerRes.error) throw fnbManagerRes.error;

  const branchGmUserIdsByLocationId = siteApproverLocationMap(
    (rolesRes.data ?? []).map((role) => ({
      userId: role.user_id as string,
      role: String(role.role),
      locationIds: (role.location_ids as string[] | null) ?? [],
    })),
  );
  const head = new Set<string>();
  const hr = new Set<string>();
  for (const role of rolesRes.data ?? []) {
    if (role.role === "regional_ops") head.add(role.user_id as string);
    if (role.role === "hr") hr.add(role.user_id as string);
  }

  const siteSupervisorUserIdsByLocationId = new Map<string, string[]>();
  const supervisorLocationByStaffId = new Map<string, string>();
  for (const staff of supervisorsRes.data ?? []) {
    const staffId = staff.id as string;
    const userId = (staff.user_id as string | null) ?? null;
    const title = staff.job_title as string | null;
    const staffRole = staff.staff_role as string | null;
    if (userId && isHeadOfOperationsTitle(title)) head.add(userId);
    if (!isSiteSupervisorTitle(title, staffRole)) continue;
    const locationId = staff.location_id as string | null;
    if (!locationId) continue;
    supervisorLocationByStaffId.set(staffId, locationId);
    if (!userId) continue;
    const list = siteSupervisorUserIdsByLocationId.get(locationId) ?? [];
    list.push(userId);
    siteSupervisorUserIdsByLocationId.set(locationId, list);
  }

  const fnbManagers = new Set<string>();
  for (const staff of fnbManagerRes.data ?? []) {
    const title = staff.job_title as string | null;
    const department = staff.department as string | null;
    const userId = (staff.user_id as string | null) ?? null;
    if (!userId || !isFnbManager(title, department)) continue;
    fnbManagers.add(userId);
  }

  const fnbStaffIds = new Set<string>();
  for (const staff of subjectRes.data ?? []) {
    if (isFoodBeverageStaff(staff.job_title as string | null, staff.department as string | null)) {
      fnbStaffIds.add(String(staff.id));
    }
  }

  const supervisorStaffIds = [...supervisorLocationByStaffId.keys()];
  const supervisorReportingRes = supervisorStaffIds.length
    ? await supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id, reporting_manager_staff_id")
        .in("staff_id", supervisorStaffIds)
    : { data: [] as Array<{ staff_id: string; reporting_manager_staff_id: string | null }>, error: null };
  if (supervisorReportingRes.error && !/does not exist|schema cache/i.test(supervisorReportingRes.error.message)) {
    throw supervisorReportingRes.error;
  }

  const reportingManagerUserIdByStaffId = new Map<string, string>();
  const hierarchyRows = [...(reportingRes.data ?? []), ...(supervisorReportingRes.data ?? [])];
  const managerStaffIds = [
    ...new Set(
      hierarchyRows
        .map((row) => row.reporting_manager_staff_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (managerStaffIds.length) {
    const { data: managers, error } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, status")
      .in("id", managerStaffIds)
      .eq("status", "active")
      .is("deleted_at", null);
    if (error) throw error;
    const userByStaff = new Map(
      (managers ?? [])
        .filter((row) => row.user_id)
        .map((row) => [row.id as string, row.user_id as string]),
    );
    for (const row of hierarchyRows) {
      const managerId = row.reporting_manager_staff_id;
      const userId = managerId ? userByStaff.get(managerId) : undefined;
      if (managerId && userId) reportingManagerUserIdByStaffId.set(row.staff_id, userId);
    }
  }

  const opsManagerUserIdsByLocationId = new Map<string, string[]>();
  for (const [staffId, locationId] of supervisorLocationByStaffId) {
    const managerUserId = reportingManagerUserIdByStaffId.get(staffId);
    if (!managerUserId) continue;
    const list = opsManagerUserIdsByLocationId.get(locationId) ?? [];
    if (!list.includes(managerUserId)) list.push(managerUserId);
    opsManagerUserIdsByLocationId.set(locationId, list);
  }

  const siteSupervisorManagerUserIdByStaffId = await loadSiteSupervisorManagerUserIds(uniqueStaff);

  return {
    reportingManagerUserIdByStaffId,
    siteSupervisorManagerUserIdByStaffId,
    branchGmUserIdsByLocationId,
    siteSupervisorUserIdsByLocationId,
    headOfOperationsUserIds: [...head],
    fnbManagerUserIds: [...fnbManagers],
    fnbStaffIds,
    opsManagerUserIdsByLocationId,
    hrUserIds: [...hr],
  };
}

/**
 * Nearest Venue / Site / Sr. Site supervisor login for each staff id (same walk as OT notify).
 */
async function loadSiteSupervisorManagerUserIds(staffIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(staffIds.filter(Boolean))];
  if (!unique.length) return result;

  const managerOf = new Map<string, string>();
  let frontier = unique;
  const seen = new Set<string>();
  for (let depth = 0; depth < 25 && frontier.length > 0; depth += 1) {
    const need = frontier.filter((id) => !seen.has(id));
    for (const id of need) seen.add(id);
    if (!need.length) break;
    const next: string[] = [];
    for (let index = 0; index < need.length; index += 80) {
      const chunk = need.slice(index, index + 80);
      const { data, error } = await supabaseAdmin
        .from("staff_profile_ext")
        .select("staff_id, reporting_manager_staff_id")
        .in("staff_id", chunk);
      if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
      for (const row of data ?? []) {
        const staffId = String(row.staff_id);
        const managerId = row.reporting_manager_staff_id ? String(row.reporting_manager_staff_id) : "";
        if (!managerId) continue;
        managerOf.set(staffId, managerId);
        next.push(managerId);
      }
    }
    frontier = next;
  }

  const managerIds = [...new Set(managerOf.values())];
  const managerByStaffId = new Map<
    string,
    { userId: string | null; jobTitle: string | null; staffRole: string | null }
  >();
  for (let index = 0; index < managerIds.length; index += 100) {
    const chunk = managerIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, job_title, staff_role")
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of data ?? []) {
      managerByStaffId.set(String(row.id), {
        userId: row.user_id ? String(row.user_id) : null,
        jobTitle: (row.job_title as string | null) ?? null,
        staffRole: (row.staff_role as string | null) ?? null,
      });
    }
  }

  for (const staffId of unique) {
    const userId = nearestSiteSupervisorUserId({
      staffId,
      reportingManagerStaffIdByStaffId: managerOf,
      managerByStaffId,
    });
    if (userId) result.set(staffId, userId);
  }
  return result;
}

/** Org-chart team (venue fallback when empty) for site supervisors acting on corrections. */
async function loadSiteSupervisorCorrectionTeamIds(userId: string): Promise<string[] | null> {
  const linked = await loadLinkedStaffRecord(userId);
  if (!linked?.id || !isSiteSupervisorTitle(linked.jobTitle, linked.staffRole)) return null;
  const { teamStaffIds } = await loadSupervisorOtTeamStaffIds(userId);
  return teamStaffIds;
}

async function loadCallerAccess(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role, role_level, location_ids")
    .eq("user_id", userId);
  if (error) throw error;
  const roles = (data ?? []).map((row) => row.role as AppRole);
  const viewAll = (data ?? []).some(
    (row) => Number(row.role_level) >= 80 || row.role === "hr" || row.role === "auditor",
  );
  const observeExecutiveSteps = roles.includes("ceo");
  const locations = new Set((data ?? []).flatMap((row) => (row.location_ids as string[] | null) ?? []));
  return {
    roles,
    canFinalApprove: canUserDo(roles, "attendance.approve"),
    viewAll,
    canSeeLocation: (locationId: string) => viewAll || locations.has(locationId),
    observeExecutiveSteps,
  };
}

async function loadSteps(correctionIds: string[]) {
  if (!correctionIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .select("id, correction_id, step_order, step_role, status, acted_by, acted_at")
    .in("correction_id", correctionIds)
    .order("step_order");
  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) return [];
    throw error;
  }
  return data ?? [];
}

async function nameByUserId(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const [{ data: staff }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("staff").select("user_id, full_name").in("user_id", ids),
    supabaseAdmin.from("profiles").select("id, display_name").in("id", ids),
  ]);
  for (const row of profiles ?? []) {
    if (row.display_name) names.set(row.id as string, String(row.display_name));
  }
  for (const row of staff ?? []) {
    if (row.user_id && row.full_name) names.set(row.user_id as string, String(row.full_name));
  }
  return names;
}

function mapQueueRow(
  row: CorrectionRow,
  steps: Array<{ correction_id: string; step_role: string; status: string; acted_by: string | null; acted_at: string | null; step_order: number }>,
  staffById: Map<
    string,
    { full_name: string | null; employee_code: string | null; department: string | null; job_title: string | null }
  >,
  actorNames: Map<string, string>,
  canAct: boolean,
  previousOverride?: { previousPunchIn: string | null; previousPunchOut: string | null } | null,
): MissedPunchQueueRow {
  const staff = row.staff_id ? staffById.get(row.staff_id) : undefined;
  const clocks = punchesOf(row.new_value);
  const fromOriginal = previousPunchesFromOriginalValue(row.original_value);
  return {
    id: row.id,
    kind: String(row.kind),
    workDate: row.work_date ? String(row.work_date).slice(0, 10) : null,
    reason: String(row.reason ?? ""),
    status: String(row.status),
    locationId: String(row.location_id),
    staffId: row.staff_id ? String(row.staff_id) : null,
    summaryId: row.summary_id ? String(row.summary_id) : null,
    staffName: staff?.full_name ?? null,
    employeeCode: staff?.employee_code ?? null,
    department: staff?.department ?? null,
    jobTitle: staff?.job_title ?? null,
    requestNumber: row.request_number ? String(row.request_number) : null,
    currentStepRole: asStep(row.current_step_role),
    requestedBy: String(row.requested_by),
    requestedAt: String(row.requested_at),
    punchType: clocks.punchType,
    punchAt: clocks.punchAt,
    punchInAt: clocks.punchInAt,
    punchOutAt: clocks.punchOutAt,
    previousPunchIn: fromOriginal.previousPunchIn ?? previousOverride?.previousPunchIn ?? null,
    previousPunchOut: fromOriginal.previousPunchOut ?? previousOverride?.previousPunchOut ?? null,
    reviewNote: row.review_note ? String(row.review_note) : null,
    steps: steps
      .filter((step) => step.correction_id === row.id)
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        stepRole: step.step_role,
        status: step.status,
        actedByName: step.acted_by ? actorNames.get(step.acted_by) ?? null : null,
        actedAt: step.acted_at,
      })),
    canAct,
  };
}

/** Load existing in/out from daily summary when original_value did not store them. */
async function previousPunchesFromSummaries(
  rows: readonly CorrectionRow[],
): Promise<Map<string, { previousPunchIn: string | null; previousPunchOut: string | null }>> {
  const map = new Map<string, { previousPunchIn: string | null; previousPunchOut: string | null }>();
  const needsHydration = rows.filter((row) => {
    const fromOriginal = previousPunchesFromOriginalValue(row.original_value);
    return !fromOriginal.previousPunchIn || !fromOriginal.previousPunchOut;
  });
  if (!needsHydration.length) return map;

  const summaryIds = [
    ...new Set(needsHydration.map((row) => row.summary_id).filter((id): id is string => Boolean(id))),
  ];
  const bySummary = new Map<string, { actual_in: string | null; actual_out: string | null }>();
  if (summaryIds.length) {
    const { data, error } = await supabaseAdmin
      .from("attendance_daily_summary")
      .select("id, actual_in, actual_out")
      .in("id", summaryIds);
    if (error) throw error;
    for (const row of data ?? []) {
      bySummary.set(String(row.id), {
        actual_in: row.actual_in ? String(row.actual_in) : null,
        actual_out: row.actual_out ? String(row.actual_out) : null,
      });
    }
  }

  const staffDateKeys = needsHydration
    .filter((row) => row.staff_id && row.work_date && !row.summary_id)
    .map((row) => ({
      staffId: String(row.staff_id),
      workDate: String(row.work_date).slice(0, 10),
    }));
  const byStaffDate = new Map<string, { actual_in: string | null; actual_out: string | null }>();
  if (staffDateKeys.length) {
    const staffIds = [...new Set(staffDateKeys.map((k) => k.staffId))];
    const dates = [...new Set(staffDateKeys.map((k) => k.workDate))];
    const { data, error } = await supabaseAdmin
      .from("attendance_daily_summary")
      .select("staff_id, work_date, actual_in, actual_out")
      .in("staff_id", staffIds)
      .in("work_date", dates);
    if (error) throw error;
    for (const row of data ?? []) {
      const key = `${row.staff_id}|${String(row.work_date).slice(0, 10)}`;
      byStaffDate.set(key, {
        actual_in: row.actual_in ? String(row.actual_in) : null,
        actual_out: row.actual_out ? String(row.actual_out) : null,
      });
    }
  }

  for (const row of needsHydration) {
    const fromOriginal = previousPunchesFromOriginalValue(row.original_value);
    const fromSummary =
      (row.summary_id ? bySummary.get(String(row.summary_id)) : null) ??
      (row.staff_id && row.work_date
        ? byStaffDate.get(`${row.staff_id}|${String(row.work_date).slice(0, 10)}`)
        : null);
    if (!fromSummary) continue;
    map.set(row.id, {
      previousPunchIn: fromOriginal.previousPunchIn ?? fromSummary.actual_in,
      previousPunchOut: fromOriginal.previousPunchOut ?? fromSummary.actual_out,
    });
  }
  return map;
}

export async function listMissedPunchCorrections(args: {
  userId: string;
  queue?: MissedPunchQueue;
  locationId?: string | null;
  status?: string | null;
  /** When set, return only corrections this user can approve. Used by the employee home. */
  actionableOnly?: boolean;
}): Promise<MissedPunchQueueRow[]> {
  const queue = args.queue ?? "waiting";
  const [access, teamStaffIds] = await Promise.all([
    loadCallerAccess(args.userId),
    loadSiteSupervisorCorrectionTeamIds(args.userId),
  ]);
  const columns =
    "id, location_id, staff_id, work_date, summary_id, kind, reason, status, requested_by, requested_at, current_step_role, review_note, new_value, original_value, request_number";
  const base = () =>
    supabaseAdmin
      .from("attendance_corrections")
      .select(columns)
      .order("requested_at", { ascending: false });
  let rows: CorrectionRow[] = [];
  if (queue === "waiting" && !args.status) {
    let pendingQuery = base().eq("status", "pending").limit(200);
    let decidedQuery = base().in("status", ["approved", "rejected", "change_required"]).limit(80);
    if (args.locationId) {
      pendingQuery = pendingQuery.eq("location_id", args.locationId);
      decidedQuery = decidedQuery.eq("location_id", args.locationId);
    }
    const [pendingRes, decidedRes] = await Promise.all([pendingQuery, decidedQuery]);
    if (pendingRes.error) throw pendingRes.error;
    if (decidedRes.error) throw decidedRes.error;
    const merged = new Map<string, CorrectionRow>();
    for (const row of [...(pendingRes.data ?? []), ...(decidedRes.data ?? [])] as CorrectionRow[]) {
      merged.set(row.id, row);
    }
    rows = [...merged.values()];
  } else {
    let query = base().limit(200);
    if (queue === "mine") query = query.eq("requested_by", args.userId);
    if (args.status) query = query.eq("status", args.status);
    if (args.locationId) query = query.eq("location_id", args.locationId);
    const { data, error } = await query;
    if (error) throw error;
    rows = (data ?? []) as CorrectionRow[];
  }
  const requesterStaff = await staffIdByUserId(rows.map((row) => String(row.requested_by)));
  const directory = await loadMissedPunchDirectory([
    ...rows.map((row) => row.staff_id).filter((id): id is string => Boolean(id)),
    ...requesterStaff.values(),
  ]);
  const viewOf = (row: CorrectionRow) => toView(row, requesterStaff.get(String(row.requested_by)) ?? null);
  rows = await healOwnCorrectionsWaitingOnOpsManager(rows, directory, viewOf);
  const visible = rows.filter((row) =>
    correctionVisibleToUser({
      queue,
      userId: args.userId,
      canFinalApprove: access.canFinalApprove,
      viewAll: access.viewAll,
      canSeeLocation: access.canSeeLocation,
      directory,
      row: viewOf(row),
      observeExecutiveSteps: access.observeExecutiveSteps,
      teamStaffIds,
    }),
  );
  const steps = await loadSteps(visible.map((row) => row.id));
  const staffIds = visible.map((row) => row.staff_id).filter((id): id is string => Boolean(id));
  const actorIds = steps.map((step) => step.acted_by).filter((id): id is string => Boolean(id));
  const [{ data: staffRows }, actorNames] = await Promise.all([
    staffIds.length
      ? supabaseAdmin
          .from("staff")
          .select("id, full_name, employee_code, department, job_title")
          .in("id", staffIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            full_name: string | null;
            employee_code: string | null;
            department: string | null;
            job_title: string | null;
          }>,
        }),
    nameByUserId(actorIds),
  ]);
  const staffById = new Map(
    (staffRows ?? []).map((row) => [
      row.id as string,
      {
        full_name: (row.full_name as string | null) ?? null,
        employee_code: (row.employee_code as string | null) ?? null,
        department: (row.department as string | null) ?? null,
        job_title: (row.job_title as string | null) ?? null,
      },
    ]),
  );
  const previousById = await previousPunchesFromSummaries(visible);
  const mapped = visible.map((row) =>
    mapQueueRow(
      row,
      steps,
      staffById,
      actorNames,
      canUserActOnCorrectionWithTeam(directory, args.userId, viewOf(row), teamStaffIds),
      previousById.get(row.id) ?? null,
    ),
  );
  return args.actionableOnly ? employeeHomeCorrectionRows(mapped) : mapped;
}

export async function countVisiblePendingCorrections(userId: string, locationId?: string | null): Promise<number> {
  const rows = await listMissedPunchCorrections({
    userId,
    queue: "waiting",
    locationId: locationId ?? null,
    status: "pending",
  });
  return rows.length;
}

/**
 * Legacy own corrections that waited on the manager step while the line manager was
 * already HoO / F&B Manager: move them to ops and mark manager skipped so the UI
 * shows Head of Operations (or F&B Manager) instead of site supervisor.
 */
async function healOwnCorrectionsWaitingOnOpsManager(
  rows: CorrectionRow[],
  directory: ApprovalDirectory,
  viewOf: (row: CorrectionRow) => CorrectionApprovalView,
): Promise<CorrectionRow[]> {
  const now = new Date().toISOString();
  const healed: CorrectionRow[] = [];
  for (const row of rows) {
    const view = viewOf(row);
    if (!shouldHealOwnCorrectionToOpsFirst(directory, view)) {
      healed.push(row);
      continue;
    }
    const { error: corrErr } = await supabaseAdmin
      .from("attendance_corrections")
      .update({ current_step_role: "ops" })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("current_step_role", "manager");
    if (corrErr) {
      console.warn("[missed-punch] heal to ops_first failed", corrErr.message);
      healed.push(row);
      continue;
    }
    const { error: stepErr } = await supabaseAdmin
      .from("attendance_correction_approvals")
      .update({ status: "skipped", acted_by: null, acted_at: now, comments: null })
      .eq("correction_id", row.id)
      .eq("step_role", "manager")
      .eq("status", "pending");
    if (stepErr && !/does not exist|schema cache|relation/i.test(stepErr.message)) {
      console.warn("[missed-punch] heal manager step failed", stepErr.message);
    }
    healed.push({ ...row, current_step_role: "ops" });
  }
  return healed;
}

const EXECUTIVE_NOTICE_SOURCE = "attendance_corrections";

async function loadCeoUserIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "ceo");
  if (error) {
    console.warn("[missed-punch] ceo lookup failed", error.message);
    return [];
  }
  return [...new Set((data ?? []).map((row) => row.user_id as string).filter(Boolean))];
}

async function dismissExecutiveMissedPunchNotices(correctionId: string) {
  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("source_type", EXECUTIVE_NOTICE_SOURCE)
    .eq("source_id", correctionId)
    .eq("category", "people")
    .is("dismissed_at", null);
  if (error) console.warn("[missed-punch] dismiss executive notices failed", error.message);
}

async function notifyApprovers(args: {
  userIds: string[];
  locationId: string;
  title: string;
  body: string;
  /** Correction id — matches derived inbox rows for dedupe + badge. */
  sourceId: string;
  /** Manager / My Day queue vs ops/HR corrections desk. */
  actionUrl?: string;
}) {
  try {
    await notifyUsers({
      userIds: args.userIds,
      locationId: args.locationId,
      category: "people",
      title: args.title,
      body: args.body,
      severity: "warning",
      actionUrl: args.actionUrl ?? "/hr/me#me-punch-approvals",
      sourceType: "attendance_corrections",
      sourceId: args.sourceId,
    });
  } catch (error) {
    console.warn("[missed-punch] notify failed", error instanceof Error ? error.message : error);
  }
}

/** Same panel item for Admin/CEO. The HR step does not copy. */
async function notifyExecutiveObservers(args: {
  step: MissedPunchStepRole;
  approverIds: string[];
  locationId: string;
  title: string;
  body: string;
  correctionId: string;
  excludeUserId?: string | null;
}) {
  try {
    if (!missedPunchCopiesExecutives(args.step)) {
      await dismissExecutiveMissedPunchNotices(args.correctionId);
      return;
    }
    const userIds = (await loadCeoUserIds()).filter(
      (id) => !args.approverIds.includes(id) && id !== args.excludeUserId,
    );
    await dismissExecutiveMissedPunchNotices(args.correctionId);
    if (userIds.length === 0) return;
    await notifyUsers({
      userIds,
      locationId: args.locationId,
      category: "people",
      title: args.title,
      body: args.body,
      severity: "warning",
      actionUrl: "/people/attendance/corrections",
      sourceType: EXECUTIVE_NOTICE_SOURCE,
      sourceId: args.correctionId,
    });
  } catch (error) {
    console.warn("[missed-punch] executive notify failed", error instanceof Error ? error.message : error);
  }
}

export async function submitMissedPunchRequest(args: {
  userId: string;
  summaryId: string;
  reason: string;
  /** Corrected punch-in HH:mm (optional when punch-out is set). */
  punchInTime?: string | null;
  /** Corrected punch-out HH:mm (optional when punch-in is set). */
  punchOutTime?: string | null;
  /**
   * Legacy single-side submit. Prefer punchInTime / punchOutTime so one form creates one MP.
   * Kept so older callers that only send punchType + punchTime still work.
   */
  punchType?: "in" | "out";
  punchTime?: string;
  /** @deprecated Prefer punchInTime / punchOutTime — still accepted for older clients. */
  requestedPunchIn?: string | null;
  /** @deprecated Prefer punchInTime / punchOutTime — still accepted for older clients. */
  requestedPunchOut?: string | null;
}): Promise<{
  id: string;
  requestNumber: string;
  approverCount: number;
  locationId: string;
  routedTo: PunchCorrectionRoutedTo;
}> {
  const linked = await loadLinkedStaffRecord(args.userId);
  if (!linked?.id) throw new ForbiddenError("No staff record is linked to this login.");
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, user_id, location_id")
    .eq("id", linked.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (staffErr) throw staffErr;
  if (!staff?.id) throw new ForbiddenError("No staff record is linked to this login.");

  const { data: summary, error: sumErr } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("id, staff_id, location_id, work_date, status, missed_punch, actual_in, actual_out")
    .eq("id", args.summaryId)
    .maybeSingle();
  if (sumErr) throw sumErr;
  if (!summary?.staff_id) throw new Error("This day is not a missed punch.");
  const access = await callerCorrectionAccess(args.userId);
  const targetStaffId = String(summary.staff_id);
  const isSelf = targetStaffId === String(staff.id);
  const baseRoute = punchCorrectionRoute({
    requesterStaffId: String(staff.id),
    targetStaffId,
    teamStaffIds: access.canCorrectTeam ? access.teamStaffIds : [],
  });
  if (baseRoute == null || (!isSelf && !access.canCorrectTeam)) {
    throw new ForbiddenError("You can only request a correction for yourself or someone who reports to you.");
  }
  const directory = await loadMissedPunchDirectory([staff.id as string, targetStaffId]);
  const route: PunchCorrectionRoutedTo =
    baseRoute === "ops"
      ? teamCorrectionRouteAfterOpsCheck(directory, targetStaffId, args.userId)
      : isSelf
        ? ownCorrectionRouteAfterLineManagerCheck(directory, {
            locationId: summary.location_id as string,
            staffId: targetStaffId,
            requestedBy: args.userId,
            requesterStaffId: staff.id as string,
          })
        : baseRoute;

  const hasIn = Boolean(summary.actual_in);
  const hasOut = Boolean(summary.actual_out);
  const day = {
    missedPunch: Boolean(summary.missed_punch),
    status: String(summary.status ?? ""),
    hasIn,
    hasOut,
  };
  const side = access.canRequest ? punchCorrectionRequestSide(day) : missedPunchRequestSide(day);
  if (!side) {
    throw new Error(access.canRequest ? "This day has no punch to correct." : "This day is not a missed punch.");
  }

  const punchInTime =
    args.punchInTime ??
    args.requestedPunchIn ??
    (args.punchType === "in" && args.punchTime ? args.punchTime : null) ??
    null;
  const punchOutTime =
    args.punchOutTime ??
    args.requestedPunchOut ??
    (args.punchType === "out" && args.punchTime ? args.punchTime : null) ??
    null;
  if (!punchInTime && !punchOutTime) {
    throw new Error("Enter the corrected punch-in, punch-out, or both.");
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("attendance_corrections")
    .select("id, status, new_value")
    .eq("summary_id", summary.id)
    .in("status", ["pending", "change_required"]);
  if (existingErr) throw existingErr;
  const openSameDay = (existing ?? [])[0] ?? null;
  if (openSameDay?.status === "change_required") {
    throw new Error("This punch was sent back for changes. Update that request and send it again.");
  }
  if (openSameDay) {
    throw new Error("A punch correction for this day is already waiting for approval.");
  }

  const workDate = String(summary.work_date).slice(0, 10);
  const managerName = String(staff.full_name ?? "").trim() || "The manager";
  const approvalNote =
    route === "ops" || route === "hr"
      ? managerTeamCorrectionNote({
          managerName,
          requestedPunchIn: punchInTime,
          requestedPunchOut: punchOutTime,
          previousPunchIn: summary.actual_in ? String(summary.actual_in) : null,
          previousPunchOut: summary.actual_out ? String(summary.actual_out) : null,
        })
      : null;
  const typedReason = args.reason.trim();
  const reason = approvalNote
    ? [typedReason.length >= 3 ? typedReason : null, approvalNote].filter(Boolean).join(" ")
    : typedReason.length >= 3
      ? typedReason
      : "Missed punch request";
  const now = new Date().toISOString();
  const requestNumber = await nextMissedPunchRequestNumber();
  const newValue = buildMissedPunchNewValue({
    workDate,
    punchInTime,
    punchOutTime,
    extras: approvalNote ? { manager_requested_and_approved: true } : {},
  });
  const { data: created, error: insErr } = await supabaseAdmin
    .from("attendance_corrections")
    .insert({
      location_id: summary.location_id,
      staff_id: summary.staff_id,
      work_date: workDate,
      summary_id: summary.id,
      kind: "add_punch",
      original_value: {
        actual_in: summary.actual_in,
        actual_out: summary.actual_out,
        missed_punch: Boolean(summary.missed_punch),
      },
      new_value: newValue,
      reason,
      review_note: approvalNote,
      requested_by: args.userId,
      status: "pending",
      current_step_role: correctionWaitingStep(route),
      request_number: requestNumber,
    })
    .select("id, request_number")
    .single();
  if (insErr) throw insErr;

  const { data: stepRows, error: stepErr } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .insert(
      correctionStepSeed(route).map((step) => ({
        correction_id: created.id,
        step_order: step.stepOrder,
        step_role: step.stepRole,
        status: step.status,
        acted_by: step.status === "approved" ? args.userId : null,
        acted_at: step.status === "pending" ? null : now,
        comments: step.status === "pending" ? null : approvalNote,
      })),
    )
    .select("id, step_role");
  if (stepErr) throw stepErr;

  let subjectName = managerName;
  if (!isSelf) {
    const { data: subject } = await supabaseAdmin.from("staff").select("full_name").eq("id", targetStaffId).maybeSingle();
    if (subject?.full_name) subjectName = String(subject.full_name);
  }
  if (route === "hr") {
    try {
      await writeCorrectionPunch({
        id: created.id as string,
        location_id: summary.location_id as string,
        staff_id: targetStaffId,
        work_date: workDate,
        summary_id: summary.id as string,
        kind: "add_punch",
        reason,
        status: "pending",
        requested_by: args.userId,
        requested_at: now,
        current_step_role: "hr",
        review_note: approvalNote,
        new_value: newValue,
        original_value: {
          actual_in: summary.actual_in,
          actual_out: summary.actual_out,
          missed_punch: Boolean(summary.missed_punch),
        },
      });
    } catch (applyError) {
      console.warn("[missed-punch] apply team punch failed", applyError instanceof Error ? applyError.message : applyError);
    }
    const hrIds = approverUserIdsForStep(directory, "hr", summary.location_id as string, targetStaffId).filter(
      (id) => id !== args.userId,
    );
    const hrTitle = `Missed punch waiting for HR · ${requestNumber}`;
    const hrBody = `${managerName} requested and approved a punch correction for ${subjectName} on ${workDate} (${requestNumber}). It is waiting for HR.`;
    await notifyApprovers({
      userIds: hrIds,
      locationId: summary.location_id as string,
      title: hrTitle,
      body: hrBody,
      sourceId: created.id as string,
      actionUrl: "/people/attendance/corrections",
    });
    return {
      id: created.id as string,
      requestNumber,
      approverCount: hrIds.length,
      locationId: summary.location_id as string,
      routedTo: "hr" as const,
    };
  }
  if (route === "ops") {
    // Site supervisor already approved on submit — wait for HoO / F&B before writing punches.
    const opsIds = approverUserIdsForStep(directory, "ops", summary.location_id as string, targetStaffId).filter(
      (id) => id !== args.userId,
    );
    const opsLabel = opsStepApproverLabel(correctionOpsLane(directory, targetStaffId));
    const opsTitle = `Missed punch waiting for ${opsLabel} · ${requestNumber}`;
    const opsBody = `${managerName} requested and approved a punch correction for ${subjectName} on ${workDate} (${requestNumber}). It is waiting for ${opsLabel}.`;
    await notifyApprovers({
      userIds: opsIds,
      locationId: summary.location_id as string,
      title: opsTitle,
      body: opsBody,
      sourceId: created.id as string,
      actionUrl: "/people/attendance/corrections",
    });
    await notifyExecutiveObservers({
      step: "ops",
      approverIds: opsIds,
      locationId: summary.location_id as string,
      title: opsTitle,
      body: opsBody,
      correctionId: created.id as string,
      excludeUserId: args.userId,
    });
    return {
      id: created.id as string,
      requestNumber,
      approverCount: opsIds.length,
      locationId: summary.location_id as string,
      routedTo: "ops" as const,
    };
  }

  if (route === "ops_first") {
    // Own request; line manager is already HoO / F&B Manager. Do not apply the punch yet.
    const opsIds = approverUserIdsForStep(directory, "ops", summary.location_id as string, targetStaffId).filter(
      (id) => id !== args.userId,
    );
    const opsLabel = opsStepApproverLabel(correctionOpsLane(directory, targetStaffId));
    const replacing = hasIn && hasOut;
    const opsTitle = replacing
      ? `Punch correction request · ${requestNumber}`
      : `Missed punch request · ${requestNumber}`;
    const opsBody = replacing
      ? `${subjectName} needs a punch corrected for ${workDate} (${requestNumber}). It is waiting for ${opsLabel}.`
      : `${subjectName} submitted a missed punch for ${workDate} (${requestNumber}). It is waiting for ${opsLabel}.`;
    await notifyApprovers({
      userIds: opsIds,
      locationId: summary.location_id as string,
      title: opsTitle,
      body: opsBody,
      sourceId: created.id as string,
      actionUrl: "/people/attendance/corrections",
    });
    await notifyExecutiveObservers({
      step: "ops",
      approverIds: opsIds,
      locationId: summary.location_id as string,
      title: opsTitle,
      body: opsBody,
      correctionId: created.id as string,
      excludeUserId: args.userId,
    });
    return {
      id: created.id as string,
      requestNumber,
      approverCount: opsIds.length,
      locationId: summary.location_id as string,
      routedTo: "ops_first" as const,
    };
  }

  const managers = requesterLineManagerUserIds(directory, {
    locationId: summary.location_id as string,
    staffId: targetStaffId,
    requestedBy: args.userId,
    requesterStaffId: staff.id as string,
  });
  const replacing = hasIn && hasOut;
  const managerTitle = replacing
    ? `Punch correction request · ${requestNumber}`
    : `Missed punch request · ${requestNumber}`;
  const managerBody = replacing
    ? `${subjectName} needs a punch corrected for ${workDate} (${requestNumber}). It is waiting for their line manager.`
    : `${subjectName} submitted a missed punch for ${workDate} (${requestNumber}). It is waiting for their line manager.`;
  await notifyApprovers({
    userIds: managers,
    locationId: summary.location_id as string,
    title: managerTitle,
    body: managerBody,
    sourceId: created.id as string,
  });
  await notifyExecutiveObservers({
    step: "manager",
    approverIds: managers,
    locationId: summary.location_id as string,
    title: managerTitle,
    body: managerBody,
    correctionId: created.id as string,
    excludeUserId: args.userId,
  });
  return {
    id: created.id as string,
    requestNumber,
    approverCount: managers.length,
    locationId: summary.location_id as string,
    routedTo: "line_manager" as const,
  };
}

async function recalculateCorrectionDay(row: CorrectionRow) {
  const locationId = String(row.location_id ?? "");
  const workDate = row.work_date ? String(row.work_date).slice(0, 10) : "";
  if (!locationId || !workDate) return;
  await recalculateAttendanceRange(
    supabaseAdmin as unknown as Parameters<typeof recalculateAttendanceRange>[0],
    locationId,
    workDate,
    workDate,
  );
}

/** Write this request's stored punch(es) once. A later step must not insert them again. */
async function writeCorrectionPunch(row: CorrectionRow) {
  if (String(row.kind) !== "add_punch") return;
  const clocks = punchesOf(row.new_value);
  const sides: Array<{ side: "in" | "out"; punchAt: string }> = [];
  if (clocks.punchInAt) sides.push({ side: "in", punchAt: clocks.punchInAt });
  if (clocks.punchOutAt) sides.push({ side: "out", punchAt: clocks.punchOutAt });
  if (!sides.length && clocks.punchAt) {
    sides.push({ side: clocks.punchType === "out" ? "out" : "in", punchAt: clocks.punchAt });
  }
  if (!sides.length) return;
  const correctionId = String(row.id);
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, punch_type, raw_payload")
    .eq("source", "correction")
    .filter("raw_payload->>correction_id", "eq", correctionId);
  if (findErr) throw findErr;
  const keepLogIds: string[] = [];
  for (const side of sides) {
    const match = (existing ?? []).find((log) => {
      const payload = (log.raw_payload ?? {}) as Record<string, unknown>;
      const payloadSide = payload.punch_side ?? payload.punchSide ?? log.punch_type;
      return payloadSide === side.side || (sides.length === 1 && !payload.punch_side && !payload.punchSide);
    });
    if (match?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from("attendance_logs")
        .update({
          punch_at: side.punchAt,
          punch_type: side.side,
          attendance_date: row.work_date ? String(row.work_date).slice(0, 10) : side.punchAt.slice(0, 10),
          raw_payload: { correction_id: correctionId, punch_side: side.side, reason: row.reason },
          excluded_from_calc: false,
        })
        .eq("id", match.id);
      if (updateErr) throw updateErr;
      keepLogIds.push(String(match.id));
      continue;
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("attendance_logs")
      .insert({
        location_id: row.location_id,
        staff_id: row.staff_id ?? null,
        punch_at: side.punchAt,
        punch_type: side.side,
        source: "correction",
        attendance_date: row.work_date ? String(row.work_date).slice(0, 10) : side.punchAt.slice(0, 10),
        raw_payload: { correction_id: correctionId, punch_side: side.side, reason: row.reason },
      })
      .select("id")
      .single();
    if (error) throw error;
    if (inserted?.id) keepLogIds.push(String(inserted.id));
  }
  await excludeReplacedPunches(row, keepLogIds, sides.map((s) => s.side));
  await recalculateCorrectionDay(row);
}

/** Drop the clock(s) this request replaces so wrong punches do not stay as check-in or check-out. */
async function excludeReplacedPunches(
  row: CorrectionRow,
  keepLogIds: readonly string[],
  sides: readonly ("in" | "out")[],
) {
  const original = (row.original_value ?? {}) as Record<string, unknown>;
  if (!row.staff_id || !row.work_date || !sides.length) return;
  const previousTimes: string[] = [];
  if (sides.includes("in") && typeof original.actual_in === "string" && original.actual_in.trim()) {
    previousTimes.push(original.actual_in);
  }
  if (sides.includes("out") && typeof original.actual_out === "string" && original.actual_out.trim()) {
    previousTimes.push(original.actual_out);
  }
  if (!previousTimes.length) return;
  const previousMs = previousTimes.map((t) => Date.parse(t)).filter((ms) => Number.isFinite(ms));
  if (!previousMs.length) return;
  const keep = new Set(keepLogIds);
  const { data: logs, error } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, punch_at")
    .eq("staff_id", row.staff_id)
    .eq("attendance_date", String(row.work_date).slice(0, 10))
    .eq("excluded_from_calc", false);
  if (error) throw error;
  const ids = (logs ?? [])
    .filter((log) => {
      if (keep.has(String(log.id))) return false;
      const ms = Date.parse(String(log.punch_at));
      return Number.isFinite(ms) && previousMs.some((prev) => Math.abs(ms - prev) < 1500);
    })
    .map((log) => String(log.id));
  if (!ids.length) return;
  const { error: updateErr } = await supabaseAdmin.from("attendance_logs").update({ excluded_from_calc: true }).in("id", ids);
  if (updateErr) throw updateErr;
}

async function removeCorrectionPunch(row: CorrectionRow) {
  const correctionId = String(row.id);
  const { error } = await supabaseAdmin
    .from("attendance_logs")
    .delete()
    .eq("source", "correction")
    .filter("raw_payload->>correction_id", "eq", correctionId);
  if (error) throw error;
  await recalculateCorrectionDay(row);
}

async function updateThisCorrectionOnly(
  correctionId: string,
  step: MissedPunchStepRole,
  patch: Record<string, unknown>,
) {
  const ids = correctionIdsForReview([{ id: correctionId }], correctionId);
  if (ids.length !== 1 || ids[0] !== correctionId) {
    throw new Error("This approval is not scoped to one request.");
  }
  const { data: updated, error } = await supabaseAdmin
    .from("attendance_corrections")
    .update(patch)
    .eq("id", correctionId)
    .eq("status", "pending")
    .eq("current_step_role", step)
    .select("id");
  if (error) throw error;
  if (!updated || updated.length !== 1 || String(updated[0]?.id) !== correctionId) {
    throw new Error("This request was already reviewed.");
  }
}

async function closeThisStep(
  stepId: string,
  correctionId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .update(patch)
    .eq("id", stepId)
    .eq("correction_id", correctionId)
    .eq("status", "pending");
  if (error) throw error;
}

/** Open legacy same-day in/out siblings decided with the clicked request. */
async function openLegacyReviewCorrectionIds(correctionId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("attendance_corrections")
    .select("id, staff_id, work_date, status, current_step_role, new_value")
    .eq("id", correctionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [correctionId];
  const clocks = punchesOf(data.new_value);
  if (clocks.punchType !== "in" && clocks.punchType !== "out") return [correctionId];
  if (String(data.status) !== "pending" || !data.staff_id || !data.work_date || !data.current_step_role) {
    return [correctionId];
  }
  const want = clocks.punchType === "in" ? "out" : "in";
  const { data: siblings, error: sibErr } = await supabaseAdmin
    .from("attendance_corrections")
    .select("id, new_value, status, current_step_role")
    .eq("staff_id", data.staff_id)
    .eq("work_date", String(data.work_date).slice(0, 10))
    .eq("status", "pending")
    .eq("current_step_role", data.current_step_role)
    .neq("id", correctionId);
  if (sibErr) throw sibErr;
  const sibling = (siblings ?? []).find((row) => punchesOf(row.new_value).punchType === want);
  if (!sibling?.id) return [correctionId];
  return correctionIdsForReview(
    [
      {
        id: String(data.id),
        staffId: String(data.staff_id),
        workDate: String(data.work_date).slice(0, 10),
        status: String(data.status),
        currentStepRole: asStep(data.current_step_role),
        punchType: clocks.punchType,
      },
      {
        id: String(sibling.id),
        staffId: String(data.staff_id),
        workDate: String(data.work_date).slice(0, 10),
        status: String(sibling.status),
        currentStepRole: asStep(sibling.current_step_role),
        punchType: want,
      },
    ],
    correctionId,
  );
}

export async function reviewMissedPunchChain(args: {
  userId: string;
  correctionId: string;
  decision: "approved" | "rejected" | "change_required";
  reviewNote?: string | null;
  applyFinal: (row: CorrectionRow) => Promise<void>;
}): Promise<{ ok: true; final: boolean; nextStep: MissedPunchStepRole | null; locationId: string }> {
  const ids = await openLegacyReviewCorrectionIds(args.correctionId);
  let last: { ok: true; final: boolean; nextStep: MissedPunchStepRole | null; locationId: string } | null = null;
  for (const id of ids) {
    last = await reviewOneMissedPunchChain({ ...args, correctionId: id });
  }
  if (!last) throw new Error("Correction not found.");
  return last;
}

async function reviewOneMissedPunchChain(args: {
  userId: string;
  correctionId: string;
  decision: "approved" | "rejected" | "change_required";
  reviewNote?: string | null;
  applyFinal: (row: CorrectionRow) => Promise<void>;
}): Promise<{ ok: true; final: boolean; nextStep: MissedPunchStepRole | null; locationId: string }> {
  const { data, error } = await supabaseAdmin
    .from("attendance_corrections")
    .select("*")
    .eq("id", args.correctionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as CorrectionRow | null;
  if (!row) throw new Error("Correction not found.");
  if (String(row.id) !== args.correctionId) throw new Error("Correction not found.");
  const step = asStep(row.current_step_role);
  if (!step || row.status !== "pending") throw new Error("This request is not waiting for approval.");
  if (row.requested_by === args.userId) throw new ForbiddenError("You cannot approve your own correction.");

  const requesterStaff = await staffIdByUserId([String(row.requested_by)]);
  const requesterStaffId = requesterStaff.get(String(row.requested_by)) ?? null;
  const [directory, teamStaffIds] = await Promise.all([
    loadMissedPunchDirectory(
      [row.staff_id, requesterStaffId].filter((id): id is string => Boolean(id)),
    ),
    loadSiteSupervisorCorrectionTeamIds(args.userId),
  ]);
  const view = toView(row, requesterStaffId);
  if (!canUserActOnCorrectionWithTeam(directory, args.userId, view, teamStaffIds)) {
    throw new ForbiddenError("This request is not waiting for you.");
  }

  const { data: steps, error: stepErr } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .select("id, step_order, step_role, status")
    .eq("correction_id", row.id)
    .order("step_order");
  if (stepErr && !/does not exist|schema cache|relation/i.test(stepErr.message)) throw stepErr;
  const pending =
    (steps ?? []).find((item) => item.step_role === step && item.status === "pending") ??
    (steps ?? []).find((item) => item.status === "pending");
  const now = new Date().toISOString();

  if (args.decision === "rejected" || args.decision === "change_required") {
    const sendingBack = args.decision === "change_required";
    await updateThisCorrectionOnly(args.correctionId, step, {
      status: sendingBack ? "change_required" : "rejected",
      current_step_role: null,
      reviewed_by: args.userId,
      reviewed_at: now,
      review_note: args.reviewNote ?? null,
    });
    if (pending) {
      await closeThisStep(String(pending.id), args.correctionId, {
        status: "rejected",
        acted_by: args.userId,
        acted_at: now,
        comments: args.reviewNote ?? (sendingBack ? "Change required" : null),
      });
    }
    try {
      await removeCorrectionPunch(row);
    } catch (removeError) {
      console.warn(
        "[missed-punch] remove punch failed",
        removeError instanceof Error ? removeError.message : removeError,
      );
    }
    await dismissExecutiveMissedPunchNotices(row.id);
    const when = row.work_date ? ` for ${String(row.work_date).slice(0, 10)}` : "";
    await notifyApprovers({
      userIds: [String(row.requested_by)],
      locationId: String(row.location_id),
      title: sendingBack ? "Missed punch change required" : "Missed punch request rejected",
      body: sendingBack
        ? `Your missed punch request${when} needs a change. Update it and send it again.`
        : `Your missed punch request${when} was rejected.`,
      sourceId: row.id,
      actionUrl: "/hr/me",
    });
    return { ok: true, final: true, nextStep: null, locationId: String(row.location_id) };
  }

  const next = nextMissedPunchStep(step);
  if (!next) {
    await updateThisCorrectionOnly(args.correctionId, step, {
      status: "approved",
      current_step_role: null,
      reviewed_by: args.userId,
      reviewed_at: now,
      review_note: args.reviewNote ?? null,
    });
    if (pending) {
      await closeThisStep(String(pending.id), args.correctionId, {
        status: "approved",
        acted_by: args.userId,
        acted_at: now,
        comments: args.reviewNote ?? null,
      });
    }
    if (String(row.kind) === "add_punch") await writeCorrectionPunch(row);
    else await args.applyFinal(row);
    await dismissExecutiveMissedPunchNotices(row.id);
    await notifyApprovers({
      userIds: [String(row.requested_by)],
      locationId: String(row.location_id),
      title: "Missed punch request approved",
      body: `Your missed punch request${row.work_date ? ` for ${String(row.work_date).slice(0, 10)}` : ""} was approved.`,
      sourceId: row.id,
      actionUrl: "/hr/me",
    });
    return { ok: true, final: true, nextStep: null, locationId: String(row.location_id) };
  }

  await updateThisCorrectionOnly(args.correctionId, step, { current_step_role: next });
  if (pending) {
    await closeThisStep(String(pending.id), args.correctionId, {
      status: "approved",
      acted_by: args.userId,
      acted_at: now,
      comments: args.reviewNote ?? null,
    });
  }
  // Site supervisor → ops: workflow only. Ops → HR (or final): write punches.
  if (String(row.kind) === "add_punch" && shouldApplyCorrectionPunchOnApprove({ currentStep: step, nextStep: next })) {
    try {
      await writeCorrectionPunch(row);
    } catch (applyError) {
      console.warn("[missed-punch] apply punch failed", applyError instanceof Error ? applyError.message : applyError);
    }
  }

  const nextIds = approverUserIdsForStep(directory, next, String(row.location_id), row.staff_id, {
    requestedBy: String(row.requested_by),
    requesterStaffId,
  }).filter((id) => id !== row.requested_by && id !== args.userId);
  const { data: person } = row.staff_id
    ? await supabaseAdmin.from("staff").select("full_name").eq("id", row.staff_id).maybeSingle()
    : { data: null };
  const who = (person?.full_name as string | null) ?? "Staff";
  const when = row.work_date ? ` on ${String(row.work_date).slice(0, 10)}` : "";
  const opsLabel = opsStepApproverLabel(correctionOpsLane(directory, row.staff_id ? String(row.staff_id) : null));
  const nextTitle = next === "ops" ? `Missed punch waiting for ${opsLabel}` : "Missed punch waiting for HR";
  const nextBody =
    next === "ops"
      ? `${who}'s missed punch${when} was approved by their supervisor.`
      : `${who}'s missed punch${when} was approved by ${opsLabel}.`;
  await notifyApprovers({
    userIds: nextIds,
    locationId: String(row.location_id),
    title: nextTitle,
    body: nextBody,
    sourceId: row.id,
    actionUrl: "/people/attendance/corrections",
  });
  await notifyExecutiveObservers({
    step: next,
    approverIds: nextIds,
    locationId: String(row.location_id),
    title: nextTitle,
    body: nextBody,
    correctionId: row.id,
    excludeUserId: String(row.requested_by),
  });
  return { ok: true, final: false, nextStep: next, locationId: String(row.location_id) };
}

/**
 * Employee edits their own punch correction while it is still open
 * (`pending` or `change_required`). Pending edits keep the current approval step;
 * change-required resubmits restart the chain like a fresh send.
 */
export async function resubmitMissedPunchRequest(args: {
  userId: string;
  correctionId: string;
  reason: string;
  /** Corrected punch-in HH:mm. Optional when punchOutTime is set (or legacy punchTime for a single side). */
  punchInTime?: string | null;
  /** Corrected punch-out HH:mm. Optional when punchInTime is set. */
  punchOutTime?: string | null;
  /** Legacy single-side time — applied to the request's existing punch side when in/out are omitted. */
  punchTime?: string;
}): Promise<{ id: string; approverCount: number; locationId: string; routedTo: PunchCorrectionRoutedTo }> {
  const { data, error } = await supabaseAdmin
    .from("attendance_corrections")
    .select("*")
    .eq("id", args.correctionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as CorrectionRow | null;
  if (!row) throw new Error("Correction not found.");
  if (
    !canRequesterEditMissedPunch({
      userId: args.userId,
      requestedBy: String(row.requested_by),
      status: String(row.status),
    })
  ) {
    if (String(row.requested_by) !== args.userId) {
      throw new ForbiddenError("You can only update your own punch request.");
    }
    throw new Error("This request can no longer be edited.");
  }
  const ids = correctionIdsForReview([{ id: String(row.id) }], args.correctionId);
  if (ids.length !== 1) throw new Error("This update is not scoped to one request.");

  const workDate = row.work_date ? String(row.work_date).slice(0, 10) : "";
  if (!workDate) throw new Error("This request has no work date.");
  const previousClocks = punchesOf(row.new_value);
  const previous = (row.new_value ?? {}) as Record<string, unknown>;
  const original = (row.original_value ?? {}) as Record<string, unknown>;
  const hhmm = (iso: string | null) => {
    if (!iso) return null;
    const match = iso.match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : null;
  };
  let punchInTime =
    args.punchInTime !== undefined
      ? args.punchInTime
      : hhmm(previousClocks.punchInAt) ??
        (typeof previous.requested_punch_in === "string" ? previous.requested_punch_in : null);
  let punchOutTime =
    args.punchOutTime !== undefined
      ? args.punchOutTime
      : hhmm(previousClocks.punchOutAt) ??
        (typeof previous.requested_punch_out === "string" ? previous.requested_punch_out : null);
  if (args.punchTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(args.punchTime)) {
    // Legacy single-field edit: update the side that already exists, or punch-in by default.
    if (previousClocks.punchType === "out" && args.punchInTime === undefined && args.punchOutTime === undefined) {
      punchOutTime = args.punchTime;
    } else if (args.punchInTime === undefined && args.punchOutTime === undefined) {
      if (previousClocks.punchType === "both" || previousClocks.punchInAt) punchInTime = args.punchTime;
      else if (previousClocks.punchOutAt) punchOutTime = args.punchTime;
      else punchInTime = args.punchTime;
    }
  }
  if (!punchInTime && !punchOutTime) throw new Error("Enter a punch time.");
  const requesterStaff = await staffIdByUserId([args.userId]);
  const requesterStaffId = requesterStaff.get(args.userId) ?? null;
  const access = await callerCorrectionAccess(args.userId);
  const targetStaffId = row.staff_id ? String(row.staff_id) : "";
  const directoryEarly = await loadMissedPunchDirectory(
    [row.staff_id, requesterStaffId].filter((id): id is string => Boolean(id)),
  );
  const baseRoute =
    punchCorrectionRoute({
      requesterStaffId,
      targetStaffId,
      teamStaffIds: access.canCorrectTeam ? access.teamStaffIds : [],
    }) ?? "line_manager";
  const isSelf = Boolean(requesterStaffId && targetStaffId && requesterStaffId === targetStaffId);
  const route: PunchCorrectionRoutedTo =
    baseRoute === "ops"
      ? teamCorrectionRouteAfterOpsCheck(directoryEarly, targetStaffId || null, args.userId)
      : isSelf
        ? ownCorrectionRouteAfterLineManagerCheck(directoryEarly, {
            locationId: String(row.location_id ?? ""),
            staffId: targetStaffId || null,
            requestedBy: args.userId,
            requesterStaffId,
          })
        : baseRoute;
  const requesterLinked = await loadLinkedStaffRecord(args.userId);
  const managerName = String(requesterLinked?.fullName ?? "").trim() || "The manager";
  const approvalNote =
    route === "ops" || route === "hr"
      ? managerTeamCorrectionNote({
          managerName,
          requestedPunchIn: punchInTime,
          requestedPunchOut: punchOutTime,
          previousPunchIn: typeof original.actual_in === "string" ? original.actual_in : null,
          previousPunchOut: typeof original.actual_out === "string" ? original.actual_out : null,
        })
      : null;
  const typedReason = args.reason.trim();
  const reason = approvalNote
    ? [typedReason.length >= 3 ? typedReason : null, approvalNote].filter(Boolean).join(" ")
    : typedReason.length >= 3
      ? typedReason
      : "Missed punch request";
  const now = new Date().toISOString();
  const wasChangeRequired = row.status === "change_required";
  const newValue = buildMissedPunchNewValue({
    workDate,
    punchInTime,
    punchOutTime,
    extras: {
      ...previous,
      ...(approvalNote
        ? { manager_requested_and_approved: true }
        : { manager_requested_and_approved: false }),
    },
  });

  if (wasChangeRequired) {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("attendance_corrections")
      .update({
        status: "pending",
        current_step_role: correctionWaitingStep(route),
        reason,
        new_value: newValue,
        review_note: approvalNote,
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq("id", args.correctionId)
      .eq("status", "change_required")
      .eq("requested_by", args.userId)
      .select("id");
    if (updateErr) throw updateErr;
    if (!updated || updated.length !== 1) throw new Error("This request was already sent again.");

    for (const step of correctionStepSeed(route)) {
      const { error: stepErr } = await supabaseAdmin
        .from("attendance_correction_approvals")
        .update({
          status: step.status,
          acted_by: step.status === "approved" ? args.userId : null,
          acted_at: step.status === "pending" ? null : now,
          comments: step.status === "pending" ? null : approvalNote,
        })
        .eq("correction_id", args.correctionId)
        .eq("step_role", step.stepRole);
      if (stepErr && !/does not exist|schema cache|relation/i.test(stepErr.message)) throw stepErr;
    }
  } else {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("attendance_corrections")
      .update({
        reason,
        new_value: newValue,
        ...(approvalNote ? { review_note: approvalNote } : {}),
      })
      .eq("id", args.correctionId)
      .eq("status", "pending")
      .eq("requested_by", args.userId)
      .select("id");
    if (updateErr) throw updateErr;
    if (!updated || updated.length !== 1) throw new Error("This request can no longer be edited.");
  }

  const waitingStep = wasChangeRequired
    ? correctionWaitingStep(route)
    : asStep(row.current_step_role);
  // Re-apply only after ops has accepted (waiting on HR) or the submitter already held the ops seat.
  if (waitingStep === "hr" || route === "hr") {
    try {
      await writeCorrectionPunch({
        ...row,
        reason,
        new_value: newValue,
        review_note: approvalNote,
        status: "pending",
        current_step_role: waitingStep,
      });
    } catch (applyError) {
      console.warn(
        "[missed-punch] re-apply punch after edit failed",
        applyError instanceof Error ? applyError.message : applyError,
      );
    }
  }

  const { data: staff } = row.staff_id
    ? await supabaseAdmin.from("staff").select("id, full_name").eq("id", row.staff_id).maybeSingle()
    : { data: null };
  const directory = directoryEarly;
  const who = (staff?.full_name as string | null) ?? "Staff";
  const notifyRoute: PunchCorrectionRoutedTo = wasChangeRequired
    ? route
    : row.current_step_role === "hr"
      ? "hr"
      : row.current_step_role === "ops"
        ? route === "ops_first"
          ? "ops_first"
          : "ops"
        : "line_manager";
  const updatedVerb = wasChangeRequired ? "updated" : "edited";

  if (notifyRoute === "hr") {
    const hrIds = approverUserIdsForStep(directory, "hr", String(row.location_id), targetStaffId || null).filter(
      (id) => id !== args.userId,
    );
    await notifyApprovers({
      userIds: hrIds,
      locationId: String(row.location_id),
      title: wasChangeRequired ? "Missed punch waiting for HR" : "Missed punch updated — HR",
      body: wasChangeRequired
        ? `${managerName} requested and approved a punch correction for ${who} on ${workDate}. It is waiting for HR.`
        : `${who} ${updatedVerb} a punch correction for ${workDate}. It is still waiting for HR.`,
      sourceId: args.correctionId,
      actionUrl: "/people/attendance/corrections",
    });
    return { id: args.correctionId, approverCount: hrIds.length, locationId: String(row.location_id), routedTo: "hr" };
  }
  if (notifyRoute === "ops" || notifyRoute === "ops_first") {
    const targetId = row.staff_id ? String(row.staff_id) : null;
    const opsIds = approverUserIdsForStep(directory, "ops", String(row.location_id), targetId).filter(
      (id) => id !== args.userId,
    );
    const opsLabel = opsStepApproverLabel(correctionOpsLane(directory, targetId));
    const teamApproved = notifyRoute === "ops" && wasChangeRequired && route === "ops";
    const opsTitle = wasChangeRequired
      ? `Missed punch waiting for ${opsLabel}`
      : `Missed punch updated — ${opsLabel}`;
    const opsBody =
      teamApproved
        ? `${managerName} requested and approved a punch correction for ${who} on ${workDate}. It is waiting for ${opsLabel}.`
        : `${who} ${updatedVerb} a missed punch for ${workDate}. It is waiting for ${opsLabel}.`;
    await notifyApprovers({
      userIds: opsIds,
      locationId: String(row.location_id),
      title: opsTitle,
      body: opsBody,
      sourceId: args.correctionId,
      actionUrl: "/people/attendance/corrections",
    });
    await notifyExecutiveObservers({
      step: "ops",
      approverIds: opsIds,
      locationId: String(row.location_id),
      title: opsTitle,
      body: opsBody,
      correctionId: args.correctionId,
      excludeUserId: args.userId,
    });
    return {
      id: args.correctionId,
      approverCount: opsIds.length,
      locationId: String(row.location_id),
      routedTo: notifyRoute === "ops_first" ? "ops_first" : "ops",
    };
  }

  const managers = requesterLineManagerUserIds(directory, {
    locationId: String(row.location_id),
    staffId: row.staff_id ? String(row.staff_id) : null,
    requestedBy: args.userId,
    requesterStaffId,
  });
  const managerTitle = wasChangeRequired ? "Missed punch request" : "Missed punch updated";
  const managerBody = `${who} ${updatedVerb} a missed punch for ${workDate}. It is waiting for their line manager.`;
  await notifyApprovers({
    userIds: managers,
    locationId: String(row.location_id),
    title: managerTitle,
    body: managerBody,
    sourceId: args.correctionId,
  });
  await notifyExecutiveObservers({
    step: "manager",
    approverIds: managers,
    locationId: String(row.location_id),
    title: managerTitle,
    body: managerBody,
    correctionId: args.correctionId,
    excludeUserId: args.userId,
  });
  return {
    id: args.correctionId,
    approverCount: managers.length,
    locationId: String(row.location_id),
    routedTo: "line_manager",
  };
}

export type PunchCorrectionSubject = {
  staffId: string;
  fullName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  /** Ops step for this person: Head of Operations or F&B Manager. */
  opsLane: "head_of_operations" | "fnb_manager";
  self: boolean;
};

export type PunchCorrectionDay = {
  summaryId: string | null;
  workDate: string;
  actualIn: string | null;
  actualOut: string | null;
  status: string;
  missedPunch: boolean;
  correctable: boolean;
};

/** People this login may correct (self, plus team for Operations / F&B supervisors). */
export async function listPunchCorrectionSubjects(userId: string): Promise<PunchCorrectionSubject[]> {
  const access = await callerCorrectionAccess(userId);
  if (!access.canRequest || !access.staffId) return [];
  const ids = access.canCorrectTeam ? [access.staffId, ...access.teamStaffIds] : [access.staffId];
  const data: Array<{
    id: string;
    full_name: string | null;
    employee_code: string | null;
    job_title: string | null;
    department: string | null;
  }> = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const { data: rows, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code, job_title, department")
      .in("id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    data.push(...(rows ?? []));
  }
  return data
    .map((row) => {
      const jobTitle = row.job_title ? String(row.job_title) : null;
      const department = row.department ? String(row.department) : null;
      return {
        staffId: String(row.id),
        fullName: String(row.full_name ?? "Staff"),
        employeeCode: row.employee_code ? String(row.employee_code) : null,
        jobTitle,
        department,
        opsLane: opsApprovalLaneForStaff(jobTitle, department),
        self: String(row.id) === access.staffId,
      };
    })
    .sort((a, b) => Number(b.self) - Number(a.self) || a.fullName.localeCompare(b.fullName));
}

/** One attendance day for a person this login may correct. */
export async function findPunchCorrectionDay(args: {
  userId: string;
  staffId: string;
  workDate: string;
}): Promise<PunchCorrectionDay> {
  const access = await callerCorrectionAccess(args.userId);
  const teamIds = access.canCorrectTeam ? access.teamStaffIds : [];
  if (
    !access.canRequest ||
    !canCorrectStaffPunch({
      requesterStaffId: access.staffId,
      targetStaffId: args.staffId,
      directReportStaffIds: teamIds,
    })
  ) {
    throw new ForbiddenError("You can only correct your own punches or punches for people who report to you.");
  }
  const { data, error } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("id, work_date, status, missed_punch, actual_in, actual_out")
    .eq("staff_id", args.staffId)
    .eq("work_date", args.workDate)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      summaryId: null,
      workDate: args.workDate,
      actualIn: null,
      actualOut: null,
      status: "",
      missedPunch: false,
      correctable: false,
    };
  }
  const hasIn = Boolean(data.actual_in);
  const hasOut = Boolean(data.actual_out);
  return {
    summaryId: String(data.id),
    workDate: String(data.work_date).slice(0, 10),
    actualIn: data.actual_in ? String(data.actual_in) : null,
    actualOut: data.actual_out ? String(data.actual_out) : null,
    status: String(data.status ?? ""),
    missedPunch: Boolean(data.missed_punch),
    correctable:
      punchCorrectionRequestSide({
        missedPunch: Boolean(data.missed_punch),
        status: String(data.status ?? ""),
        hasIn,
        hasOut,
      }) !== null,
  };
}
