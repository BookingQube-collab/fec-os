"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadManagerTeamStaffIds,
  loadSupervisorOtTeamStaffIds,
} from "@/lib/reporting-manager-access.server";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { canUserDo } from "@/lib/rbac";
import { isFnbManager } from "@/lib/arcade/access";
import {
  canActOnOpsApprovalStep,
  opsApprovalLaneForStaff,
  type OpsApprovalLane,
} from "@/lib/approval-ops-routing";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";
import {
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
} from "@/lib/attendance-hr/missed-punch-approval";
import {
  listPunchCorrectionSubjects,
  loadMissedPunchDirectory,
} from "@/lib/attendance-hr/missed-punch-approval.server";
import {
  assertLeaveTransition,
  countLeaveDays,
  leaveApprovalStepsForRequester,
  leaveOpeningStepRole,
  leaveStepSeatLabel,
  dedupeLeaveApprovalRows,
  leaveTeamSubmitOpening,
  shouldFinalizeLeaveOnApprove,
  HR_COMPASSIONATE_SCOPES,
  HR_EMERGENCY_TREATMENTS,
  HR_LEAVE_STATUSES,
  HR_LEAVE_TYPES,
  type HrLeaveActor,
  type HrLeaveApprovalRole,
  type HrLeaveStatus,
} from "@/lib/hr-leave";
import { STAFF_SIGNATURES_BUCKET } from "@/lib/digital-signature";
import {
  isLeaveOpsStepActor,
  isLeaveSiteStepActor,
  leaveApproverUserIdsForStep,
  leaveSubjectSeatSkips,
  leaveTeamSubmitSkips,
  resolveLeaveSupervisorRoute,
} from "@/lib/hr-leave-routing";
import { canApproveLeaveOnMyDay } from "@/lib/hr/my-day-approvals";
import { findUsersWithCapability } from "@/lib/notifications/action-notify";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  canUseCompOff,
  DEFAULT_ANNUAL_ALLOTMENT,
  DEFAULT_SICK_ALLOTMENT,
  detectLeaveConflicts,
  enumerateLeaveDates,
  hasAckRequiredLeaveConflicts,
  hasHardLeaveOverlap,
  mapHrLeaveTypeToAttendance,
  resolveStaffAnnualEntitlement,
  summarizeLeaveBalances,
  sumUsedLeaveDays,
} from "@/lib/hr-advanced";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { evaluateHoLeavePlannerForStaff } from "@/lib/hr-leave-planner.functions";
import {
  addCalendarDays,
  annualTierDaysFromPolicy,
  detectAnnualLeaveSandwich,
  sickAnnualFollowOnApprovalSteps,
  splitSickToAnnual,
  type WeeklyOffLookup,
} from "@/lib/hr-leave-policy";
import { policyNumber } from "@/lib/hr-policy";
import { readLeaveAllotmentDefaults, readPolicySection } from "@/lib/hr-policy-read";
import { validateBase64Size, validateUploadMime } from "@/lib/server/upload-validation";

