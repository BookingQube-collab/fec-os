import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  approverUserIdsForStep,
  canUserActOnCorrection,
  correctionIdsForReview,
  correctionVisibleToUser,
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
  lineManagerUserIds,
  missedPunchApprovalSteps,
  missedPunchCopiesExecutives,
  missedPunchRequestSide,
  nextMissedPunchStep,
  punchAtFromCorrectionValue,
  punchTypeFromCorrectionValue,
  type ApprovalDirectory,
  type CorrectionApprovalView,
  type MissedPunchQueue,
  type MissedPunchStepRole,
} from "@/lib/attendance-hr/missed-punch-approval";
import { notifyUsers } from "@/lib/notifications/action-notify";
import { canUserDo, type AppRole } from "@/lib/rbac";
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
  currentStepRole: MissedPunchStepRole | null;
  requestedBy: string;
  requestedAt: string;
  punchType: "in" | "out" | null;
  /** Clock time the employee asked to record. Null when the request has no stored time. */
  punchAt: string | null;
  reviewNote: string | null;
  steps: Array<{
    stepRole: string;
    status: string;
    actedByName: string | null;
    actedAt: string | null;
  }>;
  canAct: boolean;
};

function punchTypeOf(value: Record<string, unknown> | null | undefined): "in" | "out" | null {
  return punchTypeFromCorrectionValue(value);
}

function asStep(value: string | null | undefined): MissedPunchStepRole | null {
  if (value === "manager" || value === "ops" || value === "hr") return value;
  return null;
}

function toView(row: CorrectionRow): CorrectionApprovalView {
  return {
    status: String(row.status),
    currentStepRole: asStep(row.current_step_role),
    locationId: String(row.location_id),
    staffId: row.staff_id ? String(row.staff_id) : null,
    requestedBy: String(row.requested_by),
  };
}

