import "server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  approverUserIdsForStep,
  canUserActOnCorrection,
  correctionVisibleToUser,
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
  lineManagerUserIds,
  missedPunchApprovalSteps,
  missedPunchRequestSide,
  nextMissedPunchStep,
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
  reviewNote: string | null;
  steps: Array<{
    stepRole: string;
    status: string;
    actedByName: string | null;
    actedAt: string | null;
  }>;
};

function punchTypeOf(value: Record<string, unknown> | null | undefined): "in" | "out" | null {
  const raw = value && typeof value === "object" ? value.punch_type : null;
  if (raw === "in" || raw === "out") return raw;
  return null;
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
      .select("user_id, location_id, job_title, staff_role, status")
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
  for (const staff of supervisorsRes.data ?? []) {
    const userId = (staff.user_id as string | null) ?? null;
    if (!userId) continue;
    if (isHeadOfOperationsTitle(staff.job_title as string | null)) head.add(userId);
    if (!isSiteSupervisorTitle(staff.job_title as string | null, staff.staff_role as string | null)) continue;
    const locationId = staff.location_id as string | null;
    if (!locationId) continue;
    const list = siteSupervisorUserIdsByLocationId.get(locationId) ?? [];
    list.push(userId);
    siteSupervisorUserIdsByLocationId.set(locationId, list);
  }

  const reportingManagerUserIdByStaffId = new Map<string, string>();
  const managerStaffIds = [
    ...new Set(
      (reportingRes.data ?? [])
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
    for (const row of reportingRes.data ?? []) {
      const managerId = row.reporting_manager_staff_id;
      const userId = managerId ? userByStaff.get(managerId) : undefined;
      if (managerId && userId) reportingManagerUserIdByStaffId.set(row.staff_id, userId);
    }
  }

  return {
    reportingManagerUserIdByStaffId,
    branchGmUserIdsByLocationId,
    siteSupervisorUserIdsByLocationId,
    headOfOperationsUserIds: [...head],
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
  const locations = new Set((data ?? []).flatMap((row) => (row.location_ids as string[] | null) ?? []));
  return {
    roles,
    canFinalApprove: canUserDo(roles, "attendance.approve"),
    viewAll,
    canSeeLocation: (locationId: string) => viewAll || locations.has(locationId),
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
  let query = supabaseAdmin
    .from("attendance_corrections")
    .select("id, location_id, staff_id, work_date, summary_id, kind, reason, status, requested_by, requested_at, current_step_role, review_note, new_value")
    .order("requested_at", { ascending: false })
    .limit(200);
  if (queue === "mine") query = query.eq("requested_by", args.userId);
  if (args.status) query = query.eq("status", args.status);
  if (args.locationId) query = query.eq("location_id", args.locationId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as CorrectionRow[];
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
  return visible.map((row) => mapQueueRow(row, steps, staffById, actorNames));
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
    .select("id, new_value")
    .eq("summary_id", summary.id)
    .eq("status", "pending");
  if (existingErr) throw existingErr;
  const sameSidePending = (existing ?? []).some((row) => {
    const pendingType = punchTypeOf(row.new_value as Record<string, unknown> | null);
    return pendingType === args.punchType || pendingType == null;
  });
  if (sameSidePending) {
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
  await notifyApprovers({
    userIds: managers,
    locationId: summary.location_id as string,
    title: "Missed punch request",
    body: `${staff.full_name} submitted a missed punch for ${workDate}. It is waiting for the site supervisor.`,
    sourceId: managerStepId,
  });
  return { id: created.id as string, approverCount: managers.length, locationId: summary.location_id as string };
}

export async function reviewMissedPunchChain(args: {
  userId: string;
  correctionId: string;
  decision: "approved" | "rejected";
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

  if (args.decision === "rejected") {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("attendance_corrections")
      .update({
        status: "rejected",
        current_step_role: null,
        reviewed_by: args.userId,
        reviewed_at: now,
        review_note: args.reviewNote ?? null,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("current_step_role", step)
      .select("id")
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) throw new Error("This request was already reviewed.");
    if (pending) {
      await supabaseAdmin
        .from("attendance_correction_approvals")
        .update({
          status: "rejected",
          acted_by: args.userId,
          acted_at: now,
          comments: args.reviewNote ?? null,
        })
        .eq("id", pending.id)
        .eq("status", "pending");
    }
    await notifyApprovers({
      userIds: [String(row.requested_by)],
      locationId: String(row.location_id),
      title: "Missed punch request rejected",
      body: `Your missed punch request${row.work_date ? ` for ${String(row.work_date).slice(0, 10)}` : ""} was rejected.`,
      sourceId: pending?.id ?? row.id,
    });
    return { ok: true, final: true, nextStep: null, locationId: String(row.location_id) };
  }

  const next = nextMissedPunchStep(step);
  if (!next) {
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("attendance_corrections")
      .update({
        status: "approved",
        current_step_role: null,
        reviewed_by: args.userId,
        reviewed_at: now,
        review_note: args.reviewNote ?? null,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .eq("current_step_role", step)
      .select("id")
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (!updated) throw new Error("This request was already reviewed.");
    if (pending) {
      await supabaseAdmin
        .from("attendance_correction_approvals")
        .update({
          status: "approved",
          acted_by: args.userId,
          acted_at: now,
          comments: args.reviewNote ?? null,
        })
        .eq("id", pending.id)
        .eq("status", "pending");
    }
    await args.applyFinal(row);
    await notifyApprovers({
      userIds: [String(row.requested_by)],
      locationId: String(row.location_id),
      title: "Missed punch request approved",
      body: `Your missed punch request${row.work_date ? ` for ${String(row.work_date).slice(0, 10)}` : ""} was approved.`,
      sourceId: pending?.id ?? row.id,
    });
    return { ok: true, final: true, nextStep: null, locationId: String(row.location_id) };
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("attendance_corrections")
    .update({ current_step_role: next })
    .eq("id", row.id)
    .eq("status", "pending")
    .eq("current_step_role", step)
    .select("id")
    .maybeSingle();
  if (updateErr) throw updateErr;
  if (!updated) throw new Error("This request was already reviewed.");
  if (pending) {
    await supabaseAdmin
      .from("attendance_correction_approvals")
      .update({
        status: "approved",
        acted_by: args.userId,
        acted_at: now,
        comments: args.reviewNote ?? null,
      })
      .eq("id", pending.id)
      .eq("status", "pending");
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
  await notifyApprovers({
    userIds: nextIds,
    locationId: String(row.location_id),
    title: next === "ops" ? "Missed punch waiting for Head of Operations" : "Missed punch waiting for HR",
    body:
      next === "ops"
        ? `${who}'s missed punch${when} was approved by the site supervisor.`
        : `${who}'s missed punch${when} was approved by Head of Operations.`,
    sourceId: nextStep?.id ?? row.id,
  });
  return { ok: true, final: false, nextStep: next, locationId: String(row.location_id) };
}