async function myStaff(context: AuthContext) {
  const linked = await loadLinkedStaffRecord(context.userId);
  if (!linked?.id) return null;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id, hire_date")
    .eq("id", linked.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Team for manager-step leave. Venue / Site supervisors use the same org-chart
 * ∪ managed-venue fallback as supervisor OT so Ashfaq sees crew under Team Leads.
 */
async function loadLeaveManagerTeamStaffIds(userId: string): Promise<{
  staffId: string | null;
  teamStaffIds: string[];
}> {
  const linked = await loadLinkedStaffRecord(userId);
  if (linked?.id && isSiteSupervisorTitle(linked.jobTitle, linked.staffRole)) {
    return loadSupervisorOtTeamStaffIds(userId);
  }
  return loadManagerTeamStaffIds(userId);
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

async function nextLeaveRequestNumber(context: AuthContext): Promise<string> {
  const { data, error } = await context.supabase.rpc("generate_leave_request_number");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `LV-${day}-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function mapLeaveDocument(row: Record<string, unknown>) {
  const linked = row.document ?? row.hr_employee_documents;
  const doc = Array.isArray(linked) ? linked[0] : linked;
  if (!doc || typeof doc !== "object") {
    const documentId = (row.document_id as string | null) ?? null;
    return {
      documentId,
      documentFileName: null as string | null,
    };
  }
  const record = doc as { id?: string; file_name?: string | null };
  return {
    documentId: record.id ? String(record.id) : ((row.document_id as string | null) ?? null),
    documentFileName: (record.file_name as string | null) ?? null,
  };
}

type LeaveApprovalStepMapped = {
  stepRole: string;
  status: string;
  actedBy: string | null;
  actedByName: string | null;
  actedAt: string | null;
  /** Signed URL for opt-in auto-apply digital signature when available. */
  actedBySignatureUrl: string | null;
};

/** Opt-in auto-apply signature storage paths by profile id. */
async function leaveSignaturePathByUserId(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, signature_url, signature_auto_apply")
    .in("id", ids);
  if (error) {
    console.warn("[hr-leave] signature lookup failed", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const auto = Boolean((row as { signature_auto_apply?: boolean | null }).signature_auto_apply);
    const path = (row as { signature_url?: string | null }).signature_url?.trim() || null;
    if (auto && path) map.set(String(row.id), path);
  }
  return map;
}

async function leaveSignedSignatureUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  const signed = new Map<string, string>();
  if (!unique.length) return signed;
  const { data, error } = await supabaseAdmin.storage
    .from(STAFF_SIGNATURES_BUCKET)
    .createSignedUrls(unique, 3600);
  if (error) {
    console.warn("[hr-leave] signature sign failed", error.message);
    return signed;
  }
  for (let i = 0; i < unique.length; i += 1) {
    const url = data?.[i]?.signedUrl?.trim();
    if (url) signed.set(unique[i]!, url);
  }
  return signed;
}

function mapLeaveRow(
  row: Record<string, unknown>,
  extras?: { steps?: LeaveApprovalStepMapped[] },
) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  const jobTitle = (staff as { job_title?: string | null } | null)?.job_title ?? null;
  const department = (staff as { department?: string | null } | null)?.department ?? null;
  const locationId =
    (staff as { location_id?: string | null } | null)?.location_id ??
    (row.location_id as string | null) ??
    "";
  const opsLane: OpsApprovalLane = opsApprovalLaneForStaff(jobTitle, department);
  const document = mapLeaveDocument(row);
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    jobTitle,
    department,
    locationId: locationId ? String(locationId) : "",
    phone: (staff as { phone?: string | null } | null)?.phone ?? null,
    opsLane,
    leaveType: String(row.leave_type),
    dateFrom: String(row.date_from).slice(0, 10),
    dateTo: String(row.date_to).slice(0, 10),
    days: Number(row.days ?? 1),
    reason: (row.reason as string | null) ?? null,
    status: String(row.status) as HrLeaveStatus,
    reviewNote: (row.review_note as string | null) ?? null,
    currentStepRole: (row.current_step_role as string | null) ?? null,
    payrollImpact: Boolean(row.payroll_impact),
    emergencyTreatment: (row.emergency_treatment as string | null) ?? null,
    compassionateScope: (row.compassionate_scope as string | null) ?? null,
    requestNumber: (row.request_number as string | null) ?? null,
    plannerOverride: Boolean(row.planner_override),
    plannerOverrideReasons: Array.isArray(row.planner_override_reasons)
      ? (row.planner_override_reasons as unknown[]).map((r) => String(r))
      : [],
    documentId: document.documentId,
    documentFileName: document.documentFileName,
    createdAt: String(row.created_at),
    steps: extras?.steps ?? ([] as LeaveApprovalStepMapped[]),
  };
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

/** Attach approval-step trail (actor names + digital signature URLs) for history/print. */
async function attachLeaveApprovalSteps<
  T extends { id: string; steps?: LeaveApprovalStepMapped[] },
>(rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const leaveIds = rows.map((row) => row.id);
  const { data: stepRows, error } = await supabaseAdmin
    .from("hr_leave_approvals")
    .select("leave_id, step_order, step_role, status, acted_by, acted_at")
    .in("leave_id", leaveIds)
    .order("step_order");
  if (error) {
    if (tableMissing(error.message)) return rows;
    throw error;
  }
  const actorIds = (stepRows ?? [])
    .map((step) => step.acted_by)
    .filter((id): id is string => Boolean(id));
  const [actorNames, signaturePaths] = await Promise.all([
    nameByUserId(actorIds),
    leaveSignaturePathByUserId(actorIds),
  ]);
  const signedUrls = await leaveSignedSignatureUrls([...signaturePaths.values()]);
  const byLeave = new Map<string, LeaveApprovalStepMapped[]>();
  for (const step of stepRows ?? []) {
    const leaveId = String(step.leave_id);
    const actedBy = step.acted_by ? String(step.acted_by) : null;
    const path = actedBy ? signaturePaths.get(actedBy) ?? null : null;
    const list = byLeave.get(leaveId) ?? [];
    list.push({
      stepRole: String(step.step_role),
      status: String(step.status),
      actedBy,
      actedByName: actedBy ? actorNames.get(actedBy) ?? null : null,
      actedAt: step.acted_at ? String(step.acted_at) : null,
      actedBySignatureUrl: path ? signedUrls.get(path) ?? null : null,
    });
    byLeave.set(leaveId, list);
  }
  return rows.map((row) => ({
    ...row,
    steps: byLeave.get(row.id) ?? [],
  }));
}

async function syncApprovedLeaveToAttendance(
  context: AuthContext,
  leave: {
    id: string;
    staffId: string;
    locationId: string | null;
    leaveType: string;
    dateFrom: string;
    dateTo: string;
  },
): Promise<{ syncedDays: number; skipped: boolean }> {
  // Admin after seat auth — title-based HoO / Sr. Site lack role_level ≥ 55 and attendance write RLS.
  const db = supabaseAdmin;
  let locationId = leave.locationId;
  if (!locationId) {
    const { data: staffRow } = await db
      .from("staff")
      .select("location_id")
      .eq("id", leave.staffId)
      .maybeSingle();
    locationId = (staffRow as { location_id?: string | null } | null)?.location_id ?? null;
  }
  if (!locationId) {
    const { data: rosterRow } = await db
      .from("attendance_roster_assignments")
      .select("location_id")
      .eq("staff_id", leave.staffId)
      .gte("work_date", leave.dateFrom.slice(0, 10))
      .lte("work_date", leave.dateTo.slice(0, 10))
      .limit(1)
      .maybeSingle();
    locationId = (rosterRow as { location_id?: string | null } | null)?.location_id ?? null;
  }
  if (!locationId) return { syncedDays: 0, skipped: true };
  const dates = enumerateLeaveDates(leave.dateFrom, leave.dateTo);
  if (dates.length === 0) return { syncedDays: 0, skipped: true };
  const attendanceType = mapHrLeaveTypeToAttendance(leave.leaveType);
  // Monthly roster paints annual_leave / sick_leave / comp_off only (not unpaid).
  const resolvedRosterLeave: "annual_leave" | "sick_leave" | "comp_off" | null =
    leave.leaveType === "sick"
      ? "sick_leave"
      : leave.leaveType === "comp_off"
        ? "comp_off"
        : attendanceType === "annual_leave"
          ? "annual_leave"
          : null;
  const rows = dates.map((leave_date) => ({
    location_id: locationId as string,
    staff_id: leave.staffId,
    leave_date,
    leave_type: attendanceType,
    source: "hr_leave",
    notes: `hr_leave:${leave.id}`,
    hr_leave_request_id: leave.id,
    created_by: context.userId,
  }));
  const { error } = await db.from("attendance_leave_records").upsert(rows, { onConflict: "staff_id,leave_date" });
  if (error) {
    if (/hr_leave_request_id|schema cache/i.test(error.message)) {
      const fallback = rows.map(({ hr_leave_request_id: _id, ...rest }) => rest);
      const { error: retryErr } = await db
        .from("attendance_leave_records")
        .upsert(fallback, { onConflict: "staff_id,leave_date" });
      if (retryErr) throw retryErr;
    } else {
      throw error;
    }
  }

  // Monthly roster reads leave via attendance_leave_records overlay on assignment rows.
  // Ensure each leave day has a roster cell (and clear shift times so the grid shows AL/SL).
  // Only touch dates inside the leave span — never clear legitimate adjacent weekly OFF
  // (prefix/suffix OFF outside date_from..date_to stay OFF).
  if (resolvedRosterLeave) {
    const { data: existingAssignments, error: assignErr } = await db
      .from("attendance_roster_assignments")
      .select("id, work_date, location_id")
      .eq("staff_id", leave.staffId)
      .gte("work_date", leave.dateFrom.slice(0, 10))
      .lte("work_date", leave.dateTo.slice(0, 10));
    if (assignErr && !tableMissing(assignErr.message)) throw assignErr;
    const byDate = new Map<string, Array<{ id: string; location_id: string }>>();
    for (const row of existingAssignments ?? []) {
      const day = String(row.work_date).slice(0, 10);
      const list = byDate.get(day) ?? [];
      list.push({ id: String(row.id), location_id: String(row.location_id) });
      byDate.set(day, list);
    }
    for (const leaveDate of dates) {
      const dayRows = byDate.get(leaveDate) ?? [];
      if (dayRows.length > 0) {
        const { error: clearErr } = await db
          .from("attendance_roster_assignments")
          .update({
            is_week_off: false,
            shift_template_id: null,
            shift_start: null,
            shift_end: null,
          })
          .in(
            "id",
            dayRows.map((r) => r.id),
          );
        if (clearErr && !tableMissing(clearErr.message)) throw clearErr;
      } else {
        const { error: insErr } = await db.from("attendance_roster_assignments").insert({
          location_id: locationId,
          staff_id: leave.staffId,
          work_date: leaveDate,
          is_week_off: false,
          shift_template_id: null,
          shift_start: null,
          shift_end: null,
          source: "hr_leave",
          created_by: context.userId,
        });
        if (insErr && !tableMissing(insErr.message) && !/duplicate|unique/i.test(insErr.message)) {
          throw insErr;
        }
      }
    }
  }

  try {
    await recalculateAttendanceRange(db, locationId, leave.dateFrom.slice(0, 10), leave.dateTo.slice(0, 10), {
      staffIds: [leave.staffId],
    });
  } catch {
    // Leave rows are still stored; recalc can be run later from Attendance.
  }
  return { syncedDays: dates.length, skipped: false };
}

async function loadLeaveConflicts(
  context: AuthContext,
  staffId: string,
  dateFrom: string,
  dateTo: string,
  excludeId?: string,
) {
  // Admin for leave overlap — team submitters (role_level < 55) cannot SELECT other
  // staff leave via RLS, which previously missed pending rows and allowed retry dupes.
  const db = supabaseAdmin;
  void context;
  // Roster assignment is not checked: leave on a rostered day is expected (leave replaces the shift).
  const [attendanceRes, leaveRes, holidayRes, staffLoc] = await Promise.all([
    db
      .from("attendance_daily_summary")
      .select("work_date, status")
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .in("status", ["present", "late", "overtime", "early_leave", "early_departure"])
      .limit(100),
    db
      .from("hr_leave_requests")
      .select("id, date_from, date_to, status")
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .neq("status", "rejected")
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(50),
    db
      .from("attendance_holidays")
      .select("holiday_date, location_id")
      .gte("holiday_date", dateFrom)
      .lte("holiday_date", dateTo)
      .limit(100),
    db.from("staff").select("location_id").eq("id", staffId).maybeSingle(),
  ]);

  const locationId = (staffLoc.data as { location_id?: string } | null)?.location_id ?? null;
  const holidayDates = (holidayRes.data ?? [])
    .filter((h) => !h.location_id || h.location_id === locationId)
    .map((h) => String(h.holiday_date));

  return detectLeaveConflicts({
    dateFrom,
    dateTo,
    attendancePresentDates: (attendanceRes.data ?? []).map((r) => String(r.work_date)),
    holidayDates,
    overlappingLeave: (leaveRes.data ?? [])
      .filter((r) => !excludeId || String(r.id) !== excludeId)
      .map((r) => ({
        dateFrom: String(r.date_from).slice(0, 10),
        dateTo: String(r.date_to).slice(0, 10),
        status: String(r.status),
      })),
  });
}

async function seedLeaveApprovalSteps(
  leaveId: string,
  opts?: {
    skipManagerSeat?: boolean;
    skipSiteSeat?: boolean;
    openingStep?: HrLeaveApprovalRole | null;
    /** Sick→annual follow-on: HR then GM (no manager/site/ops seats). */
    approvalProfile?: "default" | "hr_then_gm";
  },
) {
  const profile = opts?.approvalProfile ?? "default";
  const steps =
    profile === "hr_then_gm"
      ? sickAnnualFollowOnApprovalSteps().map((s) => ({
          leave_id: leaveId,
          step_order: s.stepOrder,
          step_role: s.stepRole,
          status: s.status,
        }))
      : leaveApprovalStepsForRequester({
          skipManagerSeat: Boolean(opts?.skipManagerSeat),
          skipSiteSeat: Boolean(opts?.skipSiteSeat),
        }).map((s) => ({
          leave_id: leaveId,
          step_order: s.stepOrder,
          step_role: s.stepRole,
          status: s.status,
        }));
  // Caller already authenticated + capability-checked. Seed via service role — RLS write
  // on hr_leave_approvals is role_level >= 55 only (same pattern as missed-punch step seed).
  const { error } = await supabaseAdmin.from("hr_leave_approvals").insert(steps);
  if (error && !tableMissing(error.message)) throw error;
  const opening =
    opts?.openingStep === null
      ? null
      : profile === "hr_then_gm"
        ? ("hr" as HrLeaveApprovalRole)
        : (opts?.openingStep ??
          leaveOpeningStepRole(Boolean(opts?.skipManagerSeat), Boolean(opts?.skipSiteSeat)));
  await supabaseAdmin
    .from("hr_leave_requests")
    .update({ current_step_role: opening, updated_at: new Date().toISOString() })
    .eq("id", leaveId);
}

/** Roster OFF + standing weekly_off_weekday for sandwich checks (±14d around leave). */
async function loadWeeklyOffLookupForLeave(
  staffId: string,
  dateFrom: string,
  dateTo: string,
  weeklyOffWeekday: number | null | undefined,
): Promise<WeeklyOffLookup> {
  const from = addCalendarDays(dateFrom.slice(0, 10), -14);
  const to = addCalendarDays(dateTo.slice(0, 10), 14);
  const { data: rows, error } = await supabaseAdmin
    .from("attendance_roster_assignments")
    .select("work_date, is_week_off")
    .eq("staff_id", staffId)
    .gte("work_date", from)
    .lte("work_date", to);
  if (error && !tableMissing(error.message)) throw error;
  const rosterOffDates = new Set<string>();
  const rosterPublishedDates = new Set<string>();
  for (const row of rows ?? []) {
    const day = String(row.work_date).slice(0, 10);
    rosterPublishedDates.add(day);
    if (row.is_week_off) rosterOffDates.add(day);
  }
  return {
    rosterOffDates,
    rosterPublishedDates,
    weeklyOffWeekday: weeklyOffWeekday ?? null,
  };
}

async function remainingSickDaysForStaff(
  context: AuthContext,
  staffId: string,
  year: number,
  sickAllotment: number,
): Promise<number> {
  const { data: allotment } = await context.supabase
    .from("hr_leave_balances")
    .select("allotted_days, carried_forward, expired_days, pending_days")
    .eq("staff_id", staffId)
    .eq("period_year", year)
    .eq("leave_type", "sick")
    .maybeSingle();
  const allotted = allotment
    ? Number(allotment.allotted_days ?? 0)
    : sickAllotment;
  const carried = Number((allotment as { carried_forward?: number } | null)?.carried_forward ?? 0);
  const expired = Number((allotment as { expired_days?: number } | null)?.expired_days ?? 0);
  const pending = Number((allotment as { pending_days?: number } | null)?.pending_days ?? 0);

  const { data: leaveRows } = await context.supabase
    .from("hr_leave_requests")
    .select("leave_type, days, status, date_from")
    .eq("staff_id", staffId)
    .eq("status", "approved")
    .eq("leave_type", "sick");
  const used = sumUsedLeaveDays(
    (leaveRows ?? []).map((r) => ({
      leaveType: String(r.leave_type),
      days: Number(r.days ?? 0),
      status: String(r.status),
      dateFrom: String(r.date_from),
    })),
    year,
  );
  return Math.max(0, allotted + carried - expired - (used.sick ?? 0) - pending);
}

/** Annual remaining from hire_date / tier accrual (same engine as balances + HO planner). */
async function remainingAnnualDaysForStaff(
  context: AuthContext,
  staffId: string,
  year: number,
  leavePolicy: Record<string, unknown>,
): Promise<{
  remainingDays: number;
  allottedDays: number;
  usedDays: number;
  accruedDays: number;
  eligible: boolean;
  hireDate: string | null;
  tierCode: string;
  tierAnnualDays: number;
  monthlyAccrual: number;
  monthsAccrued: number;
  yearsOfService: number | null;
}> {
  const tierCfg = annualTierDaysFromPolicy(leavePolicy);
  const fromHireDate = leavePolicy.annual_from_hire_date !== false;
  const asOfRaw = new Date().toISOString().slice(0, 10);
  const asOfDate =
    asOfRaw < `${year}-01-01` ? `${year}-12-31` : asOfRaw > `${year}-12-31` ? `${year}-12-31` : asOfRaw;

  const { data: staffRow } = await context.supabase
    .from("staff")
    .select("hire_date, job_title, department, staff_role")
    .eq("id", staffId)
    .maybeSingle();
  const { data: profileExt } = await context.supabase
    .from("staff_profile_ext")
    .select("employment_category, is_management")
    .eq("staff_id", staffId)
    .maybeSingle();

  const hireDate = (staffRow as { hire_date?: string | null } | null)?.hire_date?.slice(0, 10) ?? null;
  const { tier, accrual, allottedDays } = resolveStaffAnnualEntitlement({
    hireDate,
    asOfDate,
    year,
    fromHireDate,
    jobTitle: (staffRow as { job_title?: string | null } | null)?.job_title,
    department: (staffRow as { department?: string | null } | null)?.department,
    staffRole: (staffRow as { staff_role?: string | null } | null)?.staff_role,
    employmentCategory: (profileExt as { employment_category?: string | null } | null)?.employment_category,
    isManagement: (profileExt as { is_management?: boolean | null } | null)?.is_management,
    under5yDays: tierCfg.under5yDays,
    fiveYearPlusDays: tierCfg.fiveYearPlusDays,
    managementDays: tierCfg.managementDays,
    tenureYearsThreshold: tierCfg.tenureYearsThreshold,
    titleKeywords: tierCfg.titleKeywords,
  });

  const { data: allotment } = await context.supabase
    .from("hr_leave_balances")
    .select("carried_forward, expired_days, pending_days")
    .eq("staff_id", staffId)
    .eq("period_year", year)
    .eq("leave_type", "annual")
    .maybeSingle();
  const carried = Number((allotment as { carried_forward?: number } | null)?.carried_forward ?? 0);
  const expired = Number((allotment as { expired_days?: number } | null)?.expired_days ?? 0);
  const pending = Number((allotment as { pending_days?: number } | null)?.pending_days ?? 0);

  const { data: leaveRows } = await context.supabase
    .from("hr_leave_requests")
    .select("leave_type, days, status, date_from")
    .eq("staff_id", staffId)
    .eq("status", "approved")
    .eq("leave_type", "annual");
  const usedMap = sumUsedLeaveDays(
    (leaveRows ?? []).map((r) => ({
      leaveType: String(r.leave_type),
      days: Number(r.days ?? 0),
      status: String(r.status),
      dateFrom: String(r.date_from),
    })),
    year,
  );
  const usedDays = usedMap.annual ?? 0;
  const remainingDays = Math.max(0, allottedDays + carried - expired - usedDays - pending);
  return {
    remainingDays,
    allottedDays,
    usedDays,
    accruedDays: accrual.accruedDays,
    eligible: accrual.eligible,
    hireDate,
    tierCode: tier.code,
    tierAnnualDays: tier.annualDays,
    monthlyAccrual: tier.monthlyAccrual,
    monthsAccrued: accrual.monthsAccrued,
    yearsOfService: tier.yearsOfService,
  };
}

async function mayAccessLeaveSubjectStaff(
  context: AuthContext,
  staffId: string,
): Promise<boolean> {
  const manage =
    canUserDo(context.roles ?? [], "hr.leave.manage") || canUserDo(context.roles ?? [], "hr.manage");
  if (manage) return true;
  const mine = await myStaff(context);
  if (mine?.id === staffId) return true;
  const subjects = await listPunchCorrectionSubjects(context.userId);
  return subjects.some((row) => row.staffId === staffId);
}

/** Repair orphan pending leave that was inserted before approval-step seed used admin. */
async function loadOrRepairLeaveApprovalSteps(
  leaveId: string,
  currentStepRole: string | null,
): Promise<Array<{ id: string; step_order: number; step_role: string; status: string }>> {
  const { data: steps, error } = await supabaseAdmin
    .from("hr_leave_approvals")
    .select("id, step_order, step_role, status")
    .eq("leave_id", leaveId)
    .order("step_order");
  if (error && !tableMissing(error.message)) throw error;
  if ((steps ?? []).length > 0) {
    return (steps ?? []).map((s) => ({
      id: String(s.id),
      step_order: Number(s.step_order),
      step_role: String(s.step_role),
      status: String(s.status),
    }));
  }
  if (currentStepRole === "hr" || currentStepRole === "gm") {
    await seedLeaveApprovalSteps(leaveId, {
      openingStep: currentStepRole as HrLeaveApprovalRole,
      approvalProfile: "hr_then_gm",
    });
  } else {
    const skipSiteSeat = currentStepRole === "ops";
    const skipManagerSeat = skipSiteSeat || currentStepRole === "site";
    const opening =
      currentStepRole === "manager" || currentStepRole === "site" || currentStepRole === "ops"
        ? (currentStepRole as HrLeaveApprovalRole)
        : leaveOpeningStepRole(skipManagerSeat, skipSiteSeat);
    await seedLeaveApprovalSteps(leaveId, {
      skipManagerSeat,
      skipSiteSeat,
      openingStep: opening,
    });
  }
  const { data: repaired, error: repairErr } = await supabaseAdmin
    .from("hr_leave_approvals")
    .select("id, step_order, step_role, status")
    .eq("leave_id", leaveId)
    .order("step_order");
  if (repairErr && !tableMissing(repairErr.message)) throw repairErr;
  return (repaired ?? []).map((s) => ({
    id: String(s.id),
    step_order: Number(s.step_order),
    step_role: String(s.step_role),
    status: String(s.status),
  }));
}

async function uploadLeaveSupportingDocument(
  context: AuthContext,
  input: {
    staffId: string;
    filename: string;
    dataBase64: string;
    contentType: string;
    dateFrom: string;
    dateTo: string;
  },
): Promise<string> {
  validateUploadMime(input.contentType, "document");
  validateBase64Size(input.dataBase64, 10 * 1024 * 1024);
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${input.staffId}/${Date.now()}-${safeName}`;
  const bytes = Uint8Array.from(atob(input.dataBase64), (c) => c.charCodeAt(0));
  const { error: upErr } = await supabaseAdmin.storage
    .from("hr-employee-documents")
    .upload(path, bytes, { contentType: input.contentType, upsert: false });
  if (upErr) throw upErr;
  const { data: row, error } = await supabaseAdmin
    .from("hr_employee_documents")
    .insert({
      staff_id: input.staffId,
      doc_type: "medical_certificate",
      title: "Sick leave medical certificate",
      file_path: path,
      file_name: input.filename,
      file_mime: input.contentType,
      notes: `Sick leave ${input.dateFrom} → ${input.dateTo}`,
      uploaded_by: context.userId,
      status: "pending",
      verification_status: "unverified",
    })
    .select("id")
    .single();
  if (error) throw error;
  return row.id as string;
}

async function notifyLeaveWaitingOnStep(input: {
  leaveId: string;
  staffName: string;
  dateFrom: string;
  locationId: string | null;
  requestNumber: string | null;
  stepRole: string;
  opsLane?: OpsApprovalLane | null;
  userIds: string[];
  allowRepeat?: boolean;
}) {
  if (!input.userIds.length) return;
  await dispatchHrNotify(
    {
      kind: "leave_submitted",
      staffName: input.staffName,
      workDate: input.dateFrom,
      locationId: input.locationId,
      sourceId: input.leaveId,
      requestNumber: input.requestNumber,
      waitingSeat: leaveStepSeatLabel(input.stepRole, { opsLane: input.opsLane }),
    },
    input.userIds,
    { allowRepeat: input.allowRepeat },
  );
}

/**
 * In-flight Waiting: Supervisor leaves may have notified TL / nobody before Venue
 * Supervisor routing. When the Approve list returns manager-step rows this viewer
 * can act on, ensure they have an in-app notification (no resubmit required).
 */
async function repairLeaveManagerSeatNotifyForViewer(input: {
  viewerUserId: string;
  leaves: ReadonlyArray<{
    id: string;
    staffId: string;
    staffName: string | null;
    dateFrom: string;
    locationId: string;
    requestNumber: string | null;
    currentStepRole: string | null;
    opsLane: OpsApprovalLane | null;
  }>;
}): Promise<void> {
  const managerLeaves = input.leaves.filter((row) => row.currentStepRole === "manager");
  if (!managerLeaves.length) return;

  const leaveIds = managerLeaves.map((row) => row.id);
  const { data: existing, error } = await supabaseAdmin
    .from("notifications")
    .select("source_id")
    .eq("user_id", input.viewerUserId)
    .eq("source_type", "hr_leave")
    .in("source_id", leaveIds);
  if (error) {
    console.warn("[hr-leave] manager-seat notify repair lookup failed", error.message);
    return;
  }
  const already = new Set(
    (existing ?? []).map((row) => String((row as { source_id?: string | null }).source_id ?? "")),
  );
  const missing = managerLeaves.filter((row) => !already.has(row.id));
  if (!missing.length) return;

  let directory: Awaited<ReturnType<typeof loadMissedPunchDirectory>> | null = null;
  try {
    directory = await loadMissedPunchDirectory(missing.map((row) => row.staffId));
  } catch (err) {
    console.warn(
      "[hr-leave] manager-seat notify repair directory failed",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  for (const leave of missing) {
    const assignees = leaveApproverUserIdsForStep(directory, "manager", {
      locationId: leave.locationId,
      staffId: leave.staffId,
      requestedBy: "",
      requesterStaffId: leave.staffId,
    });
    if (!assignees.includes(input.viewerUserId)) continue;
    try {
      await notifyLeaveWaitingOnStep({
        leaveId: leave.id,
        staffName: leave.staffName ?? "Staff",
        dateFrom: leave.dateFrom,
        locationId: leave.locationId || null,
        requestNumber: leave.requestNumber,
        stepRole: "manager",
        opsLane: leave.opsLane,
        userIds: [input.viewerUserId],
        allowRepeat: true,
      });
    } catch (err) {
      console.warn(
        "[hr-leave] manager-seat notify repair failed",
        leave.id,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function finalizeLeaveApproval(
  context: AuthContext,
  existing: {
    id: string;
    staff_id: string;
    leave_type: string;
    date_from: string;
    date_to: string;
    request_number?: string | null;
    staff?: unknown;
  },
  reviewNote: string | null,
  payrollImpact: boolean,
): Promise<{ syncedDays: number }> {
  // HoO / F&B title holders are authorized in actOnLeaveApproval but fail RLS updates
  // (role_level < 55). Write through admin after that seat check.
  const { error } = await supabaseAdmin
    .from("hr_leave_requests")
    .update({
      status: "approved",
      review_note: reviewNote,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
      current_step_role: null,
      payroll_impact: payrollImpact,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (error) throw error;

  const staffRow = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
  const sync = await syncApprovedLeaveToAttendance(context, {
    id: String(existing.id),
    staffId: String(existing.staff_id),
    locationId: (staffRow as { location_id?: string | null } | null)?.location_id ?? null,
    leaveType: String(existing.leave_type),
    dateFrom: String(existing.date_from).slice(0, 10),
    dateTo: String(existing.date_to).slice(0, 10),
  });

  try {
    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "leave_approved",
      effectiveOn: String(existing.date_from).slice(0, 10),
      payload: {
        leave_type: existing.leave_type,
        date_from: existing.date_from,
        date_to: existing.date_to,
        payroll_impact: payrollImpact,
      },
      sourceTable: "hr_leave_requests",
      sourceId: String(existing.id),
    });
  } catch (error) {
    console.warn(
      "[hr-leave] employee event on approve failed",
      error instanceof Error ? error.message : error,
    );
  }

  const locationId = (staffRow as { location_id?: string } | null)?.location_id ?? null;
  const staffName = (staffRow as { full_name?: string } | null)?.full_name ?? "Staff";
  // Notify HR (and other leave managers) that ops finalized — always allow after step handoffs.
  const hrUserIds = await findUsersWithCapability("hr.leave.manage", locationId);
  await dispatchHrNotify(
    {
      kind: "leave_approved",
      staffName,
      workDate: String(existing.date_from).slice(0, 10),
      locationId,
      sourceId: existing.id as string,
      requestNumber: existing.request_number ?? null,
    },
    hrUserIds,
    { allowRepeat: true },
  );

  return { syncedDays: sync.syncedDays };
}

export const listLeaveTypes = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("hr_leave_types")
    .select("code, name_en, name_ar, paid, requires_doc, default_days, config, active, sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    if (tableMissing(error.message)) {
      return HR_LEAVE_TYPES.map((code, i) => ({
        code,
        nameEn: code,
        nameAr: null as string | null,
        paid: !["unpaid", "emergency", "other"].includes(code),
        requiresDoc: ["sick", "maternity", "hajj", "compassionate"].includes(code),
        defaultDays: null as number | null,
        config: {} as Record<string, unknown>,
        sortOrder: (i + 1) * 10,
      }));
    }
    throw error;
  }
  return (data ?? []).map((row) => ({
    code: String(row.code),
    nameEn: String(row.name_en),
    nameAr: (row.name_ar as string | null) ?? null,
    paid: Boolean(row.paid),
    requiresDoc: Boolean(row.requires_doc),
    defaultDays: row.default_days == null ? null : Number(row.default_days),
    config: (row.config as Record<string, unknown>) ?? {},
    sortOrder: Number(row.sort_order ?? 0),
  }));
}, { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager", "hr.employee_app"] } });

export const listLeaveRequests = createAuthenticatedAction(
  z.object({
    status: z.enum(HR_LEAVE_STATUSES).nullable().optional(),
    mineOnly: z.boolean().optional(),
    staffId: z.string().uuid().nullable().optional(),
    /** My Day: pending leave this login may approve. Own history stays on mineOnly. */
    approvals: z.boolean().optional(),
    /** My Day Approved tab: leave where this login already acted on a step. */
    approvalsHistory: z.boolean().optional(),
  }),
  async (data, context) => {
    const hrManage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const managerCap = canUserDo(context.roles ?? [], "hr.leave.approve_manager");
    const staff = await myStaff(context);

    if (data.approvalsHistory) {
      // Sr. Site Approved history: only manager/site seats (never mistaken ops/hr stamps),
      // and hide rows already handed to HoO so they live on the HoO Approve panel.
      const { data: actorStaff } = await supabaseAdmin
        .from("staff")
        .select("job_title")
        .eq("user_id", context.userId)
        .is("deleted_at", null)
        .maybeSingle();
      const historySrSite = isLeaveSiteStepActor(
        (actorStaff as { job_title?: string | null } | null)?.job_title,
      );
      let actedQuery = supabaseAdmin
        .from("hr_leave_approvals")
        .select("leave_id, acted_at, step_role")
        .eq("acted_by", context.userId)
        .eq("status", "approved")
        .order("acted_at", { ascending: false })
        .limit(120);
      if (historySrSite) {
        actedQuery = actedQuery.in("step_role", ["manager", "site"]);
      }
      const { data: acted, error: actedErr } = await actedQuery;
      if (actedErr) {
        if (tableMissing(actedErr.message)) return [];
        throw actedErr;
      }
      const leaveIds = [...new Set((acted ?? []).map((row) => String(row.leave_id)).filter(Boolean))];
      if (leaveIds.length === 0) return [];
      const { data: rows, error } = await supabaseAdmin
        .from("hr_leave_requests")
        .select(
          "id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, current_step_role, payroll_impact, emergency_treatment, compassionate_scope, request_number, planner_override, planner_override_reasons, document_id, created_at, staff(full_name, employee_code, phone, job_title, department, location_id), document:hr_employee_documents!document_id(id, file_name)",
        )
        .in("id", leaveIds)
        .neq("status", "cancelled")
        .neq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) {
        if (tableMissing(error.message) || /document_id|hr_employee_documents/i.test(error.message)) {
          const { data: fallback, error: fallbackErr } = await supabaseAdmin
            .from("hr_leave_requests")
            .select(
              "id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, current_step_role, payroll_impact, emergency_treatment, compassionate_scope, request_number, planner_override, planner_override_reasons, created_at, staff(full_name, employee_code, phone, job_title, department, location_id)",
            )
            .in("id", leaveIds)
            .neq("status", "cancelled")
            .neq("status", "rejected")
            .order("created_at", { ascending: false })
            .limit(120);
          if (fallbackErr) throw fallbackErr;
          let mappedFallback = dedupeLeaveApprovalRows(
            (fallback ?? []).map((row) => mapLeaveRow(row as Record<string, unknown>)),
          );
          if (historySrSite) {
            mappedFallback = mappedFallback.filter(
              (row) =>
                !(
                  row.status === "pending" &&
                  (row.currentStepRole === "ops" || row.currentStepRole === "hr")
                ),
            );
          }
          return attachLeaveApprovalSteps(mappedFallback);
        }
        throw error;
      }
      let mappedHistory = dedupeLeaveApprovalRows(
        (rows ?? []).map((row) => mapLeaveRow(row as Record<string, unknown>)),
      );
      if (historySrSite) {
        // Handed off to HoO / legacy HR — drop from Sr. Site Approved; HoO Approve owns them.
        mappedHistory = mappedHistory.filter(
          (row) =>
            !(
              row.status === "pending" &&
              (row.currentStepRole === "ops" || row.currentStepRole === "hr")
            ),
        );
      }
      return attachLeaveApprovalSteps(mappedHistory);
    }

    let headOfOperations = false;
    let fnbManager = false;
    let srSiteActor = false;
    let actorJobTitle: string | null = null;
    let actorDepartment: string | null = null;
    // Detect title seats even when the login also has approve_manager / leave.manage —
    // otherwise RLS (role_level < 55) hides the HoO queue, and manage would skip seat filters.
    if ((data.approvals || (!hrManage && !managerCap)) && staff?.id) {
      const { data: titled } = await context.supabase
        .from("staff")
        .select("job_title, department")
        .eq("id", staff.id)
        .maybeSingle();
      actorJobTitle = (titled as { job_title?: string | null } | null)?.job_title ?? null;
      actorDepartment = (titled as { department?: string | null } | null)?.department ?? null;
      headOfOperations = isHeadOfOperationsTitle(actorJobTitle);
      fnbManager = isFnbManager(actorJobTitle, actorDepartment);
      srSiteActor = isLeaveSiteStepActor(actorJobTitle);
    }
    const titleCompanyReview = headOfOperations || fnbManager;
    // Title seats win: Sr. Site / HoO / F&B keep company review for their seat only —
    // hr.leave.manage on those titles must not unlock every pending leave.
    const canReviewCompany =
      (hrManage && !srSiteActor && !titleCompanyReview) || titleCompanyReview || srSiteActor;
    const teamIds =
      canReviewCompany || data.mineOnly
        ? []
        : (await loadLeaveManagerTeamStaffIds(context.userId)).teamStaffIds;
    const scopedToTeam = !canReviewCompany && !data.mineOnly && teamIds.length > 0;
    const scopedToSelf =
      Boolean(data.mineOnly) ||
      (!canReviewCompany && !scopedToTeam && !(data.approvals && (srSiteActor || titleCompanyReview)));
    if (scopedToSelf && !staff?.id) return [];
    if (scopedToTeam && data.staffId && !teamIds.includes(data.staffId)) return [];
    // Reviewers of other people's leave need admin — title HoO/Sr. Site fail role_level RLS.
    const leaveDb = scopedToSelf ? context.supabase : supabaseAdmin;
    let query = leaveDb
      .from("hr_leave_requests")
      .select(
        "id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, current_step_role, payroll_impact, emergency_treatment, compassionate_scope, request_number, planner_override, planner_override_reasons, document_id, created_at, staff(full_name, employee_code, phone, job_title, department, location_id), document:hr_employee_documents!document_id(id, file_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (scopedToTeam) query = query.in("staff_id", data.staffId ? [data.staffId] : teamIds);
    else if (scopedToSelf && staff?.id) query = query.eq("staff_id", staff.id);
    else if (!scopedToSelf && data.staffId) query = query.eq("staff_id", data.staffId);
    if (data.approvals) {
      query = query.eq("status", "pending");
      // Title-based HoO / F&B only act on the ops seat (even with hr.leave.manage).
      if (titleCompanyReview) query = query.eq("current_step_role", "ops");
      // Sr. Site holds the site seat — even when login also has hr.leave.manage (branch_gm).
      else if (srSiteActor) query = query.eq("current_step_role", "site");
    } else if (data.status) query = query.eq("status", data.status);
    let { data: rows, error } = await query;
    if (error && /document_id|hr_employee_documents/i.test(error.message)) {
      // Pre-migration fallback: leave list must not break without document_id.
      let fallback = leaveDb
        .from("hr_leave_requests")
        .select(
          "id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, current_step_role, payroll_impact, emergency_treatment, compassionate_scope, request_number, planner_override, planner_override_reasons, created_at, staff(full_name, employee_code, phone, job_title, department, location_id)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (scopedToTeam) fallback = fallback.in("staff_id", data.staffId ? [data.staffId] : teamIds);
      else if (scopedToSelf && staff?.id) fallback = fallback.eq("staff_id", staff.id);
      else if (!scopedToSelf && data.staffId) fallback = fallback.eq("staff_id", data.staffId);
      if (data.approvals) {
        fallback = fallback.eq("status", "pending");
        if (titleCompanyReview) fallback = fallback.eq("current_step_role", "ops");
        else if (srSiteActor) fallback = fallback.eq("current_step_role", "site");
      } else if (data.status) fallback = fallback.eq("status", data.status);
      const retry = await fallback;
      if (retry.error) {
        if (tableMissing(retry.error.message)) return [];
        throw retry.error;
      }
      // Fallback select omits document_id / document join; mapLeaveRow tolerates missing fields.
      rows = (retry.data ?? []).map((row) => ({
        ...row,
        document_id: null,
        document: null,
      })) as typeof rows;
      error = null;
    }
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    let mapped = (rows ?? []).map((row) => mapLeaveRow(row as Record<string, unknown>));
    // Lane-scoped company review: HoO sees Operations; F&B Manager sees F&B.
    // Pure HR manage (no ops title) keeps all lanes; title seats stay lane-bound even with manage.
    if (data.approvals && (titleCompanyReview || !(hrManage && !srSiteActor))) {
      if (headOfOperations && !fnbManager) {
        mapped = mapped.filter((row) => row.opsLane === "head_of_operations");
      } else if (fnbManager && !headOfOperations) {
        mapped = mapped.filter((row) => row.opsLane === "fnb_manager");
      }
    }
    // Approve tab = actionable seats only (corrections actionableOnly). Badge uses this length.
    if (data.approvals) {
      mapped = mapped.filter((row) =>
        canApproveLeaveOnMyDay({
          roles: context.roles ?? [],
          stepRole: row.currentStepRole,
          isOwnRequest: Boolean(staff?.id && row.staffId === staff.id),
          isLineManager: teamIds.includes(row.staffId),
          jobTitle: actorJobTitle,
          department: actorDepartment,
          opsLane: row.opsLane,
        }),
      );
      // Repair: notify this Venue / line Supervisor for in-flight manager-step leaves
      // they can act on but never received (pre-routing / TL notify). Fire-and-forget.
      void repairLeaveManagerSeatNotifyForViewer({
        viewerUserId: context.userId,
        leaves: mapped,
      }).catch((err) =>
        console.warn(
          "[hr-leave] manager-seat notify repair",
          err instanceof Error ? err.message : err,
        ),
      );
    }
    // Dedupe by id; Approve tab also collapses identical pending retry rows.
    // Always attach steps so print/preview can stamp signatures after each seat approves.
    const deduped = dedupeLeaveApprovalRows(mapped, { collapsePendingExact: Boolean(data.approvals) });
    return attachLeaveApprovalSteps(deduped);
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager", "hr.employee_app"] } },
);

export const listLeaveApprovals = createAuthenticatedAction(
  z.object({ leaveId: z.string().uuid() }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("hr_leave_approvals")
      .select("id, leave_id, step_order, step_role, status, acted_by, acted_at, comments")
      .eq("leave_id", data.leaveId)
      .order("step_order");
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      leaveId: String(r.leave_id),
      stepOrder: Number(r.step_order),
      stepRole: String(r.step_role) as HrLeaveApprovalRole,
      status: String(r.status),
      actedBy: (r.acted_by as string | null) ?? null,
      actedAt: (r.acted_at as string | null) ?? null,
      comments: (r.comments as string | null) ?? null,
    }));
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager", "hr.employee_app"] } },
);

export const previewLeaveConflicts = createAuthenticatedAction(
  z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    staffId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const staffId = data.staffId ?? mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked.");
    if (!(await mayAccessLeaveSubjectStaff(context, staffId))) {
      throw new ForbiddenError("You can only preview leave for yourself or your team.");
    }
    const conflicts = await loadLeaveConflicts(context, staffId, data.dateFrom, data.dateTo);
    return {
      conflicts,
      days: countLeaveDays(data.dateFrom, data.dateTo),
      hardOverlap: hasHardLeaveOverlap(conflicts),
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);

/**
 * Employee leave-apply policy preview (same engine as submit):
 * entitlement remaining, OFF+AL+OFF sandwich, sick→annual split.
 */
export const previewLeaveApplyPolicy = createAuthenticatedAction(
  z.object({
    leaveType: z.enum(HR_LEAVE_TYPES).default("annual"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const staffId = data.staffId ?? mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked.");
    if (!(await mayAccessLeaveSubjectStaff(context, staffId))) {
      throw new ForbiddenError("You can only preview leave for yourself or your team.");
    }

    const days = countLeaveDays(data.dateFrom, data.dateTo);
    const leavePolicy = await readPolicySection(context, "leave").catch(
      () => ({} as Record<string, unknown>),
    );
    const tierCfg = annualTierDaysFromPolicy(leavePolicy);
    const year = Number(data.dateFrom.slice(0, 4)) || new Date().getFullYear();
    const annual = await remainingAnnualDaysForStaff(context, staffId, year, leavePolicy);
    const sickAllotment = policyNumber(leavePolicy.sick_days, DEFAULT_SICK_ALLOTMENT);
    const remainingSick =
      data.leaveType === "sick"
        ? await remainingSickDaysForStaff(context, staffId, year, sickAllotment)
        : null;

    let sandwich: ReturnType<typeof detectAnnualLeaveSandwich> | null = null;
    if (
      (data.leaveType === "annual" || data.leaveType === "sick") &&
      tierCfg.sandwichBlockSubmit &&
      days > 0
    ) {
      const { data: staffRow } = await context.supabase
        .from("staff")
        .select("weekly_off_weekday")
        .eq("id", staffId)
        .maybeSingle();
      const weeklyOffWeekday =
        (staffRow as { weekly_off_weekday?: number | null } | null)?.weekly_off_weekday ?? null;
      if (data.leaveType === "annual") {
        const lookup = await loadWeeklyOffLookupForLeave(
          staffId,
          data.dateFrom,
          data.dateTo,
          weeklyOffWeekday,
        );
        sandwich = detectAnnualLeaveSandwich({
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          lookup,
        });
      }
    }

    const sickSplit =
      data.leaveType === "sick" && remainingSick != null
        ? splitSickToAnnual({
            dateFrom: data.dateFrom,
            dateTo: data.dateTo,
            remainingSickDays: remainingSick,
          })
        : null;

    if (sickSplit?.requiresAnnualFollowOn && sickSplit.annualDateFrom && sickSplit.annualDateTo) {
      const { data: staffRow } = await context.supabase
        .from("staff")
        .select("weekly_off_weekday")
        .eq("id", staffId)
        .maybeSingle();
      const weeklyOffWeekday =
        (staffRow as { weekly_off_weekday?: number | null } | null)?.weekly_off_weekday ?? null;
      if (tierCfg.sandwichBlockSubmit) {
        const lookup = await loadWeeklyOffLookupForLeave(
          staffId,
          sickSplit.annualDateFrom,
          sickSplit.annualDateTo,
          weeklyOffWeekday,
        );
        sandwich = detectAnnualLeaveSandwich({
          dateFrom: sickSplit.annualDateFrom,
          dateTo: sickSplit.annualDateTo,
          lookup,
        });
      }
    }

    const annualDaysNeeded =
      data.leaveType === "annual"
        ? days
        : sickSplit?.requiresAnnualFollowOn
          ? sickSplit.annualDays
          : 0;
    const insufficientBalance =
      annualDaysNeeded > 0 && (!annual.eligible || annualDaysNeeded > annual.remainingDays);

    return {
      days,
      entitlement: annual,
      remainingSickDays: remainingSick,
      sandwichBlocked: Boolean(sandwich?.isSandwich),
      sandwichPrefixDates: sandwich?.prefixOffDates ?? [],
      sandwichSuffixDates: sandwich?.suffixOffDates ?? [],
      sickSplit,
      insufficientBalance,
      annualDaysNeeded,
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);

export const getLeaveBalanceSummary = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
    year: z.number().int().min(2020).max(2100).optional(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const requested = data.staffId ?? mine?.id;
    if (!requested) return { year: data.year ?? new Date().getFullYear(), balances: [], accrual: null };
    if (!(await mayAccessLeaveSubjectStaff(context, requested))) {
      throw new ForbiddenError("You can only view leave balances for yourself or your team.");
    }
    const staffId = requested;
    const year = data.year ?? new Date().getFullYear();

    const { data: allotments, error: balErr } = await context.supabase
      .from("hr_leave_balances")
      .select("leave_type, allotted_days, carried_forward, expired_days, pending_days")
      .eq("staff_id", staffId)
      .eq("period_year", year);
    if (balErr && !tableMissing(balErr.message)) throw balErr;

    const { data: leaveRows, error: leaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("leave_type, days, status, date_from")
      .eq("staff_id", staffId)
      .eq("status", "approved");
    if (leaveErr && !tableMissing(leaveErr.message)) throw leaveErr;

    const used = sumUsedLeaveDays(
      (leaveRows ?? []).map((r) => ({
        leaveType: String(r.leave_type),
        days: Number(r.days ?? 0),
        status: String(r.status),
        dateFrom: String(r.date_from),
      })),
      year,
    );

    let allotmentRows = (allotments ?? []).map((a) => ({
      leaveType: String(a.leave_type),
      allottedDays: Number(a.allotted_days ?? 0),
      carriedForwardDays: Number((a as { carried_forward?: number }).carried_forward ?? 0),
      expiredDays: Number((a as { expired_days?: number }).expired_days ?? 0),
      pendingDays: Number((a as { pending_days?: number }).pending_days ?? 0),
    }));

    const { data: staffRow } = await context.supabase
      .from("staff")
      .select("hire_date, job_title, department, staff_role")
      .eq("id", staffId)
      .maybeSingle();
    const { data: profileExt } = await context.supabase
      .from("staff_profile_ext")
      .select("employment_category, is_management")
      .eq("staff_id", staffId)
      .maybeSingle();
    const leavePolicy = await readPolicySection(context, "leave").catch(() => null);
    const tierCfg = leavePolicy
      ? annualTierDaysFromPolicy(leavePolicy)
      : annualTierDaysFromPolicy({});
    const asOfRaw = new Date().toISOString().slice(0, 10);
    const asOfDate =
      asOfRaw < `${year}-01-01` ? `${year}-12-31` : asOfRaw > `${year}-12-31` ? `${year}-12-31` : asOfRaw;
    const hireDate = (staffRow as { hire_date?: string | null } | null)?.hire_date ?? null;
    const fromHireDate = leavePolicy ? leavePolicy.annual_from_hire_date !== false : true;
    const { tier, accrual, allottedDays: calculatedAnnual } = resolveStaffAnnualEntitlement({
      hireDate,
      asOfDate,
      year,
      fromHireDate,
      jobTitle: (staffRow as { job_title?: string | null } | null)?.job_title,
      department: (staffRow as { department?: string | null } | null)?.department,
      staffRole: (staffRow as { staff_role?: string | null } | null)?.staff_role,
      employmentCategory: (profileExt as { employment_category?: string | null } | null)?.employment_category,
      isManagement: (profileExt as { is_management?: boolean | null } | null)?.is_management,
      under5yDays: tierCfg.under5yDays,
      fiveYearPlusDays: tierCfg.fiveYearPlusDays,
      managementDays: tierCfg.managementDays,
      tenureYearsThreshold: tierCfg.tenureYearsThreshold,
      titleKeywords: tierCfg.titleKeywords,
    });
    const sickDefault = leavePolicy
      ? policyNumber(leavePolicy.sick_days, DEFAULT_SICK_ALLOTMENT)
      : (
          await readLeaveAllotmentDefaults(context).catch(() => ({
            annual: DEFAULT_ANNUAL_ALLOTMENT,
            sick: DEFAULT_SICK_ALLOTMENT,
          }))
        ).sick;

    // Annual allotted days always come from hire_date / management tier rules.
    // Stored hr_leave_balances rows may still carry forward / expired / pending.
    const annualStored = allotmentRows.find((r) => r.leaveType === "annual");
    const sickStored = allotmentRows.find((r) => r.leaveType === "sick");
    const otherRows = allotmentRows.filter((r) => r.leaveType !== "annual" && r.leaveType !== "sick");
    allotmentRows = [
      {
        leaveType: "annual",
        allottedDays: calculatedAnnual,
        carriedForwardDays: annualStored?.carriedForwardDays ?? 0,
        expiredDays: annualStored?.expiredDays ?? 0,
        pendingDays: annualStored?.pendingDays ?? 0,
      },
      {
        leaveType: "sick",
        allottedDays: sickStored?.allottedDays ?? sickDefault,
        carriedForwardDays: sickStored?.carriedForwardDays ?? 0,
        expiredDays: sickStored?.expiredDays ?? 0,
        pendingDays: sickStored?.pendingDays ?? 0,
      },
      ...otherRows,
    ];

    return {
      year,
      balances: summarizeLeaveBalances(allotmentRows, used),
      accrual: {
        eligible: accrual.eligible,
        accruedDays: accrual.accruedDays,
        monthsAccrued: accrual.monthsAccrued,
        fullYearDays: accrual.fullYearDays,
        hireDate,
        tierCode: tier.code,
        tierAnnualDays: tier.annualDays,
        monthlyAccrual: tier.monthlyAccrual,
        yearsOfService: tier.yearsOfService,
        tierReason: tier.reason,
        calculatedAutomatically: true as const,
      },
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage", "hr.employee_app"] } },
);

export const upsertLeaveBalance = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    leaveType: z.enum(HR_LEAVE_TYPES),
    year: z.number().int().min(2020).max(2100),
    allottedDays: z.number().min(0).max(365),
    carriedForward: z.number().min(0).max(365).optional(),
    expiredDays: z.number().min(0).max(365).optional(),
    pendingDays: z.number().min(0).max(365).optional(),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("hr_leave_balances").upsert(
      {
        staff_id: data.staffId,
        leave_type: data.leaveType,
        period_year: data.year,
        allotted_days: data.allottedDays,
        carried_forward: data.carriedForward ?? 0,
        expired_days: data.expiredDays ?? 0,
        pending_days: data.pendingDays ?? 0,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id,leave_type,period_year" },
    );
    if (error) throw error;
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);

export const listLeaveSubjects = createAuthenticatedActionNoInput(
  async (context) => listPunchCorrectionSubjects(context.userId),
  { auth: { capability: "hr.employee_app" } },
);

/** Safe result envelope — avoids production React #441 digests when leave submit fails. */
export const submitLeaveRequest = createSafeAuthenticatedAction(
  z.object({
    leaveType: z.enum(HR_LEAVE_TYPES).default("annual"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional().nullable(),
    acknowledgeConflicts: z.boolean().optional(),
    emergencyTreatment: z.enum(HR_EMERGENCY_TREATMENTS).optional().nullable(),
    maternityDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    compassionateScope: z.enum(HR_COMPASSIONATE_SCOPES).optional().nullable(),
    attachAnnualBefore: z.number().min(0).max(60).optional(),
    attachAnnualAfter: z.number().min(0).max(60).optional(),
    compOffBalanceId: z.string().uuid().optional().nullable(),
    /** Target staff — omit for self. Team submit uses the correction subject directory. */
    staffId: z.string().uuid().optional().nullable(),
    /** Supporting document (medical certificate) — typically for sick leave. */
    documentId: z.string().uuid().optional().nullable(),
    /** Inline sick document upload (preferred for team submit — supervisors may lack docs.manage). */
    document: z
      .object({
        filename: z.string().min(1).max(200),
        data_base64: z.string().min(10).max(14_000_000),
        content_type: z.string().max(100),
      })
      .optional()
      .nullable(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    if (!mine) throw new ForbiddenError("Your login is not linked to a staff record.");
    const days = countLeaveDays(data.dateFrom, data.dateTo);
    if (days < 1) throw new Error("Leave end date must be on or after the start date.");

    const requestedStaffId = data.staffId ?? (mine.id as string);
    const isSelf = requestedStaffId === (mine.id as string);
    if (!isSelf) {
      const subjects = await listPunchCorrectionSubjects(context.userId);
      const allowed = subjects.some((row) => row.staffId === requestedStaffId && !row.self);
      if (!allowed) {
        throw new ForbiddenError("You can only request leave for yourself or someone on your team.");
      }
    }

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select(
        "id, full_name, employee_code, location_id, user_id, hire_date, job_title, department, staff_role, weekly_off_weekday",
      )
      .eq("id", requestedStaffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");
    // Nested helpers close over this; keep a non-null alias so TS narrowing sticks.
    const subject = staff;

    const leavePolicy = await readPolicySection(context, "leave").catch(
      () => ({} as Record<string, unknown>),
    );
    const tierCfg = annualTierDaysFromPolicy(leavePolicy);

    if (data.leaveType === "emergency") {
      const min = policyNumber(leavePolicy.emergency_min_days, 1);
      const max = policyNumber(leavePolicy.emergency_max_days, policyNumber(leavePolicy.emergency_days, 7));
      if (days < min || days > max) {
        throw new Error(`Emergency leave must be between ${min} and ${max} days.`);
      }
    }

    // Phase 5: active-warning escalation blocks casual leave (never auto-terminates).
    const { assertCasualLeaveAllowedForStaff } = await import("@/lib/hr-warnings-guards");
    await assertCasualLeaveAllowedForStaff(context, staff.id, data.leaveType);

    // HO Leave Planner: hard-block non-emergency DECLINE; emergency may override with stamp.
    const planner = await evaluateHoLeavePlannerForStaff(context, {
      staffId: String(staff.id),
      locationId: staff.location_id as string | null,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      leaveType: data.leaveType,
    });
    if (planner && planner.result === "DECLINE" && data.leaveType !== "emergency") {
      return {
        id: null as string | null,
        days,
        conflicts: [] as Awaited<ReturnType<typeof loadLeaveConflicts>>,
        requiresAck: false as const,
        blocked: true as const,
        plannerBlocked: true as const,
        sandwichBlocked: false as const,
        plannerReasons: planner.reasons,
        plannerCodes: planner.codes,
        finalized: false as const,
        openingStep: null as string | null,
      };
    }
    const plannerOverride = Boolean(planner?.wouldDecline && data.leaveType === "emergency");
    const plannerOverrideReasons = plannerOverride ? planner!.reasons : [];

    // Annual leave: block OFF+AL+OFF sandwich on submit (prefix OR suffix alone is allowed).
    // Adjacent weekly OFF outside the leave span is never cleared on approve.
    if (data.leaveType === "annual" && tierCfg.sandwichBlockSubmit) {
      const lookup = await loadWeeklyOffLookupForLeave(
        String(staff.id),
        data.dateFrom,
        data.dateTo,
        (staff as { weekly_off_weekday?: number | null }).weekly_off_weekday,
      );
      const sandwich = detectAnnualLeaveSandwich({
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        lookup,
      });
      if (sandwich.isSandwich) {
        return {
          id: null as string | null,
          days,
          conflicts: [] as Awaited<ReturnType<typeof loadLeaveConflicts>>,
          requiresAck: false as const,
          blocked: true as const,
          plannerBlocked: false as const,
          sandwichBlocked: true as const,
          sandwichPrefixDates: sandwich.prefixOffDates,
          sandwichSuffixDates: sandwich.suffixOffDates,
          insufficientBalance: false as const,
          remainingAnnualDays: null as number | null,
          plannerReasons: [] as string[],
          plannerCodes: [] as string[],
          finalized: false as const,
          openingStep: null as string | null,
        };
      }
    }

    // Annual entitlement: only allow days within accrued YTD remaining (hire_date / 21|28|30 tiers).
    if (data.leaveType === "annual") {
      const leaveYear = Number(data.dateFrom.slice(0, 4)) || new Date().getFullYear();
      const annual = await remainingAnnualDaysForStaff(
        context,
        String(staff.id),
        leaveYear,
        leavePolicy,
      );
      if (!annual.eligible || days > annual.remainingDays) {
        return {
          id: null as string | null,
          days,
          conflicts: [] as Awaited<ReturnType<typeof loadLeaveConflicts>>,
          requiresAck: false as const,
          blocked: true as const,
          plannerBlocked: false as const,
          sandwichBlocked: false as const,
          insufficientBalance: true as const,
          remainingAnnualDays: annual.remainingDays,
          plannerReasons: [] as string[],
          plannerCodes: [] as string[],
          finalized: false as const,
          openingStep: null as string | null,
        };
      }
    }

    if (data.leaveType === "comp_off") {
      if (!data.compOffBalanceId) throw new Error("Comp-off leave requires a balance row.");
      const { data: balance, error: balErr } = await context.supabase
        .from("hr_comp_off_balances")
        .select("id, staff_id, expires_on, used_days, days, hr_exception")
        .eq("id", data.compOffBalanceId)
        .maybeSingle();
      if (balErr) throw balErr;
      if (!balance || balance.staff_id !== staff.id) throw new Error("Comp-off balance not found.");
      const remaining = Number(balance.days) - Number(balance.used_days);
      if (
        !canUseCompOff({
          expiresOn: balance.expires_on as string | null,
          asOfDate: data.dateFrom,
          hrException: Boolean(balance.hr_exception),
          remainingDays: remaining,
        })
      ) {
        throw new Error("Comp-off is expired or fully used. Ask HR for an exception.");
      }
      if (days > remaining) throw new Error("Comp-off request exceeds remaining days.");
    }

    const conflicts = await loadLeaveConflicts(context, staff.id, data.dateFrom, data.dateTo);
    if (hasHardLeaveOverlap(conflicts)) {
      return {
        id: null as string | null,
        days,
        conflicts,
        requiresAck: false as const,
        blocked: true as const,
        plannerBlocked: false as const,
        sandwichBlocked: false as const,
        plannerReasons: [] as string[],
        plannerCodes: [] as string[],
        finalized: false as const,
        openingStep: null as string | null,
      };
    }
    if (hasAckRequiredLeaveConflicts(conflicts) && !data.acknowledgeConflicts) {
      return {
        id: null as string | null,
        days,
        conflicts,
        requiresAck: true as const,
        blocked: false as const,
        plannerBlocked: false as const,
        sandwichBlocked: false as const,
        plannerReasons: [] as string[],
        plannerCodes: [] as string[],
        finalized: false as const,
        openingStep: null as string | null,
      };
    }

    // Sick → annual: after contractual sick quota, excess consumes annual with medical docs + HR→GM.
    const leaveYear = Number(data.dateFrom.slice(0, 4));
    const sickAllotment = policyNumber(leavePolicy.sick_days, DEFAULT_SICK_ALLOTMENT);
    let sickSplit: ReturnType<typeof splitSickToAnnual> | null = null;
    if (data.leaveType === "sick") {
      const remainingSick = await remainingSickDaysForStaff(
        context,
        String(staff.id),
        leaveYear,
        sickAllotment,
      );
      sickSplit = splitSickToAnnual({
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        remainingSickDays: remainingSick,
      });
    }
    const needsMedicalDoc =
      data.leaveType === "sick" || Boolean(sickSplit?.requiresMedicalDocs);

    // Upload medical docs only after soft conflicts are acknowledged (avoids orphan uploads + re-upload on Submit anyway).
    let documentId: string | null = needsMedicalDoc ? (data.documentId ?? null) : null;
    if (needsMedicalDoc && data.document) {
      documentId = await uploadLeaveSupportingDocument(context, {
        staffId: String(staff.id),
        filename: data.document.filename,
        dataBase64: data.document.data_base64,
        contentType: data.document.content_type,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      });
    } else if (documentId) {
      const { data: doc, error: docErr } = await context.supabase
        .from("hr_employee_documents")
        .select("id, staff_id, deleted_at")
        .eq("id", documentId)
        .maybeSingle();
      if (docErr) throw docErr;
      if (!doc || doc.deleted_at || doc.staff_id !== staff.id) {
        throw new Error("Supporting document not found.");
      }
    }
    if (needsMedicalDoc && !documentId) {
      throw new Error(
        sickSplit?.requiresAnnualFollowOn
          ? "Medical documents are required when sick leave quota is exhausted and absence continues on annual leave."
          : "Medical / sick document is required for sick leave.",
      );
    }

    const linked = await loadLinkedStaffRecord(context.userId);
    const actorJobTitle = linked?.jobTitle ?? null;
    const actorDepartment = linked?.department ?? null;
    const opsLane = opsApprovalLaneForStaff(
      (staff as { job_title?: string | null }).job_title,
      (staff as { department?: string | null }).department,
    );

    let employeeRoute = {
      managerUserIds: [] as string[],
      siteUserIds: [] as string[],
      skipManagerSeat: false,
      openingStep: "manager" as HrLeaveApprovalRole,
    };
    let directory = await loadMissedPunchDirectory([staff.id as string, mine.id as string]).catch(
      () => null,
    );
    try {
      if (!directory) directory = await loadMissedPunchDirectory([staff.id as string]);
      employeeRoute = resolveLeaveSupervisorRoute(directory, {
        locationId: (staff.location_id as string | null) ?? "",
        staffId: staff.id as string,
        requestedBy: context.userId,
        requesterStaffId: staff.id as string,
      });
    } catch (error) {
      console.warn(
        "[hr-leave] supervisor route lookup failed",
        error instanceof Error ? error.message : error,
      );
    }

    const submitterIsOpsForTarget = canActOnOpsApprovalStep({
      manage: false,
      lane: opsLane,
      actorJobTitle,
      actorDepartment,
    });
    const teamOpening = isSelf
      ? null
      : leaveTeamSubmitOpening({
          isSrSite: isLeaveSiteStepActor(actorJobTitle),
          isOpsFinalizer: submitterIsOpsForTarget,
        });
    const teamSkips = teamOpening ? leaveTeamSubmitSkips(teamOpening) : null;
    // Supervisor / Venue Supervisor own leave → Sr. Site then HoO.
    // Sr. Site's own leave: skip Supervisor + Sr. Site → open on HoO.
    const subjectSkips = leaveSubjectSeatSkips(
      (staff as { job_title?: string | null }).job_title,
      (staff as { staff_role?: string | null }).staff_role,
    );
    const skipManagerSeat = teamSkips
      ? teamSkips.skipManagerSeat
      : Boolean(subjectSkips?.skipManagerSeat || employeeRoute.skipManagerSeat);
    const skipSiteSeat = teamSkips
      ? teamSkips.skipSiteSeat
      : Boolean(subjectSkips?.skipSiteSeat);
    const finalizeNow = teamOpening === "final";
    const openingStep: HrLeaveApprovalRole | null = finalizeNow
      ? null
      : leaveOpeningStepRole(skipManagerSeat, skipSiteSeat);

    const submitterName = String(mine.full_name ?? "").trim() || "Supervisor";
    const teamNote = !isSelf
      ? `Submitted by ${submitterName} on behalf of staff.`
      : null;
    const reason = [data.reason?.trim() || null, teamNote].filter(Boolean).join(" ") || null;

    const leaveDb = isSelf ? context.supabase : supabaseAdmin;

    type InsertLeavePart = {
      leaveType: (typeof HR_LEAVE_TYPES)[number];
      dateFrom: string;
      dateTo: string;
      partDays: number;
      approvalProfile: "default" | "hr_then_gm";
      policyMeta: Record<string, unknown>;
      reasonExtra?: string | null;
    };

    /** One leave row + approval seats. HR→GM never team-finalizes. */
    async function insertLeavePart(part: InsertLeavePart): Promise<{
      id: string;
      requestNumber: string;
      openingStep: HrLeaveApprovalRole | null;
      finalized: boolean;
      syncedDays: number;
    }> {
      const useHrGm = part.approvalProfile === "hr_then_gm";
      const partFinalize = finalizeNow && !useHrGm;
      const partOpening: HrLeaveApprovalRole | null = partFinalize
        ? null
        : useHrGm
          ? "hr"
          : openingStep;
      const requestNumber = await nextLeaveRequestNumber(context);
      const partReason = [reason, part.reasonExtra].filter(Boolean).join(" ") || null;
      const { data: inserted, error: insertErr } = await leaveDb
        .from("hr_leave_requests")
        .insert({
          staff_id: subject.id,
          leave_type: part.leaveType,
          date_from: part.dateFrom,
          date_to: part.dateTo,
          days: part.partDays,
          reason: partReason,
          status: "pending",
          created_by: context.userId,
          emergency_treatment:
            part.leaveType === "emergency" ? data.emergencyTreatment ?? "unpaid" : null,
          maternity_delivery_date:
            part.leaveType === "maternity" ? data.maternityDeliveryDate ?? null : null,
          compassionate_scope:
            part.leaveType === "compassionate" ? data.compassionateScope ?? "inside_qatar" : null,
          attach_annual_before: data.attachAnnualBefore ?? 0,
          attach_annual_after: data.attachAnnualAfter ?? 0,
          comp_off_balance_id: data.compOffBalanceId ?? null,
          document_id: documentId,
          current_step_role: partOpening,
          payroll_impact: false,
          request_number: requestNumber,
          planner_override: plannerOverride,
          planner_override_reasons: plannerOverrideReasons,
          policy_meta: part.policyMeta,
        })
        .select("id, request_number")
        .single();
      if (insertErr) {
        if (/duplicate|unique|hr_leave_requests_pending_exact/i.test(insertErr.message)) {
          throw new Error(
            "A pending leave request already exists for these dates. Open Approve / Request instead of submitting again.",
          );
        }
        // policy_meta column may be missing before migration — retry without it.
        if (/policy_meta|schema cache/i.test(insertErr.message)) {
          const { data: retryRow, error: retryErr } = await leaveDb
            .from("hr_leave_requests")
            .insert({
              staff_id: subject.id,
              leave_type: part.leaveType,
              date_from: part.dateFrom,
              date_to: part.dateTo,
              days: part.partDays,
              reason: partReason,
              status: "pending",
              created_by: context.userId,
              emergency_treatment:
                part.leaveType === "emergency" ? data.emergencyTreatment ?? "unpaid" : null,
              maternity_delivery_date:
                part.leaveType === "maternity" ? data.maternityDeliveryDate ?? null : null,
              compassionate_scope:
                part.leaveType === "compassionate" ? data.compassionateScope ?? "inside_qatar" : null,
              attach_annual_before: data.attachAnnualBefore ?? 0,
              attach_annual_after: data.attachAnnualAfter ?? 0,
              comp_off_balance_id: data.compOffBalanceId ?? null,
              document_id: documentId,
              current_step_role: partOpening,
              payroll_impact: false,
              request_number: requestNumber,
              planner_override: plannerOverride,
              planner_override_reasons: plannerOverrideReasons,
            })
            .select("id, request_number")
            .single();
          if (retryErr) throw retryErr;
          await seedLeaveApprovalSteps(retryRow.id as string, {
            skipManagerSeat,
            skipSiteSeat,
            openingStep: partOpening,
            approvalProfile: part.approvalProfile,
          });
          return {
            id: String(retryRow.id),
            requestNumber: String(retryRow.request_number ?? requestNumber),
            openingStep: partOpening,
            finalized: false,
            syncedDays: 0,
          };
        }
        throw insertErr;
      }

      await seedLeaveApprovalSteps(inserted.id as string, {
        skipManagerSeat,
        skipSiteSeat,
        openingStep: partOpening,
        approvalProfile: part.approvalProfile,
      });

      if (partFinalize) {
        await supabaseAdmin
          .from("hr_leave_approvals")
          .update({
            status: "approved",
            acted_by: context.userId,
            acted_at: new Date().toISOString(),
            comments: teamNote,
          })
          .eq("leave_id", inserted.id)
          .neq("status", "skipped");
        const synced = await finalizeLeaveApproval(
          context,
          {
            id: String(inserted.id),
            staff_id: String(subject.id),
            leave_type: part.leaveType,
            date_from: part.dateFrom,
            date_to: part.dateTo,
            request_number: (inserted.request_number as string | null) ?? requestNumber,
            staff: {
              full_name: subject.full_name,
              user_id: subject.user_id,
              location_id: subject.location_id,
            },
          },
          teamNote,
          false,
        );
        return {
          id: String(inserted.id),
          requestNumber: String(inserted.request_number ?? requestNumber),
          openingStep: null,
          finalized: true,
          syncedDays: synced.syncedDays,
        };
      }

      return {
        id: String(inserted.id),
        requestNumber: String(inserted.request_number ?? requestNumber),
        openingStep: partOpening,
        finalized: false,
        syncedDays: 0,
      };
    }

    // Auto-split sick → annual when quota exhausted (clear UX: two linked requests).
    const parts: InsertLeavePart[] = [];
    if (sickSplit?.requiresAnnualFollowOn) {
      if (sickSplit.sickDays > 0 && sickSplit.sickDateFrom && sickSplit.sickDateTo) {
        parts.push({
          leaveType: "sick",
          dateFrom: sickSplit.sickDateFrom,
          dateTo: sickSplit.sickDateTo,
          partDays: sickSplit.sickDays,
          approvalProfile: "default",
          policyMeta: {
            sick_annual_split: true,
            portion: "sick",
            remaining_sick_before: sickSplit.remainingSickBefore,
          },
          reasonExtra: "Sick portion (within annual sick quota).",
        });
      }
      if (sickSplit.annualDays > 0 && sickSplit.annualDateFrom && sickSplit.annualDateTo) {
        // Sandwich still applies to the annual follow-on block.
        if (tierCfg.sandwichBlockSubmit) {
          const lookup = await loadWeeklyOffLookupForLeave(
            String(staff.id),
            sickSplit.annualDateFrom,
            sickSplit.annualDateTo,
            (staff as { weekly_off_weekday?: number | null }).weekly_off_weekday,
          );
          const sandwich = detectAnnualLeaveSandwich({
            dateFrom: sickSplit.annualDateFrom,
            dateTo: sickSplit.annualDateTo,
            lookup,
          });
          if (sandwich.isSandwich) {
            return {
              id: null as string | null,
              days,
              conflicts,
              requiresAck: false as const,
              blocked: true as const,
              plannerBlocked: false as const,
              sandwichBlocked: true as const,
              sandwichPrefixDates: sandwich.prefixOffDates,
              sandwichSuffixDates: sandwich.suffixOffDates,
              insufficientBalance: false as const,
              remainingAnnualDays: null as number | null,
              plannerReasons: [] as string[],
              plannerCodes: [] as string[],
              finalized: false as const,
              openingStep: null as string | null,
            };
          }
        }
        const annual = await remainingAnnualDaysForStaff(
          context,
          String(staff.id),
          leaveYear,
          leavePolicy,
        );
        if (!annual.eligible || sickSplit.annualDays > annual.remainingDays) {
          return {
            id: null as string | null,
            days,
            conflicts,
            requiresAck: false as const,
            blocked: true as const,
            plannerBlocked: false as const,
            sandwichBlocked: false as const,
            insufficientBalance: true as const,
            remainingAnnualDays: annual.remainingDays,
            plannerReasons: [] as string[],
            plannerCodes: [] as string[],
            finalized: false as const,
            openingStep: null as string | null,
          };
        }
        parts.push({
          leaveType: "annual",
          dateFrom: sickSplit.annualDateFrom,
          dateTo: sickSplit.annualDateTo,
          partDays: sickSplit.annualDays,
          approvalProfile: "hr_then_gm",
          policyMeta: {
            sick_annual_split: true,
            portion: "annual_follow_on",
            remaining_sick_before: sickSplit.remainingSickBefore,
            approval_profile: "hr_then_gm",
            requires_medical_docs: true,
          },
          reasonExtra:
            "Annual follow-on after sick quota exhausted — medical docs attached; approval HR → GM.",
        });
      }
    } else {
      parts.push({
        leaveType: data.leaveType,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        partDays: days,
        approvalProfile: "default",
        policyMeta: {},
      });
    }

    const created: Array<{
      id: string;
      requestNumber: string;
      openingStep: HrLeaveApprovalRole | null;
      finalized: boolean;
      syncedDays: number;
      leaveType: string;
    }> = [];
    for (const part of parts) {
      const row = await insertLeavePart(part);
      created.push({ ...row, leaveType: part.leaveType });
    }

    // Link split siblings in policy_meta when both exist.
    if (created.length === 2) {
      const [a, b] = created;
      void Promise.resolve(
        supabaseAdmin
          .from("hr_leave_requests")
          .update({
            policy_meta: {
              sick_annual_split: true,
              portion: a.leaveType === "sick" ? "sick" : "annual_follow_on",
              linked_leave_id: b.id,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", a.id),
      ).catch(() => undefined);
      void Promise.resolve(
        supabaseAdmin
          .from("hr_leave_requests")
          .update({
            policy_meta: {
              sick_annual_split: true,
              portion: b.leaveType === "sick" ? "sick" : "annual_follow_on",
              linked_leave_id: a.id,
              approval_profile: b.leaveType === "annual" ? "hr_then_gm" : undefined,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", b.id),
      ).catch(() => undefined);
    }

    const primary = created[0];
    if (!primary) throw new Error("Leave submit produced no request.");

    // Notify opening seat for each non-finalized part.
    for (const row of created) {
      if (row.finalized || !row.openingStep) continue;
      let firstUserIds: string[] = [];
      if (directory && row.openingStep) {
        firstUserIds = leaveApproverUserIdsForStep(directory, row.openingStep, {
          locationId: (staff.location_id as string | null) ?? "",
          staffId: staff.id as string,
          requestedBy: context.userId,
          requesterStaffId: staff.id as string,
        });
      } else if (row.openingStep === "site") {
        firstUserIds = employeeRoute.siteUserIds;
      } else if (row.openingStep === "manager") {
        firstUserIds = employeeRoute.managerUserIds;
      }
      await notifyLeaveWaitingOnStep({
        leaveId: row.id,
        staffName: staff.full_name,
        dateFrom: data.dateFrom,
        locationId: staff.location_id,
        requestNumber: row.requestNumber,
        stepRole: row.openingStep,
        opsLane,
        userIds: firstUserIds,
      });
    }

    const anyFinalized = created.some((c) => c.finalized);
    const syncedDays = created.reduce((n, c) => n + c.syncedDays, 0);
    return {
      id: primary.id,
      requestNumber: primary.requestNumber,
      days,
      conflicts,
      requiresAck: false as const,
      blocked: false as const,
      plannerBlocked: false as const,
      sandwichBlocked: false as const,
      plannerReasons: [] as string[],
      plannerCodes: [] as string[],
      plannerOverride,
      finalized: anyFinalized && created.every((c) => c.finalized),
      openingStep: primary.openingStep as string | null,
      syncedDays,
      sickAnnualSplit: Boolean(sickSplit?.requiresAnnualFollowOn),
      splitRequests: created.map((c) => ({
        id: c.id,
        requestNumber: c.requestNumber,
        leaveType: c.leaveType,
        openingStep: c.openingStep,
      })),
    };
  },
  { auth: { capability: "hr.employee_app" } },
);

/** Signed URL for a leave supporting document (employee + leave approvers). */
export const getLeaveDocumentUrl = createSafeAuthenticatedAction(
  z.object({
    leaveId: z.string().uuid(),
    purpose: z.enum(["preview", "download"]).optional().default("preview"),
  }),
  async (data, context) => {
    const hrManage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const managerCap = canUserDo(context.roles ?? [], "hr.leave.approve_manager");
    const staff = await myStaff(context);
    const { data: leave, error } = await supabaseAdmin
      .from("hr_leave_requests")
      .select(
        "id, staff_id, document_id, document:hr_employee_documents!document_id(id, file_path, file_name, deleted_at)",
      )
      .eq("id", data.leaveId)
      .maybeSingle();
    if (error) throw error;
    if (!leave?.document_id) throw new Error("No document attached to this leave request.");
    const linked = (leave as { document?: unknown }).document;
    const doc = (Array.isArray(linked) ? linked[0] : linked) as
      | { id?: string; file_path?: string | null; file_name?: string | null; deleted_at?: string | null }
      | null;
    if (!doc?.file_path || doc.deleted_at) throw new Error("Document not found.");

    const isSelf = Boolean(staff?.id && staff.id === leave.staff_id);
    let allowed = hrManage || isSelf;
    if (!allowed && staff?.id) {
      const { data: actorRow } = await context.supabase
        .from("staff")
        .select("job_title, department")
        .eq("id", staff.id)
        .maybeSingle();
      const title = (actorRow as { job_title?: string | null } | null)?.job_title ?? null;
      const department = (actorRow as { department?: string | null } | null)?.department ?? null;
      const titleReviewer =
        isHeadOfOperationsTitle(title) ||
        isFnbManager(title, department) ||
        isLeaveSiteStepActor(title);
      if (titleReviewer || managerCap) {
        allowed = true;
      } else {
        const team = await loadLeaveManagerTeamStaffIds(context.userId);
        allowed = team.teamStaffIds.includes(String(leave.staff_id));
      }
    }
    if (!allowed) throw new ForbiddenError("You cannot view this leave document.");

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("hr-employee-documents")
      .createSignedUrl(doc.file_path, 600);
    if (signErr) throw signErr;
    return {
      url: signed.signedUrl,
      fileName: (doc.file_name as string | null) ?? null,
    };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager", "hr.employee_app"] } },
);

/** Safe envelope — Sr. Site / HoO approve-reject must not throw production React #441 digests. */
export const actOnLeaveApproval = createSafeAuthenticatedAction(
  z.object({
    leaveId: z.string().uuid(),
    action: z.enum(["approved", "rejected"]),
    comments: z.string().max(500).optional().nullable(),
    payrollImpact: z.boolean().optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const managerCap = canUserDo(context.roles ?? [], "hr.leave.approve_manager");
    const mine = await myStaff(context);
    const [{ data: actorRow }, teamAccess] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("job_title, department")
        .eq("user_id", context.userId)
        .is("deleted_at", null)
        .maybeSingle(),
      manage ? Promise.resolve(null) : loadLeaveManagerTeamStaffIds(context.userId),
    ]);
    const actorJobTitle = (actorRow as { job_title?: string | null } | null)?.job_title ?? null;
    const actorDepartment = (actorRow as { department?: string | null } | null)?.department ?? null;
    const srSiteActor = isLeaveSiteStepActor(actorJobTitle);
    const opsTitleActor = isLeaveOpsStepActor(actorJobTitle, actorDepartment);
    // Seat auth already checked below. Always admin — hr_leave_approvals write + leave update
    // require role_level >= 55 (Sr. Site / title HoO fail user-client RLS).
    const leaveDb = supabaseAdmin;
    const { data: existing, error: readErr } = await leaveDb
      .from("hr_leave_requests")
      .select(
        "id, staff_id, leave_type, status, date_from, date_to, current_step_role, request_number, staff(full_name, user_id, location_id, job_title, department)",
      )
      .eq("id", data.leaveId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Leave request not found.");
    if (existing.status !== "pending") throw new Error("Leave is not pending approval.");
    const requestStaffId = String(existing.staff_id);
    const inTeam = Boolean(teamAccess?.teamStaffIds.includes(requestStaffId));
    const staffRow = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
    const subjectLane = opsApprovalLaneForStaff(
      (staffRow as { job_title?: string | null } | null)?.job_title,
      (staffRow as { department?: string | null } | null)?.department,
    );
    // Title seats win: Sr. Site / HoO / F&B must not clear other seats via manage.
    // Ops titles use title+lane only (manage would unlock the wrong ops lane).
    const canActOps = canActOnOpsApprovalStep({
      manage: manage && !srSiteActor && !opsTitleActor,
      lane: subjectLane,
      actorJobTitle,
      actorDepartment,
    });

    const steps = await loadOrRepairLeaveApprovalSteps(
      data.leaveId,
      (existing.current_step_role as string | null) ?? null,
    );

    const pending = steps.find((s) => s.status === "pending");
    if (!pending) throw new Error("No pending approval step.");

    const stepRole = String(pending.step_role) as HrLeaveApprovalRole;
    const { data: ext } = await leaveDb
      .from("staff_profile_ext")
      .select("reporting_manager_staff_id")
      .eq("staff_id", existing.staff_id)
      .maybeSingle();
    const reportingManager = (ext as { reporting_manager_staff_id?: string | null } | null)
      ?.reporting_manager_staff_id;
    const lineManager = Boolean(mine?.id && (reportingManager === mine.id || inTeam));

    // Scope: team actors must own the staff; HoO/F&B/site/manage may act company-wide for their seat.
    if (
      !manage &&
      !canActOps &&
      !srSiteActor &&
      teamAccess &&
      !inTeam &&
      mine?.id !== requestStaffId
    ) {
      throw new Error("Leave request not found.");
    }

    if (stepRole === "hr") {
      // Title seats (Sr. Site / HoO / F&B) must not clear the legacy HR seat via manage.
      if (srSiteActor || opsTitleActor || !manage) {
        throw new ForbiddenError(
          srSiteActor
            ? "HR verification is not available to Sr. Site Supervisor."
            : opsTitleActor
              ? "HR verification is not available to Head of Operations or F&B Manager."
              : "HR verification requires hr.leave.manage.",
        );
      }
    }
    if (stepRole === "gm") {
      // Sick→annual follow-on terminal seat. Sr. Site / HoO titles must not clear it.
      if (srSiteActor || opsTitleActor) {
        throw new ForbiddenError("General Manager approval required for this leave path.");
      }
      const isGmRole = (context.roles ?? []).includes("branch_gm");
      const title = (actorJobTitle ?? "").toLowerCase();
      const isGmTitle =
        title.includes("general manager") || /(^|[^a-z])gm([^a-z]|$)/i.test(title);
      if (!isGmRole && !isGmTitle) {
        throw new ForbiddenError("General Manager approval required.");
      }
    }
    if (stepRole === "manager") {
      // Title seats win — Sr. Site / HoO / F&B never clear the supervisor seat (even with manage).
      if (srSiteActor) {
        throw new ForbiddenError("Supervisor approval required before Sr. Site Supervisor.");
      }
      if (opsTitleActor) {
        throw new ForbiddenError("Supervisor approval required before Head of Operations.");
      }
      if (!managerCap && !manage && !lineManager) {
        throw new ForbiddenError("Manager approval required.");
      }
    }
    if (stepRole === "site") {
      // HoO / F&B never clear Sr. Site (even with manage). Pure HR manage still may.
      if (opsTitleActor) {
        throw new ForbiddenError("Sr. Site Supervisor approval required before Head of Operations.");
      }
      if (!manage && !srSiteActor) {
        throw new ForbiddenError("Sr. Site Supervisor approval required.");
      }
    }
    // Sr. Site holds a location seat — do not block on direct-report team membership.
    if (stepRole === "ops" && !canActOps) {
      throw new ForbiddenError(
        subjectLane === "fnb_manager"
          ? "F&B Manager approval required."
          : "Head of Operations approval required.",
      );
    }

    if (data.action === "rejected") {
      const rejectActor: HrLeaveActor =
        stepRole === "hr" ||
        stepRole === "manager" ||
        stepRole === "site" ||
        stepRole === "ops" ||
        stepRole === "gm"
          ? stepRole
          : "manager";
      assertLeaveTransition("pending", "rejected", rejectActor);
      const { error: rejectStepErr } = await leaveDb
        .from("hr_leave_approvals")
        .update({
          status: "rejected",
          acted_by: context.userId,
          acted_at: new Date().toISOString(),
          comments: data.comments ?? null,
        })
        .eq("id", pending.id);
      if (rejectStepErr) throw rejectStepErr;
      const { error: rejectLeaveErr } = await leaveDb
        .from("hr_leave_requests")
        .update({
          status: "rejected",
          review_note: data.comments ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          current_step_role: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.leaveId);
      if (rejectLeaveErr) throw rejectLeaveErr;

      try {
        await appendEmployeeEvent(context, {
          staffId: String(existing.staff_id),
          eventType: "leave_rejected",
          effectiveOn: String(existing.date_from).slice(0, 10),
          payload: { leave_type: existing.leave_type, step_role: stepRole },
          sourceTable: "hr_leave_requests",
          sourceId: String(existing.id),
        });
      } catch (error) {
        console.warn(
          "[hr-leave] employee event on reject failed",
          error instanceof Error ? error.message : error,
        );
      }
      try {
        await dispatchHrNotify(
          {
            kind: "leave_rejected",
            staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
            workDate: String(existing.date_from).slice(0, 10),
            locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
            sourceId: existing.id as string,
            requestNumber: (existing.request_number as string | null) ?? null,
          },
          undefined,
          { allowRepeat: true },
        );
      } catch (error) {
        console.warn(
          "[hr-leave] reject notify failed",
          error instanceof Error ? error.message : error,
        );
      }
      return { syncedDays: 0, final: true as const };
    }

    const { error: approveStepErr } = await leaveDb
      .from("hr_leave_approvals")
      .update({
        status: "approved",
        acted_by: context.userId,
        acted_at: new Date().toISOString(),
        comments: data.comments ?? null,
      })
      .eq("id", pending.id);
    if (approveStepErr) throw approveStepErr;

    const next = steps.find(
      (s) => Number(s.step_order) > Number(pending.step_order) && s.status === "pending",
    );
    const nextRole = next ? String(next.step_role) : null;

    // Ops (HoO / F&B) is terminal on the normal ladder. GM is terminal on HR→GM.
    // Do not skip a pending GM seat after HR (sick→annual path).
    if (shouldFinalizeLeaveOnApprove(stepRole, nextRole) || (!next && manage && stepRole !== "hr")) {
      if (next && nextRole === "hr" && stepRole === "ops") {
        const { error: skipErr } = await leaveDb
          .from("hr_leave_approvals")
          .update({
            status: "skipped",
            acted_by: context.userId,
            acted_at: new Date().toISOString(),
            comments: "Skipped — ops final approval updates the roster",
          })
          .eq("id", next.id);
        if (skipErr) throw skipErr;
      }
      // Never skip GM after ops/hr — only ops→legacy hr notify seat is skipped.
      const result = await finalizeLeaveApproval(
        context,
        existing as {
          id: string;
          staff_id: string;
          leave_type: string;
          date_from: string;
          date_to: string;
          request_number?: string | null;
          staff?: unknown;
        },
        data.comments ?? null,
        Boolean(data.payrollImpact),
      );
      return { syncedDays: result.syncedDays, final: true as const };
    }

    const { error: advanceErr } = await leaveDb
      .from("hr_leave_requests")
      .update({
        current_step_role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.leaveId);
    if (advanceErr) throw advanceErr;

    // Notify the next seat (supervisor → Sr. Site → HoO).
    if (nextRole) {
      try {
        const directory = await loadMissedPunchDirectory([requestStaffId]);
        const locationId = (staffRow as { location_id?: string | null } | null)?.location_id ?? "";
        const nextUserIds = leaveApproverUserIdsForStep(directory, nextRole, {
          locationId,
          staffId: requestStaffId,
          requestedBy: context.userId,
          requesterStaffId: requestStaffId,
        });
        await notifyLeaveWaitingOnStep({
          leaveId: String(existing.id),
          staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
          dateFrom: String(existing.date_from).slice(0, 10),
          locationId: locationId || null,
          requestNumber: (existing.request_number as string | null) ?? null,
          stepRole: nextRole,
          opsLane: subjectLane,
          userIds: nextUserIds,
          allowRepeat: true,
        });
      } catch (error) {
        console.warn(
          "[hr-leave] next-step notify failed",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return { syncedDays: 0, final: false as const, nextStep: nextRole };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager", "hr.employee_app"] } },
);

export const reviewLeaveRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected", "cancelled"]),
    reviewNote: z.string().max(500).optional().nullable(),
    payrollImpact: z.boolean().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("hr_leave_requests")
      .select(
        "id, staff_id, leave_type, status, date_from, date_to, request_number, staff(full_name, user_id, location_id)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Leave request not found.");
    const from = String(existing.status) as HrLeaveStatus;
    const mine = await myStaff(context);
    const isOwner = mine?.id === existing.staff_id;
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");

    if (data.status === "cancelled") {
      const actor: HrLeaveActor = isOwner ? "employee" : "hr";
      if (actor === "employee" && !isOwner) throw new ForbiddenError("You can only cancel your own leave request.");
      if (actor === "hr" && !manage) throw new ForbiddenError("You cannot cancel this leave request.");
      assertLeaveTransition(from, "cancelled", actor);
      const { error } = await context.supabase
        .from("hr_leave_requests")
        .update({
          status: "cancelled",
          review_note: data.reviewNote ?? null,
          current_step_role: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, syncedDays: 0 };
    }

    if (!manage) throw new ForbiddenError("Final leave review requires hr.leave.manage.");
    // Sr. Site + branch_gm must not final-stamp remaining HoO / HR seats via the HR admin path.
    const { data: reviewerRow } = await supabaseAdmin
      .from("staff")
      .select("job_title")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (isLeaveSiteStepActor((reviewerRow as { job_title?: string | null } | null)?.job_title)) {
      throw new ForbiddenError(
        "Sr. Site Supervisor cannot final-approve leave for Head of Operations or HR seats.",
      );
    }
    assertLeaveTransition(from, data.status as HrLeaveStatus, "hr");

    if (data.status === "rejected") {
      await context.supabase
        .from("hr_leave_approvals")
        .update({
          status: "rejected",
          acted_by: context.userId,
          acted_at: new Date().toISOString(),
          comments: data.reviewNote ?? null,
        })
        .eq("leave_id", data.id)
        .eq("status", "pending");
      const { error } = await context.supabase
        .from("hr_leave_requests")
        .update({
          status: "rejected",
          review_note: data.reviewNote ?? null,
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          current_step_role: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw error;
      const staffRow = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
      await appendEmployeeEvent(context, {
        staffId: String(existing.staff_id),
        eventType: "leave_rejected",
        effectiveOn: String(existing.date_from).slice(0, 10),
        payload: { leave_type: existing.leave_type },
        sourceTable: "hr_leave_requests",
        sourceId: String(existing.id),
      });
      await dispatchHrNotify({
        kind: "leave_rejected",
        staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
        workDate: String(existing.date_from).slice(0, 10),
        locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
        sourceId: existing.id as string,
        requestNumber: (existing.request_number as string | null) ?? null,
      });
      return { ok: true, syncedDays: 0 };
    }

    // Final HR approve: mark remaining steps approved, sync attendance only here.
    await context.supabase
      .from("hr_leave_approvals")
      .update({
        status: "approved",
        acted_by: context.userId,
        acted_at: new Date().toISOString(),
        comments: data.reviewNote ?? null,
      })
      .eq("leave_id", data.id)
      .eq("status", "pending");

    const result = await finalizeLeaveApproval(
      context,
      existing as {
        id: string;
        staff_id: string;
        leave_type: string;
        date_from: string;
        date_to: string;
        staff?: unknown;
      },
      data.reviewNote ?? null,
      Boolean(data.payrollImpact),
    );
    return { ok: true, syncedDays: result.syncedDays };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);

export const bulkReviewLeaveRequests = createAuthenticatedAction(
  z.object({
    ids: z.array(z.string().uuid()).min(1).max(50),
    status: z.enum(["approved", "rejected"]),
    reviewNote: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    let updated = 0;
    const errors: string[] = [];
    for (const id of data.ids) {
      try {
        await reviewLeaveRequest({ id, status: data.status, reviewNote: data.reviewNote ?? null });
        updated += 1;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    return { updated, errors };
  },
  { auth: { capability: "hr.leave.manage" } },
);

/**
 * HR records leave for a staff member and immediately syncs attendance_leave_records + daily summaries.
 * Use when the employee did not submit via the app (roster/PDF leave, backfill).
 */
export const recordLeaveForStaff = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    leaveType: z.enum(HR_LEAVE_TYPES).default("annual"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional().nullable(),
    locationId: z.string().uuid().optional().nullable(),
    acknowledgeConflicts: z.boolean().optional(),
    payrollImpact: z.boolean().optional(),
  }),
  async (data, context) => {
    const days = countLeaveDays(data.dateFrom, data.dateTo);
    if (days < 1) throw new Error("Leave end date must be on or after the start date.");

    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, full_name, user_id, location_id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");

    const locationId = data.locationId ?? (staff.location_id as string | null) ?? null;
    if (!locationId) throw new Error("Staff has no home location; pick a location for leave sync.");

    const planner = await evaluateHoLeavePlannerForStaff(context, {
      staffId: String(staff.id),
      locationId: staff.location_id as string | null,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      leaveType: data.leaveType,
    });
    if (planner && planner.result === "DECLINE" && data.leaveType !== "emergency") {
      return {
        id: null as string | null,
        days,
        conflicts: [] as Awaited<ReturnType<typeof loadLeaveConflicts>>,
        requiresAck: false as const,
        blocked: true as const,
        plannerBlocked: true as const,
        plannerReasons: planner.reasons,
        syncedDays: 0,
      };
    }
    const plannerOverride = Boolean(planner?.wouldDecline && data.leaveType === "emergency");
    const plannerOverrideReasons = plannerOverride ? planner!.reasons : [];

    const conflicts = await loadLeaveConflicts(context, staff.id as string, data.dateFrom, data.dateTo);
    if (hasHardLeaveOverlap(conflicts)) {
      return {
        id: null as string | null,
        days,
        conflicts,
        requiresAck: false as const,
        blocked: true as const,
        plannerBlocked: false as const,
        plannerReasons: [] as string[],
        syncedDays: 0,
      };
    }
    if (hasAckRequiredLeaveConflicts(conflicts) && !data.acknowledgeConflicts) {
      return {
        id: null as string | null,
        days,
        conflicts,
        requiresAck: true as const,
        blocked: false as const,
        plannerBlocked: false as const,
        plannerReasons: [] as string[],
        syncedDays: 0,
      };
    }

    const requestNumber = await nextLeaveRequestNumber(context);
    const { data: row, error } = await context.supabase
      .from("hr_leave_requests")
      .insert({
        staff_id: staff.id,
        leave_type: data.leaveType,
        date_from: data.dateFrom,
        date_to: data.dateTo,
        days,
        reason: data.reason ?? "HR recorded leave",
        status: "pending",
        created_by: context.userId,
        current_step_role: "hr",
        payroll_impact: Boolean(data.payrollImpact),
        request_number: requestNumber,
        planner_override: plannerOverride,
        planner_override_reasons: plannerOverrideReasons,
      })
      .select("id, request_number")
      .single();
    if (error) throw error;

    await seedLeaveApprovalSteps(row.id as string);
    // Skip manager/ops — HR recorded leave is final immediately.
    await context.supabase
      .from("hr_leave_approvals")
      .update({
        status: "approved",
        acted_by: context.userId,
        acted_at: new Date().toISOString(),
        comments: "HR recorded leave",
      })
      .eq("leave_id", row.id);

    const result = await finalizeLeaveApproval(
      context,
      {
        id: String(row.id),
        staff_id: String(staff.id),
        leave_type: data.leaveType,
        date_from: data.dateFrom,
        date_to: data.dateTo,
        staff: { full_name: staff.full_name, user_id: staff.user_id, location_id: locationId },
      },
      data.reason ?? "HR recorded leave",
      Boolean(data.payrollImpact),
    );

    return {
      id: row.id as string,
      requestNumber: ((row.request_number as string | null) ?? requestNumber) as string,
      days,
      conflicts,
      requiresAck: false as const,
      blocked: false as const,
      syncedDays: result.syncedDays,
    };
  },
  { auth: { capability: "hr.leave.manage" } },
);

export const grantCompOff = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    earnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days: z.number().min(0.25).max(30),
    hours: z.number().min(0).max(240).optional().nullable(),
    reason: z.string().max(500).optional().nullable(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    hrException: z.boolean().optional(),
  }),
  async (data, context) => {
    const policy = await readPolicySection(context, "leave").catch(() => ({} as Record<string, unknown>));
    const expiryDays = policyNumber(policy.comp_off_expiry_days, 90);
    let expiresOn = data.expiresOn ?? null;
    if (!expiresOn) {
      const earned = Date.parse(`${data.earnedOn}T00:00:00.000Z`);
      expiresOn = new Date(earned + expiryDays * 86_400_000).toISOString().slice(0, 10);
    }
    const { data: row, error } = await context.supabase
      .from("hr_comp_off_balances")
      .insert({
        staff_id: data.staffId,
        earned_on: data.earnedOn,
        days: data.days,
        hours: data.hours ?? null,
        reason: data.reason ?? null,
        expires_on: expiresOn,
        hr_exception: Boolean(data.hrException),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string, expiresOn };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);

export const listCompOffBalances = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) return [];
    const { data: rows, error } = await context.supabase
      .from("hr_comp_off_balances")
      .select("id, staff_id, earned_on, reason, days, hours, expires_on, used_days, remaining_days, hr_exception")
      .eq("staff_id", staffId)
      .order("earned_on", { ascending: false })
      .limit(100);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      staffId: String(r.staff_id),
      earnedOn: String(r.earned_on).slice(0, 10),
      reason: (r.reason as string | null) ?? null,
      days: Number(r.days),
      hours: r.hours == null ? null : Number(r.hours),
      expiresOn: r.expires_on ? String(r.expires_on).slice(0, 10) : null,
      usedDays: Number(r.used_days ?? 0),
      remainingDays: Number((r as { remaining_days?: number }).remaining_days ?? Number(r.days) - Number(r.used_days ?? 0)),
      hrException: Boolean(r.hr_exception),
    }));
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);

export const listStaffForLeaveBalances = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code")
    .in("status", ["active", "on_leave", "serving_notice"])
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.full_name as string,
    employeeCode: (s.employee_code as string | null) ?? null,
  }));
}, {
  auth: {
    anyCapability: [
      "hr.leave.manage",
      "hr.manage",
      "hr.docs.manage",
      "hr.air_ticket.manage",
      "hr.warnings.manage",
      "hr.probation.manage",
      "hr.resignation.manage",
      "hr.termination.initiate",
      "hr.termination.approve",
      "recruitment.request",
      "payroll.view",
      "payroll.generate",
      "payroll.finance",
    ],
  },
});

export const listEmployeeTimeline = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    eventType: z.string().max(80).optional().nullable(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  async (data, context) => {
    const manage =
      canUserDo(context.roles ?? [], "hr.timeline.view") ||
      canUserDo(context.roles ?? [], "hr.leave.manage") ||
      canUserDo(context.roles ?? [], "hr.manage") ||
      canUserDo(context.roles ?? [], "people.view_roster");
    const mine = await myStaff(context);
    if (!manage && mine?.id !== data.staffId) {
      throw new ForbiddenError("You can only view your own timeline.");
    }

    let query = context.supabase
      .from("hr_employee_events")
      .select("id, staff_id, event_type, effective_on, payload, actor_id, document_id, source_table, source_id, created_at")
      .eq("staff_id", data.staffId)
      .order("effective_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 80);
    if (data.eventType) query = query.eq("event_type", data.eventType);
    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => ({
      id: String(r.id),
      staffId: String(r.staff_id),
      eventType: String(r.event_type),
      effectiveOn: String(r.effective_on).slice(0, 10),
      payload: (r.payload as Record<string, unknown>) ?? {},
      actorId: (r.actor_id as string | null) ?? null,
      documentId: (r.document_id as string | null) ?? null,
      sourceTable: (r.source_table as string | null) ?? null,
      sourceId: (r.source_id as string | null) ?? null,
      createdAt: String(r.created_at),
    }));
  },
  {
    auth: {
      anyCapability: [
        "hr.timeline.view",
        "hr.leave.manage",
        "hr.manage",
        "people.view_roster",
        "hr.employee_app",
      ],
    },
  },
);

/**
 * Phase 4 skeleton — dry-run parse of a verified leave-balance CSV.
 * Does not invent or write balances. Apply via upsertLeaveBalance after HR confirms.
 */
export const dryRunLeaveBalanceImport = createAuthenticatedAction(
  z.object({
    csvText: z.string().min(1).max(2_000_000),
  }),
  async (data) => {
    const { dryRunLeaveBalanceCsv } = await import("@/lib/hr-leave-balance-import");
    return dryRunLeaveBalanceCsv(data.csvText);
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } },
);