export async function loadMissedPunchDirectory(staffIds: string[]): Promise<ApprovalDirectory> {
  const uniqueStaff = [...new Set(staffIds.filter(Boolean))];
  const [rolesRes, supervisorsRes, reportingRes] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id, role, location_ids").in("role", ["branch_gm", "regional_ops", "hr"]),
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
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (supervisorsRes.error) throw supervisorsRes.error;
  if (reportingRes.error && !/does not exist|schema cache/i.test(reportingRes.error.message)) throw reportingRes.error;

  const branchGmUserIdsByLocationId = new Map<string, string[]>();
  const head = new Set<string>();
  const hr = new Set<string>();
  for (const role of rolesRes.data ?? []) {
    if (role.role === "regional_ops") head.add(role.user_id as string);
    if (role.role === "hr") hr.add(role.user_id as string);
    if (role.role !== "branch_gm") continue;
    for (const locationId of (role.location_ids as string[] | null) ?? []) {
      const list = branchGmUserIdsByLocationId.get(locationId) ?? [];
      list.push(role.user_id as string);
      branchGmUserIdsByLocationId.set(locationId, list);
    }
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

  return {
    reportingManagerUserIdByStaffId,
    branchGmUserIdsByLocationId,
    siteSupervisorUserIdsByLocationId,
    headOfOperationsUserIds: [...head],
    opsManagerUserIdsByLocationId,
    hrUserIds: [...hr],
  };
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
  staffById: Map<string, { full_name: string | null; employee_code: string | null }>,
  actorNames: Map<string, string>,
  canAct: boolean,
): MissedPunchQueueRow {
  const staff = row.staff_id ? staffById.get(row.staff_id) : undefined;
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
    currentStepRole: asStep(row.current_step_role),
    requestedBy: String(row.requested_by),
    requestedAt: String(row.requested_at),
    punchType: punchTypeOf(row.new_value),
    punchAt: punchAtFromCorrectionValue(row.new_value),
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

export async function listMissedPunchCorrections(args: {
  userId: string;
  queue?: MissedPunchQueue;
  locationId?: string | null;
  status?: string | null;
}): Promise<MissedPunchQueueRow[]> {
  const queue = args.queue ?? "waiting";
  const access = await loadCallerAccess(args.userId);
  const columns =
    "id, location_id, staff_id, work_date, summary_id, kind, reason, status, requested_by, requested_at, current_step_role, review_note, new_value";
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
  const directory = await loadMissedPunchDirectory(rows.map((row) => row.staff_id).filter((id): id is string => Boolean(id)));
  const visible = rows.filter((row) =>
    correctionVisibleToUser({
      queue,
      userId: args.userId,
      canFinalApprove: access.canFinalApprove,
      viewAll: access.viewAll,
      canSeeLocation: access.canSeeLocation,
      directory,
      row: toView(row),
      observeExecutiveSteps: access.observeExecutiveSteps,
    }),
  );
  const steps = await loadSteps(visible.map((row) => row.id));
  const staffIds = visible.map((row) => row.staff_id).filter((id): id is string => Boolean(id));
  const actorIds = steps.map((step) => step.acted_by).filter((id): id is string => Boolean(id));
  const [{ data: staffRows }, actorNames] = await Promise.all([
    staffIds.length
      ? supabaseAdmin.from("staff").select("id, full_name, employee_code").in("id", staffIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; employee_code: string | null }> }),
    nameByUserId(actorIds),
  ]);
  const staffById = new Map(
    (staffRows ?? []).map((row) => [
      row.id as string,
      { full_name: (row.full_name as string | null) ?? null, employee_code: (row.employee_code as string | null) ?? null },
    ]),
  );
  return visible.map((row) =>
    mapQueueRow(row, steps, staffById, actorNames, canUserActOnCorrection(directory, args.userId, toView(row))),
  );
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
  sourceId: string;
}) {
  try {
    await notifyUsers({
      userIds: args.userIds,
      locationId: args.locationId,
      category: "people",
      title: args.title,
      body: args.body,
      severity: "warning",
      actionUrl: "/hr/me#me-punch-approvals",
      sourceType: "attendance_correction_approval",
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
  punchType: "in" | "out";
  punchTime: string;
  reason: string;
}): Promise<{ id: string; approverCount: number; locationId: string }> {
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, user_id, location_id")
    .eq("user_id", args.userId)
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
  if (!summary || summary.staff_id !== staff.id) {
    throw new ForbiddenError("You can only request a correction for your own attendance.");
  }

  const hasIn = Boolean(summary.actual_in);
  const hasOut = Boolean(summary.actual_out);
  const side = missedPunchRequestSide({
    missedPunch: Boolean(summary.missed_punch),
    status: String(summary.status ?? ""),
    hasIn,
    hasOut,
  });
  if (!side) throw new Error("This day is not a missed punch.");

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("attendance_corrections")
    .select("id, status, new_value")
    .eq("summary_id", summary.id)
    .in("status", ["pending", "change_required"]);
  if (existingErr) throw existingErr;
  const sameSideOpen = (existing ?? []).find((row) => {
    const pendingType = punchTypeOf(row.new_value as Record<string, unknown> | null);
    return pendingType === args.punchType || pendingType == null;
  });
  if (sameSideOpen?.status === "change_required") {
    throw new Error("This punch was sent back for changes. Update that request and send it again.");
  }
  if (sameSideOpen) {
    throw new Error(
      args.punchType === "in"
        ? "A punch-in request for this day is already waiting for approval."
        : "A punch-out request for this day is already waiting for approval.",
    );
  }

  const workDate = String(summary.work_date).slice(0, 10);
  const punchAt = `${workDate}T${args.punchTime}:00+03:00`;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("attendance_corrections")
    .insert({
      location_id: summary.location_id,
      staff_id: staff.id,
      work_date: workDate,
      summary_id: summary.id,
      kind: "add_punch",
      original_value: {
        actual_in: summary.actual_in,
        actual_out: summary.actual_out,
        missed_punch: true,
      },
      new_value: {
        punch_at: punchAt,
        punch_type: args.punchType,
        missed_punch_request: true,
      },
      reason: args.reason.trim().length >= 3 ? args.reason.trim() : "Missed punch request",
      requested_by: args.userId,
      status: "pending",
      current_step_role: "manager",
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  const { data: stepRows, error: stepErr } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .insert(
      missedPunchApprovalSteps().map((step) => ({
        correction_id: created.id,
        step_order: step.stepOrder,
        step_role: step.stepRole,
        status: "pending",
      })),
    )
    .select("id, step_role");
  if (stepErr) throw stepErr;

  const directory = await loadMissedPunchDirectory([staff.id]);
  const managers = lineManagerUserIds(directory, summary.location_id as string, staff.id).filter(
    (id) => id !== args.userId,
  );
  const managerStepId = stepRows?.find((step) => step.step_role === "manager")?.id ?? created.id;
  const managerTitle = "Missed punch request";
  const managerBody = `${staff.full_name} submitted a missed punch for ${workDate}. It is waiting for the site supervisor.`;
  await notifyApprovers({
    userIds: managers,
    locationId: summary.location_id as string,
    title: managerTitle,
    body: managerBody,
    sourceId: managerStepId,
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
  return { id: created.id as string, approverCount: managers.length, locationId: summary.location_id as string };
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

/** Write this request's stored punch once. A later step must not insert it again. */
async function writeCorrectionPunch(row: CorrectionRow) {
  if (String(row.kind) !== "add_punch") return;
  const punchAt = punchAtFromCorrectionValue(row.new_value);
  if (!punchAt) return;
  const correctionId = String(row.id);
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("attendance_logs")
    .select("id")
    .eq("source", "correction")
    .filter("raw_payload->>correction_id", "eq", correctionId)
    .limit(1);
  if (findErr) throw findErr;
  if (!existing?.length) {
    const { error } = await supabaseAdmin.from("attendance_logs").insert({
      location_id: row.location_id,
      staff_id: row.staff_id ?? null,
      punch_at: punchAt,
      punch_type: punchTypeOf(row.new_value) ?? "in",
      source: "correction",
      attendance_date: row.work_date ? String(row.work_date).slice(0, 10) : punchAt.slice(0, 10),
      raw_payload: { correction_id: correctionId, reason: row.reason },
    });
    if (error) throw error;
  }
  await recalculateCorrectionDay(row);
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

export async function reviewMissedPunchChain(args: {
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

  const directory = await loadMissedPunchDirectory(row.staff_id ? [row.staff_id] : []);
  if (!canUserActOnCorrection(directory, args.userId, toView(row))) {
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
      sourceId: pending?.id ?? row.id,
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
      sourceId: pending?.id ?? row.id,
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
  if (String(row.kind) === "add_punch") {
    try {
      await writeCorrectionPunch(row);
    } catch (applyError) {
      console.warn("[missed-punch] apply punch failed", applyError instanceof Error ? applyError.message : applyError);
    }
  }

  const nextIds = approverUserIdsForStep(directory, next, String(row.location_id), row.staff_id).filter(
    (id) => id !== row.requested_by && id !== args.userId,
  );
  const nextStep = (steps ?? []).find((item) => item.step_role === next);
  const { data: person } = row.staff_id
    ? await supabaseAdmin.from("staff").select("full_name").eq("id", row.staff_id).maybeSingle()
    : { data: null };
  const who = (person?.full_name as string | null) ?? "Staff";
  const when = row.work_date ? ` on ${String(row.work_date).slice(0, 10)}` : "";
  const nextTitle = next === "ops" ? "Missed punch waiting for Head of Operations" : "Missed punch waiting for HR";
  const nextBody =
    next === "ops"
      ? `${who}'s missed punch${when} was approved by the site supervisor.`
      : `${who}'s missed punch${when} was approved by Head of Operations.`;
  await notifyApprovers({
    userIds: nextIds,
    locationId: String(row.location_id),
    title: nextTitle,
    body: nextBody,
    sourceId: nextStep?.id ?? row.id,
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

/** Employee edits a change-required request and sends that same id back to the site supervisor. */
export async function resubmitMissedPunchRequest(args: {
  userId: string;
  correctionId: string;
  punchTime: string;
  reason: string;
}): Promise<{ id: string; approverCount: number; locationId: string }> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.punchTime)) throw new Error("Enter a punch time.");
  const { data, error } = await supabaseAdmin
    .from("attendance_corrections")
    .select("*")
    .eq("id", args.correctionId)
    .maybeSingle();
  if (error) throw error;
  const row = data as CorrectionRow | null;
  if (!row) throw new Error("Correction not found.");
  if (String(row.requested_by) !== args.userId) {
    throw new ForbiddenError("You can only update your own punch request.");
  }
  if (row.status !== "change_required") {
    throw new Error("This request is not waiting for a change.");
  }
  const ids = correctionIdsForReview([{ id: String(row.id) }], args.correctionId);
  if (ids.length !== 1) throw new Error("This update is not scoped to one request.");

  const workDate = row.work_date ? String(row.work_date).slice(0, 10) : "";
  if (!workDate) throw new Error("This request has no work date.");
  const punchType = punchTypeOf(row.new_value) ?? "in";
  const punchAt = `${workDate}T${args.punchTime}:00+03:00`;
  const previous = (row.new_value ?? {}) as Record<string, unknown>;
  const reason = args.reason.trim().length >= 3 ? args.reason.trim() : "Missed punch request";
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("attendance_corrections")
    .update({
      status: "pending",
      current_step_role: "manager",
      reason,
      new_value: {
        ...previous,
        punch_at: punchAt,
        punch_type: punchType,
        missed_punch_request: true,
      },
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", args.correctionId)
    .eq("status", "change_required")
    .eq("requested_by", args.userId)
    .select("id");
  if (updateErr) throw updateErr;
  if (!updated || updated.length !== 1) throw new Error("This request was already sent again.");

  const { error: stepErr } = await supabaseAdmin
    .from("attendance_correction_approvals")
    .update({ status: "pending", acted_by: null, acted_at: null, comments: null })
    .eq("correction_id", args.correctionId);
  if (stepErr && !/does not exist|schema cache|relation/i.test(stepErr.message)) throw stepErr;

  const { data: staff } = row.staff_id
    ? await supabaseAdmin.from("staff").select("id, full_name").eq("id", row.staff_id).maybeSingle()
    : { data: null };
  const directory = await loadMissedPunchDirectory(row.staff_id ? [row.staff_id] : []);
  const managers = lineManagerUserIds(directory, String(row.location_id), row.staff_id).filter((id) => id !== args.userId);
  const who = (staff?.full_name as string | null) ?? "Staff";
  const managerTitle = "Missed punch request";
  const managerBody = `${who} updated a missed punch for ${workDate}. It is waiting for the site supervisor.`;
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
  return { id: args.correctionId, approverCount: managers.length, locationId: String(row.location_id) };
}
