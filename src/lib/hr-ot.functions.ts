"use server";

import { z } from "zod";

import { computeAttendanceOvertimeMinutes } from "@/lib/attendance-hr/overtime";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import {
  aggregateOtSummaries,
  assertCanMarkPayrollPosted,
  assertMinClaimableMinutes,
  assertOtTransition,
  canEditOtBeforeHoo,
  canRequestOtChanges,
  computeOtAmountQar,
  hourlyRateFromPay,
  HR_OT_RATE_TYPES,
  HR_OT_STATUSES,
  isOtEligible,
  isSupervisorOtContract,
  normalizeSupervisorOtDays,
  otApprovalQueueStatuses,
  otPayDaysPerMonth,
  resolveEligibleOtMinutes,
  resolveOtRateMultiplier,
  resolveStaffOtPayFromCompensation,
  resolveStaffOtPayFromSalaryHistory,
  shouldRefreshOtAmountForMissingBasic,
  supervisorOtClaimSlots,
  supervisorOtContractMessage,
  type HrOtActor,
  type HrOtRateType,
  type HrOtRounding,
  type HrOtStatus,
  type StaffOtPayParts,
} from "@/lib/hr-ot";
import { policyNumber } from "@/lib/hr-policy";
import { readPolicySection } from "@/lib/hr-policy-read";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canActorPerform } from "@/lib/arcade/access";
import {
  isHeadOfOperationsTitle,
  isSiteSupervisorTitle,
} from "@/lib/attendance-hr/missed-punch-approval";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import {
  loadOtSiteSupervisorNotifyUserIds,
  loadSupervisorOtTeamStaffIds,
} from "@/lib/reporting-manager-access.server";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

function otAccess(context: AuthContext) {
  return context.access ?? null;
}

function canOtVerify(context: AuthContext): boolean {
  return canActorPerform(context.roles ?? [], "hr.ot.verify", otAccess(context));
}

function canOtApprove(context: AuthContext): boolean {
  return canActorPerform(context.roles ?? [], "hr.ot.approve", otAccess(context));
}

function canOtSubmit(context: AuthContext): boolean {
  return canActorPerform(context.roles ?? [], "hr.ot.submit", otAccess(context));
}

/** Head of Operations title (ops step). Super-admin HOO still uses this gate for the step. */
function canOtOpsApprove(context: AuthContext): boolean {
  return isHeadOfOperationsTitle(otAccess(context)?.jobTitle ?? null);
}

async function loadOtHooNotifyUserIds(excludeUserId?: string | null): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("user_id, job_title")
    .is("deleted_at", null)
    .not("user_id", "is", null)
    .ilike("job_title", "%head of operations%");
  if (error) {
    console.warn("[ot] HOO notify lookup failed", error.message);
    return [];
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const userId = row.user_id as string | null;
    if (!userId || userId === excludeUserId) continue;
    if (isHeadOfOperationsTitle(row.job_title as string | null)) ids.add(userId);
  }
  return [...ids];
}

/**
 * Venue / Site supervisors (title-based `hr.ot.verify`, no HR approve) only see
 * and act on claims for staff in their org-chart / supervisor OT team.
 * Role-based verifiers and HR keep company-wide access.
 */
async function otSiteSupervisorTeamStaffIds(context: AuthContext): Promise<string[] | null> {
  if (canOtApprove(context) || !canOtVerify(context)) return null;
  const linked = await loadLinkedStaffRecord(context.userId);
  if (!linked || !isSiteSupervisorTitle(linked.jobTitle, linked.staffRole)) return null;
  const { teamStaffIds } = await loadSupervisorOtTeamStaffIds(context.userId);
  return teamStaffIds;
}

async function assertOtClaimInSiteSupervisorTeam(
  context: AuthContext,
  claimStaffId: string,
): Promise<void> {
  const teamIds = await otSiteSupervisorTeamStaffIds(context);
  if (!teamIds) return;
  if (!teamIds.includes(claimStaffId)) {
    throw new ForbiddenError("OT claim is outside your reporting team.");
  }
}

/** Site supervisor on the chart first; fall back to role-based hr.ot.verify. */
async function otSubmittedNotifyUserIds(input: {
  staffId: string;
  locationId: string | null;
  excludeUserId?: string | null;
}): Promise<string[]> {
  const { findUsersWithCapability } = await import("@/lib/notifications/action-notify");
  const siteIds = await loadOtSiteSupervisorNotifyUserIds(input.staffId, {
    excludeUserId: input.excludeUserId,
  });
  if (siteIds.length > 0) return siteIds;
  const roleIds = await findUsersWithCapability("hr.ot.verify", input.locationId);
  return roleIds.filter((id) => id !== input.excludeUserId);
}

async function myStaff(context: AuthContext) {
  const linked = await loadLinkedStaffRecord(context.userId);
  if (!linked?.id) return null;
  const { data, error } = await supabaseAdmin
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id, employment_type, department")
    .eq("id", linked.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function mapClaimRow(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  const loc = Array.isArray(row.locations) ? row.locations[0] : row.locations;
  return {
    id: String(row.id),
    requestBatchId: (row.request_batch_id as string | null) ?? null,
    requestNumber: (row.request_number as string | null) ?? null,
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
    phone: (staff as { phone?: string } | null)?.phone ?? null,
    jobTitle: (staff as { job_title?: string } | null)?.job_title ?? null,
    employmentType:
      (staff as { employment_type?: string } | null)?.employment_type ?? null,
    department: (staff as { department?: string } | null)?.department ?? null,
    locationId: (row.location_id as string | null) ?? null,
    locationName: (loc as { name?: string } | null)?.name ?? null,
    locationCode: (loc as { code?: string } | null)?.code ?? null,
    workDate: String(row.work_date).slice(0, 10),
    attendanceDailyId: (row.attendance_daily_id as string | null) ?? null,
    scheduledIn: (row.scheduled_in as string | null) ?? null,
    scheduledOut: (row.scheduled_out as string | null) ?? null,
    actualIn: (row.actual_in as string | null) ?? null,
    actualOut: (row.actual_out as string | null) ?? null,
    eligibleMinutes: Number(row.eligible_minutes ?? 0),
    claimedMinutes: Number(row.claimed_minutes ?? 0),
    approvedMinutes: row.approved_minutes == null ? null : Number(row.approved_minutes),
    rateType: String(row.rate_type) as HrOtRateType,
    rateMultiplier: Number(row.rate_multiplier ?? 1),
    amountQar: Number(row.amount_qar ?? 0),
    basicQarSnapshot:
      row.basic_qar_snapshot == null ? null : Number(row.basic_qar_snapshot),
    status: String(row.status) as HrOtStatus,
    evidencePath: (row.evidence_path as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? (row.notes as string | null) ?? null,
    claimSource: (row.claim_source as string | null) ?? "attendance",
    contractWorkingDays:
      row.contract_working_days == null ? null : Number(row.contract_working_days),
    submittedBy: (row.submitted_by as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

async function loadOtPolicy(context: AuthContext) {
  return readPolicySection(context, "ot");
}

async function staffEmploymentCategory(
  context: AuthContext,
  staffId: string,
  fallbackEmploymentType?: string | null,
): Promise<string | null> {
  const { data } = await context.supabase
    .from("staff_profile_ext")
    .select("employment_category")
    .eq("staff_id", staffId)
    .maybeSingle();
  const cat = (data as { employment_category?: string | null } | null)?.employment_category;
  return cat ?? fallbackEmploymentType ?? null;
}

type StaffOtPay = StaffOtPayParts;

function columnMissing(message: string): boolean {
  return /column .* does not exist|Could not find the .* column/i.test(message);
}

/**
 * Resolve OT pay from compensation basic + allowances; fall back to salary history.
 * Service role: staff_compensation RLS is salary-view only (HR/C-level). Site
 * supervisors / HOO submitting or approving OT cannot SELECT pay under their JWT —
 * same pattern as payroll staffPayBundle. Caller already passed hr.ot.* checks.
 */
async function staffPay(staffId: string): Promise<StaffOtPay> {
  let comp: Record<string, unknown> | null = null;
  {
    const first = await supabaseAdmin
      .from("staff_compensation")
      .select("basic_qar, housing_qar, transport_qar, monthly_salary_qar, daily_rate_qar")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (first.error && columnMissing(first.error.message)) {
      const legacy = await supabaseAdmin
        .from("staff_compensation")
        .select("monthly_salary_qar, daily_rate_qar")
        .eq("staff_id", staffId)
        .maybeSingle();
      comp = (legacy.data ?? null) as Record<string, unknown> | null;
    } else if (!first.error) {
      comp = (first.data ?? null) as Record<string, unknown> | null;
    }
  }
  const fromComp = resolveStaffOtPayFromCompensation(comp);
  if (fromComp) return fromComp;

  const { data: hist } = await supabaseAdmin
    .from("staff_salary_history")
    .select("basic_qar, monthly_total_qar, daily_rate_qar, allowances")
    .eq("staff_id", staffId)
    .order("effective_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return resolveStaffOtPayFromSalaryHistory(
    (hist ?? null) as {
      basic_qar?: unknown;
      monthly_total_qar?: unknown;
      daily_rate_qar?: unknown;
      allowances?: unknown;
    } | null,
  );
}

/**
 * Persist recalculated amounts for pending claims that were frozen at 0 QAR
 * because basic was missing (or invisible under salary RLS) when submitted.
 */
async function refreshPendingOtAmountsMissingBasic<T extends ReturnType<typeof mapClaimRow>>(
  claims: T[],
  policy: Record<string, unknown>,
): Promise<T[]> {
  const needs = claims.filter((c) =>
    shouldRefreshOtAmountForMissingBasic({
      amountQar: c.amountQar,
      basicQarSnapshot: c.basicQarSnapshot,
      status: c.status,
    }),
  );
  if (needs.length === 0) return claims;

  const payByStaff = new Map<string, StaffOtPay>();
  for (const staffId of new Set(needs.map((c) => c.staffId))) {
    payByStaff.set(staffId, await staffPay(staffId));
  }

  const updatedById = new Map<string, T>();
  for (const claim of needs) {
    const pay = payByStaff.get(claim.staffId);
    if (!pay) continue;
    const hasPay =
      (pay.monthlyBasicQar != null && pay.monthlyBasicQar > 0) ||
      (pay.dailyRateQar != null && pay.dailyRateQar > 0);
    if (!hasPay) continue;

    const minutes = Math.max(0, claim.approvedMinutes ?? claim.claimedMinutes);
    if (minutes <= 0) continue;
    const amountQar = amountFor(
      minutes,
      claim.rateMultiplier,
      pay,
      policy,
      claim.contractWorkingDays,
    );
    if (amountQar <= 0) continue;

    const snap = otPaySnapshot(pay, policy, claim.contractWorkingDays);
    const { error } = await supabaseAdmin
      .from("hr_ot_claims")
      .update({
        amount_qar: amountQar,
        ...snap,
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim.id)
      .eq("amount_qar", 0);
    if (error) {
      console.warn("[ot] refresh amount for missing basic failed", claim.id, error.message);
      continue;
    }
    updatedById.set(claim.id, {
      ...claim,
      amountQar,
      basicQarSnapshot: snap.basic_qar_snapshot,
    });
  }

  if (updatedById.size === 0) return claims;
  return claims.map((c) => updatedById.get(c.id) ?? c);
}

async function appendApproval(
  context: AuthContext,
  claimId: string,
  step: string,
  action: string,
  note?: string | null,
  opts?: { useAdmin?: boolean },
) {
  const db = opts?.useAdmin ? supabaseAdmin : context.supabase;
  const { error } = await db.from("hr_ot_claim_approvals").insert({
    claim_id: claimId,
    step,
    action,
    actor_id: context.userId,
    note: note ?? null,
  });
  if (error && !tableMissing(error.message)) throw error;
}

function otPayDivisors(policy: Record<string, unknown>, contractWorkingDays?: number | null) {
  return {
    // Policy standard working day (usually 8). Not staff.expected_hours / roster length.
    hoursPerDay: policyNumber(policy.hours_per_day, 8),
    daysPerMonth: otPayDaysPerMonth({
      contractWorkingDays,
      policyDaysPerMonth: policyNumber(policy.days_per_month, 30),
    }),
  };
}

function amountFor(
  minutes: number,
  rateMultiplier: number,
  pay: StaffOtPay,
  policy: Record<string, unknown>,
  contractWorkingDays?: number | null,
) {
  const { hoursPerDay, daysPerMonth } = otPayDivisors(policy, contractWorkingDays);
  const hourly = hourlyRateFromPay({
    monthlyBasicQar: pay.monthlyBasicQar,
    dailyRateQar: pay.dailyRateQar,
    hoursPerDay,
    daysPerMonth,
  });
  return computeOtAmountQar({
    approvedMinutes: minutes,
    rateMultiplier,
    hourlyRateQar: hourly,
  });
}

/** Audit fields stored on the claim when amount_qar is computed from basic. */
function otPaySnapshot(
  pay: StaffOtPay,
  policy: Record<string, unknown>,
  contractWorkingDays?: number | null,
) {
  const { hoursPerDay, daysPerMonth } = otPayDivisors(policy, contractWorkingDays);
  return {
    basic_qar_snapshot: pay.monthlyBasicQar,
    housing_qar_snapshot: pay.housingQar,
    transport_qar_snapshot: pay.transportQar,
    hours_per_day_snapshot: hoursPerDay,
    days_per_month_snapshot: daysPerMonth,
  };
}

const CLAIM_SELECT =
  "id, request_batch_id, request_number, staff_id, location_id, work_date, attendance_daily_id, scheduled_in, scheduled_out, actual_in, actual_out, eligible_minutes, claimed_minutes, approved_minutes, rate_type, rate_multiplier, amount_qar, basic_qar_snapshot, status, evidence_path, notes, purpose, claim_source, contract_working_days, submitted_by, submitted_at, created_at, staff(full_name, employee_code, phone, job_title, user_id, location_id, employment_type, department), locations(id, code, name)";

async function nextOtRequestNumber(context: AuthContext): Promise<string> {
  const { data, error } = await context.supabase.rpc("generate_ot_request_number");
  if (!error && typeof data === "string" && data.trim()) return data.trim();
  // Fallback when migration / RPC is not applied yet.
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `OT-${day}-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

async function readContractWorkingDays(context: AuthContext, staffId: string): Promise<number | null> {
  const { data, error } = await context.supabase
    .from("staff_profile_ext")
    .select("contract_working_days")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!error && data && data.contract_working_days != null) {
    return Number(data.contract_working_days);
  }
  try {
    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("contract_working_days")
      .eq("staff_id", staffId)
      .maybeSingle();
    if (adminErr || !adminRow || adminRow.contract_working_days == null) return null;
    return Number(adminRow.contract_working_days);
  } catch {
    return null;
  }
}

async function assertAttendanceOtPath(context: AuthContext, staffId: string) {
  const days = await readContractWorkingDays(context, staffId);
  if (isSupervisorOtContract(days)) {
    throw new Error(supervisorOtContractMessage(days));
  }
}

export const listOtClaims = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_OT_STATUSES, "all", "queue"]).optional().nullable(),
    mineOnly: z.boolean().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    locationId: z.string().uuid().optional().nullable(),
    department: z.string().trim().max(120).optional().nullable(),
    q: z.string().trim().max(120).optional().nullable(),
  }),
  async (data, context) => {
    const canApprove = canOtApprove(context);
    const canVerify = canOtVerify(context);
    const canSubmit = canOtSubmit(context);
    if (!canApprove && !canVerify && !canSubmit) {
      throw new ForbiddenError("Missing OT permission.");
    }

    const mine = await myStaff(context);
    const teamScope = await otSiteSupervisorTeamStaffIds(context);
    // Team-scoped site supervisors bypass RLS that only allows "own" rows for
    // non-supervisor logins; admin read still filters to their reporting tree.
    const claimDb = teamScope ? supabaseAdmin : context.supabase;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase filter builder chain
    const applyCommonFilters = (query: any, queueStatusesOverride?: readonly HrOtStatus[]) => {
      let next = query;
      if (data.mineOnly || (!canApprove && !canVerify)) {
        next = next.eq("staff_id", mine!.id);
      } else if (teamScope) {
        if (data.staffId) next = next.eq("staff_id", data.staffId);
        else next = next.in("staff_id", teamScope);
      } else if (data.staffId) {
        next = next.eq("staff_id", data.staffId);
      }

      if (data.status === "queue") {
        const canOps = canOtOpsApprove(context);
        const queueStatuses =
          queueStatusesOverride ??
          otApprovalQueueStatuses({
            canSiteVerify: canVerify && !canOps,
            canOpsApprove: canOps,
            canHrApprove: canApprove,
          });
        next = next.in("status", [...queueStatuses]);
      } else if (data.status && data.status !== "all") {
        next = next.eq("status", data.status);
      }

      if (data.month) {
        const start = `${data.month}-01`;
        const [y, m] = data.month.split("-").map(Number);
        const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        next = next.gte("work_date", start).lte("work_date", end);
      } else {
        if (data.dateFrom) next = next.gte("work_date", data.dateFrom);
        if (data.dateTo) next = next.lte("work_date", data.dateTo);
      }

      if (data.locationId) next = next.eq("location_id", data.locationId);
      return next;
    };

    const applyTextFilters = <T extends ReturnType<typeof mapClaimRow>>(rows: T[]): T[] => {
      let mapped = rows;
      if (data.department) {
        const dept = data.department.trim().toLowerCase();
        mapped = mapped.filter((r) => (r.department ?? "").toLowerCase() === dept);
      }
      if (data.q?.trim()) {
        const q = data.q.trim().toLowerCase();
        mapped = mapped.filter((r) => {
          const hay = [r.staffName, r.employeeCode, r.requestNumber, r.purpose, r.department, r.locationName]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
      }
      return mapped;
    };

    if (data.mineOnly || (!canApprove && !canVerify)) {
      if (!mine?.id) return [];
    } else if (teamScope && teamScope.length === 0) {
      return [];
    } else if (teamScope && data.staffId && !teamScope.includes(data.staffId)) {
      return [];
    }

    let query = claimDb
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .order("work_date", { ascending: false })
      .limit(500);
    query = applyCommonFilters(query);

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      // Pre-migration DBs may lack request_batch_id / basic_qar_snapshot / phone joins.
      if (columnMissing(error.message)) {
        const legacySelect =
          "id, staff_id, location_id, work_date, attendance_daily_id, scheduled_in, scheduled_out, actual_in, actual_out, eligible_minutes, claimed_minutes, approved_minutes, rate_type, rate_multiplier, amount_qar, status, evidence_path, notes, purpose, claim_source, contract_working_days, submitted_by, submitted_at, created_at, staff(full_name, employee_code, user_id, location_id, employment_type, department), locations(id, code, name)";
        let legacy = claimDb
          .from("hr_ot_claims")
          .select(legacySelect)
          .order("work_date", { ascending: false })
          .limit(500);
        const canOps = canOtOpsApprove(context);
        const legacyQueue = otApprovalQueueStatuses({
          canSiteVerify: canVerify && !canOps,
          canOpsApprove: canOps,
          canHrApprove: canApprove,
        }).filter((s) => s !== "ops_approved");
        legacy = applyCommonFilters(
          legacy,
          legacyQueue.length ? legacyQueue : (["submitted", "manager_verified"] as const),
        );
        const legacyRes = await legacy;
        if (legacyRes.error) {
          if (tableMissing(legacyRes.error.message)) return [];
          throw legacyRes.error;
        }
        const legacyMapped = applyTextFilters(
          (legacyRes.data ?? []).map((r) => mapClaimRow(r as Record<string, unknown>)),
        );
        const legacyPolicy = await loadOtPolicy(context);
        return refreshPendingOtAmountsMissingBasic(legacyMapped, legacyPolicy);
      }
      throw error;
    }
    const mapped = applyTextFilters(
      (rows ?? []).map((r) => mapClaimRow(r as Record<string, unknown>)),
    );
    const policy = await loadOtPolicy(context);
    return refreshPendingOtAmountsMissingBasic(mapped, policy);
  },
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve"] } },
);

export const getOtMonthlySummaries = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    groupBy: z.enum(["employee", "department", "employment_type", "location"]).default("employee"),
  }),
  async (data, context) => {
    const canSee = canOtApprove(context) || canOtVerify(context);
    if (!canSee) throw new ForbiddenError("OT summaries require verify or approve.");

    const start = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const teamScope = await otSiteSupervisorTeamStaffIds(context);
    if (teamScope && teamScope.length === 0) return [];

    const claimDb = teamScope ? supabaseAdmin : context.supabase;
    let query = claimDb
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .gte("work_date", start)
      .lte("work_date", end)
      .limit(1000);
    if (teamScope) query = query.in("staff_id", teamScope);

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    const policy = await loadOtPolicy(context);
    const refreshed = await refreshPendingOtAmountsMissingBasic(
      (rows ?? []).map((r) => mapClaimRow(r as Record<string, unknown>)),
      policy,
    );
    const mapped = refreshed.map((claim) => ({
      staffId: claim.staffId,
      staffName: claim.staffName,
      department: claim.department,
      employmentType: claim.employmentType,
      locationId: claim.locationId,
      locationName: claim.locationName,
      eligibleMinutes: claim.eligibleMinutes,
      approvedMinutes: claim.approvedMinutes ?? 0,
      amountQar: claim.amountQar,
      status: claim.status,
    }));
    return aggregateOtSummaries(mapped, data.groupBy);
  },
  { auth: { anyCapability: ["hr.ot.verify", "hr.ot.approve"] } },
);

export const previewOtEligibility = createAuthenticatedAction(
  z.object({
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    staffId: z.string().uuid().optional().nullable(),
    rateType: z.enum(HR_OT_RATE_TYPES).default("weekday"),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const canApprove = canOtApprove(context);
    const staffId = data.staffId && canApprove ? data.staffId : mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked.");

    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, location_id, employment_type, full_name")
      .eq("id", staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");

    const policy = await loadOtPolicy(context);
    const category = await staffEmploymentCategory(context, staffId, staff.employment_type);
    const contractDays = await readContractWorkingDays(context, staffId);
    const eligible = isOtEligible({
      employmentCategory: category,
      staffId,
      policy,
    });
    if (isSupervisorOtContract(contractDays)) {
      return {
        eligible: true,
        claimPath: "supervisor" as const,
        contractWorkingDays: contractDays,
        employmentCategory: category,
        attendanceDailyId: null,
        locationId: staff.location_id ?? null,
        scheduledIn: null,
        scheduledOut: null,
        actualIn: null,
        actualOut: null,
        eligibleMinutes: 0,
        minClaimable: policyNumber(policy.min_claimable_minutes, 60),
        rounding: String(policy.rounding ?? "down"),
        rateMultiplier: resolveOtRateMultiplier(data.rateType, policy),
        amountPreview: 0,
        belowMinimum: true,
      };
    }

    let summaryQuery = context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, location_id, work_date, scheduled_in, scheduled_out, actual_in, actual_out, worked_minutes, overtime_minutes, status",
      )
      .eq("staff_id", staffId)
      .eq("work_date", data.workDate)
      .limit(1);
    if (staff.location_id) summaryQuery = summaryQuery.eq("location_id", staff.location_id);
    const { data: summary } = await summaryQuery.maybeSingle();

    const computed = summary
      ? computeAttendanceOvertimeMinutes({
          workedMinutes: Number(summary.worked_minutes ?? 0),
          actualOut: summary.actual_out as string | null,
          scheduledIn: summary.scheduled_in as string | null,
          scheduledOut: summary.scheduled_out as string | null,
        })
      : 0;

    const eligibleMinutes = resolveEligibleOtMinutes({
      storedOvertimeMinutes: summary?.overtime_minutes as number | null,
      computedOvertimeMinutes: computed,
    });

    const multiplier = resolveOtRateMultiplier(data.rateType, policy);
    const pay = await staffPay(staffId);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;

    return {
      eligible,
      claimPath: "attendance" as const,
      contractWorkingDays: contractDays,
      employmentCategory: category,
      attendanceDailyId: summary?.id ? String(summary.id) : null,
      locationId: (summary?.location_id as string | null) ?? staff.location_id ?? null,
      scheduledIn: (summary?.scheduled_in as string | null) ?? null,
      scheduledOut: (summary?.scheduled_out as string | null) ?? null,
      actualIn: (summary?.actual_in as string | null) ?? null,
      actualOut: (summary?.actual_out as string | null) ?? null,
      eligibleMinutes,
      minClaimable,
      rounding,
      rateMultiplier: multiplier,
      amountPreview: amountFor(eligibleMinutes, multiplier, pay, policy),
      belowMinimum: eligibleMinutes < minClaimable,
    };
  },
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve"] } },
);

export const submitOtClaim = createAuthenticatedAction(
  z.object({
    workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rateType: z.enum(HR_OT_RATE_TYPES).default("weekday"),
    claimedMinutes: z.number().int().positive().optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
    evidencePath: z.string().max(500).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    asDraft: z.boolean().optional(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    const canApprove = canOtApprove(context);
    const staffId = data.staffId && canApprove ? data.staffId : mine?.id;
    if (!staffId) throw new ForbiddenError("Your login is not linked to a staff record.");

    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, location_id, employment_type, full_name")
      .eq("id", staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");

    const policy = await loadOtPolicy(context);
    const category = await staffEmploymentCategory(context, staffId, staff.employment_type);
    await assertAttendanceOtPath(context, staffId);
    if (!isOtEligible({ employmentCategory: category, staffId, policy })) {
      throw new Error("Staff is not eligible for OT claims under current policy.");
    }

    let summaryQuery = context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, location_id, work_date, scheduled_in, scheduled_out, actual_in, actual_out, worked_minutes, overtime_minutes",
      )
      .eq("staff_id", staffId)
      .eq("work_date", data.workDate)
      .limit(1);
    if (staff.location_id) summaryQuery = summaryQuery.eq("location_id", staff.location_id);
    const { data: summary } = await summaryQuery.maybeSingle();

    const computed = summary
      ? computeAttendanceOvertimeMinutes({
          workedMinutes: Number(summary.worked_minutes ?? 0),
          actualOut: summary.actual_out as string | null,
          scheduledIn: summary.scheduled_in as string | null,
          scheduledOut: summary.scheduled_out as string | null,
        })
      : 0;

    const eligibleMinutes = resolveEligibleOtMinutes({
      storedOvertimeMinutes: summary?.overtime_minutes as number | null,
      computedOvertimeMinutes: computed,
    });

    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;
    const rawClaimed = data.claimedMinutes ?? eligibleMinutes;
    const claimedMinutes = assertMinClaimableMinutes(rawClaimed, minClaimable, rounding);
    if (claimedMinutes > eligibleMinutes && eligibleMinutes > 0) {
      throw new Error(`Claimed minutes (${claimedMinutes}) exceed eligible (${eligibleMinutes}).`);
    }

    const rateMultiplier = resolveOtRateMultiplier(data.rateType, policy);
    const pay = await staffPay(staffId);
    const amountQar = amountFor(claimedMinutes, rateMultiplier, pay, policy);
    const status: HrOtStatus = data.asDraft ? "draft" : "submitted";
    const requestBatchId = crypto.randomUUID();
    const requestNumber = await nextOtRequestNumber(context);

    const { data: row, error } = await context.supabase
      .from("hr_ot_claims")
      .insert({
        staff_id: staffId,
        location_id: (summary?.location_id as string | null) ?? staff.location_id ?? null,
        work_date: data.workDate,
        attendance_daily_id: summary?.id ? String(summary.id) : null,
        scheduled_in: (summary?.scheduled_in as string | null) ?? null,
        scheduled_out: (summary?.scheduled_out as string | null) ?? null,
        actual_in: (summary?.actual_in as string | null) ?? null,
        actual_out: (summary?.actual_out as string | null) ?? null,
        eligible_minutes: eligibleMinutes,
        claimed_minutes: claimedMinutes,
        approved_minutes: null,
        rate_type: data.rateType,
        rate_multiplier: rateMultiplier,
        amount_qar: amountQar,
        ...otPaySnapshot(pay, policy),
        status,
        evidence_path: data.evidencePath ?? null,
        notes: data.notes ?? null,
        purpose: data.notes ?? null,
        claim_source: "attendance",
        request_batch_id: requestBatchId,
        request_number: requestNumber,
        submitted_by: status === "submitted" ? context.userId : null,
        submitted_at: status === "submitted" ? new Date().toISOString() : null,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) {
      if (/hr_ot_claims_active_uq|duplicate key/i.test(error.message)) {
        throw new Error("An active OT claim already exists for this staff, date, and rate type.");
      }
      throw error;
    }

    if (status === "submitted") {
      await appendApproval(context, row.id as string, "submit", "submitted", data.notes);
      try {
        const { notifyUsers } = await import("@/lib/notifications/action-notify");
        const mgrIds = await otSubmittedNotifyUserIds({
          staffId,
          locationId: staff.location_id ?? null,
          excludeUserId: context.userId,
        });
        await notifyUsers({
          userIds: mgrIds,
          locationId: staff.location_id ?? null,
          category: "hr_ot",
          title: "OT claim submitted",
          body: `An OT claim for ${String(staff.full_name ?? "staff")} on ${data.workDate} needs site supervisor approval.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: String(row.id),
        });
      } catch {
        /* non-blocking */
      }
    }

    return { id: row.id as string, status, claimedMinutes, eligibleMinutes, amountQar };
  },
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.approve"] } },
);

async function applyOtClaimAction(input: {
  claimId: string;
  action:
    | "submit"
    | "verify"
    | "ops_approve"
    | "approve"
    | "request_changes"
    | "resubmit"
    | "reject"
    | "cancel"
    | "payroll_posted";
  approvedMinutes?: number | null;
  note?: string | null;
  context: AuthContext;
  /** Skip per-claim notifications when a batch action notifies once. */
  skipNotify?: boolean;
}): Promise<{ ok: true; status: HrOtStatus; requestBatchId: string | null }> {
  const { claimId, action, context } = input;
  const teamScope = await otSiteSupervisorTeamStaffIds(context);
  const claimDb = teamScope || canOtOpsApprove(context) ? supabaseAdmin : context.supabase;
  const { data: existing, error: readErr } = await claimDb
    .from("hr_ot_claims")
    .select(CLAIM_SELECT)
    .eq("id", claimId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!existing) throw new Error("OT claim not found.");

  const from = String(existing.status) as HrOtStatus;
  const mine = await myStaff(context);
  const canVerify = canOtVerify(context);
  const canApprove = canOtApprove(context);
  const canOps = canOtOpsApprove(context);
  const isOwner = mine?.id === existing.staff_id;
  const isSubmitter = existing.submitted_by === context.userId;

  const policy = await loadOtPolicy(context);
  const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
  const rounding = String(policy.rounding ?? "down") as HrOtRounding;
  const pay = await staffPay(String(existing.staff_id));
  const rateMultiplier = Number(existing.rate_multiplier ?? 1);
  const contractDays =
    existing.contract_working_days == null ? null : Number(existing.contract_working_days);

  let actor: HrOtActor = "employee";
  let to: HrOtStatus;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  let approvalStep = "manager";
  let approvalAction = "verified";

  if (action === "submit") {
    if (!isOwner && !canApprove) throw new ForbiddenError("Only the employee can submit this claim.");
    actor = "employee";
    to = "submitted";
    assertOtTransition(from, to, actor);
    patch.status = to;
    patch.submitted_by = context.userId;
    patch.submitted_at = new Date().toISOString();
    approvalStep = "submit";
    approvalAction = "submitted";
  } else if (action === "verify") {
    if (!canVerify && !canApprove) throw new ForbiddenError("Manager verification required.");
    await assertOtClaimInSiteSupervisorTeam(context, String(existing.staff_id));
    actor = "manager";
    to = "manager_verified";
    assertOtTransition(from, to, canApprove ? "hr" : actor);
    const mins = assertMinClaimableMinutes(
      input.approvedMinutes ?? Number(existing.claimed_minutes ?? 0),
      minClaimable,
      rounding,
    );
    patch.status = to;
    patch.approved_minutes = mins;
    patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy, contractDays);
    Object.assign(patch, otPaySnapshot(pay, policy, contractDays));
    patch.verified_by = context.userId;
    patch.verified_at = new Date().toISOString();
    approvalStep = "manager";
    approvalAction = "verified";
  } else if (action === "ops_approve") {
    if (!canOps) throw new ForbiddenError("Head of Operations approval required.");
    actor = "ops";
    to = "ops_approved";
    assertOtTransition(from, to, actor);
    const mins = assertMinClaimableMinutes(
      input.approvedMinutes ??
        Number(existing.approved_minutes ?? existing.claimed_minutes ?? 0),
      minClaimable,
      rounding,
    );
    patch.status = to;
    patch.approved_minutes = mins;
    patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy, contractDays);
    Object.assign(patch, otPaySnapshot(pay, policy, contractDays));
    patch.ops_approved_by = context.userId;
    patch.ops_approved_at = new Date().toISOString();
    approvalStep = "ops";
    approvalAction = "approved";
  } else if (action === "approve") {
    if (!canApprove) throw new ForbiddenError("HR approval required.");
    actor = "hr";
    to = "hr_approved";
    assertOtTransition(from, to, actor);
    const mins = assertMinClaimableMinutes(
      input.approvedMinutes ??
        Number(existing.approved_minutes ?? existing.claimed_minutes ?? 0),
      minClaimable,
      rounding,
    );
    patch.status = to;
    patch.approved_minutes = mins;
    patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy, contractDays);
    Object.assign(patch, otPaySnapshot(pay, policy, contractDays));
    patch.approved_by = context.userId;
    patch.approved_at = new Date().toISOString();
    approvalStep = "hr";
    approvalAction = "approved";
  } else if (action === "request_changes") {
    if (!canVerify && !canApprove && !canOps) {
      throw new ForbiddenError("Cannot request changes on OT claim.");
    }
    if (!canRequestOtChanges(from)) {
      throw new ForbiddenError("Change request is not allowed at this OT status.");
    }
    if (from === "ops_approved") {
      if (!canApprove) throw new ForbiddenError("HR change request required at this step.");
      actor = "hr";
    } else if (from === "manager_verified") {
      if (!canOps && !canApprove) {
        throw new ForbiddenError("Head of Operations change request required.");
      }
      actor = canOps ? "ops" : "hr";
    } else {
      actor = canApprove ? "hr" : "manager";
      if (actor === "manager") {
        await assertOtClaimInSiteSupervisorTeam(context, String(existing.staff_id));
      }
    }
    to = "changes_requested";
    assertOtTransition(from, to, actor);
    patch.status = to;
    approvalStep = actor === "hr" ? "hr" : actor === "ops" ? "ops" : "manager";
    approvalAction = "changes_requested";
  } else if (action === "resubmit") {
    if (!isOwner && !isSubmitter && !canApprove) {
      throw new ForbiddenError("Only the submitter can resubmit this OT claim.");
    }
    if (from !== "changes_requested" && !canApprove) {
      throw new ForbiddenError("OT claim can only be resubmitted after a change request.");
    }
    actor = isOwner || isSubmitter ? "employee" : "hr";
    to = "submitted";
    assertOtTransition(from, to, actor === "employee" ? "employee" : "hr");
    patch.status = to;
    patch.submitted_by = existing.submitted_by ?? context.userId;
    patch.submitted_at = new Date().toISOString();
    patch.verified_by = null;
    patch.verified_at = null;
    patch.ops_approved_by = null;
    patch.ops_approved_at = null;
    patch.approved_by = null;
    patch.approved_at = null;
    patch.approved_minutes = null;
    approvalStep = "submit";
    approvalAction = "resubmitted";
  } else if (action === "reject") {
    if (!canVerify && !canApprove && !canOps) {
      throw new ForbiddenError("Cannot reject OT claim.");
    }
    if (from === "ops_approved") {
      if (!canApprove) throw new ForbiddenError("HR rejection required at this step.");
      actor = "hr";
    } else if (from === "manager_verified") {
      if (!canOps && !canApprove) throw new ForbiddenError("Head of Operations rejection required.");
      actor = canOps ? "ops" : "hr";
    } else {
      actor = canApprove ? "hr" : "manager";
      if (actor === "manager") {
        await assertOtClaimInSiteSupervisorTeam(context, String(existing.staff_id));
      }
    }
    to = "rejected";
    assertOtTransition(from, to, actor);
    patch.status = to;
    approvalStep = actor === "hr" ? "hr" : actor === "ops" ? "ops" : "manager";
    approvalAction = "rejected";
  } else if (action === "cancel") {
    if (!isOwner && !isSubmitter && !canApprove) {
      throw new ForbiddenError("Cannot cancel this OT claim.");
    }
    if (!canEditOtBeforeHoo(from) && !canApprove) {
      throw new ForbiddenError("OT request is locked after Head of Operations approval.");
    }
    actor = isOwner || isSubmitter ? "employee" : "hr";
    to = "cancelled";
    assertOtTransition(from, to, actor === "employee" ? "employee" : "hr");
    patch.status = to;
    approvalStep = "submit";
    approvalAction = "cancelled";
  } else if (action === "payroll_posted") {
    if (!canApprove) throw new ForbiddenError("Marking payroll_posted requires hr.ot.approve.");
    assertCanMarkPayrollPosted(from);
    actor = "hr";
    to = "payroll_posted";
    assertOtTransition(from, to, actor);
    patch.status = to;
    patch.payroll_posted_by = context.userId;
    patch.payroll_posted_at = new Date().toISOString();
    approvalStep = "payroll";
    approvalAction = "payroll_posted";
  } else {
    throw new Error("Unknown action.");
  }

  const { data: updated, error } = await claimDb
    .from("hr_ot_claims")
    .update(patch)
    .eq("id", claimId)
    .eq("status", from)
    .select("status, request_batch_id")
    .maybeSingle();
  if (error) throw error;
  if (!updated) {
    if (action === "payroll_posted") {
      throw new Error("OT claim is already payroll_posted.");
    }
    throw new Error("OT claim status changed; refresh and retry.");
  }

  await appendApproval(context, claimId, approvalStep, approvalAction, input.note, {
    useAdmin: Boolean(teamScope) || canOps,
  });

  if (to === "hr_approved") {
    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "ot_approved",
      effectiveOn: String(existing.work_date).slice(0, 10),
      payload: {
        rate_type: existing.rate_type,
        approved_minutes: patch.approved_minutes,
        amount_qar: patch.amount_qar,
        rate_multiplier: rateMultiplier,
      },
      sourceTable: "hr_ot_claims",
      sourceId: claimId,
    });
  }
  if (to === "rejected") {
    await appendEmployeeEvent(context, {
      staffId: String(existing.staff_id),
      eventType: "ot_rejected",
      effectiveOn: String(existing.work_date).slice(0, 10),
      payload: { rate_type: existing.rate_type, note: input.note ?? null },
      sourceTable: "hr_ot_claims",
      sourceId: claimId,
    });
  }

  if (
    !input.skipNotify &&
    (to === "submitted" ||
      to === "manager_verified" ||
      to === "ops_approved" ||
      to === "hr_approved" ||
      to === "changes_requested" ||
      to === "rejected")
  ) {
    try {
      const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
      const staffJoin = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
      const staffName = (staffJoin as { full_name?: string } | null)?.full_name ?? "staff";
      const staffUserId = (staffJoin as { user_id?: string } | null)?.user_id ?? null;
      const locId = (existing.location_id as string | null) ?? null;
      if (to === "submitted") {
        const ids = await otSubmittedNotifyUserIds({
          staffId: String(existing.staff_id),
          locationId: locId,
          excludeUserId: context.userId,
        });
        await notifyUsers({
          userIds: ids,
          locationId: locId,
          category: "hr_ot",
          title: action === "resubmit" ? "OT claim resubmitted" : "OT claim submitted",
          body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} needs site supervisor approval.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: claimId,
        });
      } else if (to === "manager_verified") {
        const ids = await loadOtHooNotifyUserIds(context.userId);
        await notifyUsers({
          userIds: ids,
          locationId: locId,
          category: "hr_ot",
          title: "OT claim ready for Head of Operations",
          body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} was site supervisor approved and needs HOO preview/approve.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: claimId,
        });
      } else if (to === "ops_approved") {
        const ids = await findUsersWithCapability("hr.ot.approve", locId);
        await notifyUsers({
          userIds: ids.filter((id) => id !== context.userId),
          locationId: locId,
          category: "hr_ot",
          title: "OT claim ready for HR",
          body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} was HOO approved and needs HR.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: claimId,
        });
      } else if (to === "changes_requested") {
        const notifyIds = [
          ...new Set(
            [existing.submitted_by, staffUserId]
              .filter((id): id is string => Boolean(id) && id !== context.userId)
              .map(String),
          ),
        ];
        if (notifyIds.length) {
          await notifyUsers({
            userIds: notifyIds,
            locationId: locId,
            category: "hr_ot",
            title: "OT change requested",
            body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} was sent back for changes.${input.note ? ` ${input.note}` : ""}`,
            severity: "warning",
            actionUrl: "/people/hr/ot",
            sourceType: "hr_ot_claims",
            sourceId: claimId,
          });
        }
      } else if (staffUserId) {
        await notifyUsers({
          userIds: [String(staffUserId)],
          locationId: locId,
          category: "hr_ot",
          title: to === "hr_approved" ? "OT claim approved" : "OT claim rejected",
          body: `Your OT claim for ${String(existing.work_date).slice(0, 10)} was ${to === "hr_approved" ? "approved" : "rejected"}.`,
          severity: to === "hr_approved" ? "info" : "warning",
          actionUrl: "/hr/me",
          sourceType: "hr_ot_claims",
          sourceId: claimId,
        });
      }
    } catch {
      /* non-blocking */
    }
  }

  return {
    ok: true as const,
    status: to,
    requestBatchId: (updated.request_batch_id as string | null) ?? null,
  };
}

export const actOnOtClaim = createAuthenticatedAction(
  z.object({
    claimId: z.string().uuid(),
    action: z.enum([
      "submit",
      "verify",
      "ops_approve",
      "approve",
      "request_changes",
      "resubmit",
      "reject",
      "cancel",
      "payroll_posted",
    ]),
    approvedMinutes: z.number().int().positive().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }),
  async (data, context) =>
    applyOtClaimAction({
      claimId: data.claimId,
      action: data.action,
      approvedMinutes: data.approvedMinutes,
      note: data.note,
      context,
    }),
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve"] } },
);

/** Apply one action to every day-row in an OT request (batch id or explicit claim ids). */
export const actOnOtRequestBatch = createAuthenticatedAction(
  z
    .object({
      requestBatchId: z.string().uuid().optional().nullable(),
      claimIds: z.array(z.string().uuid()).min(1).max(40).optional(),
      action: z.enum([
        "verify",
        "ops_approve",
        "approve",
        "request_changes",
        "resubmit",
        "reject",
        "cancel",
        "payroll_posted",
      ]),
      note: z.string().max(500).optional().nullable(),
    })
    .refine((d) => Boolean(d.requestBatchId) || Boolean(d.claimIds?.length), {
      message: "requestBatchId or claimIds is required",
    }),
  async (data, context) => {
    const canOps = canOtOpsApprove(context);
    const teamScope = await otSiteSupervisorTeamStaffIds(context);
    const claimDb = teamScope || canOps ? supabaseAdmin : context.supabase;
    let rows: Array<{
      id: string;
      status: string;
      staff_id: string;
      work_date: string;
      location_id: string | null;
      request_batch_id: string | null;
    }> = [];

    if (data.claimIds?.length) {
      const { data: byIds, error } = await claimDb
        .from("hr_ot_claims")
        .select("id, status, staff_id, work_date, location_id, request_batch_id")
        .in("id", data.claimIds)
        .order("work_date", { ascending: true });
      if (error) throw error;
      rows = (byIds ?? []) as typeof rows;
    } else if (data.requestBatchId) {
      const { data: byBatch, error } = await claimDb
        .from("hr_ot_claims")
        .select("id, status, staff_id, work_date, location_id, request_batch_id")
        .eq("request_batch_id", data.requestBatchId)
        .order("work_date", { ascending: true });
      if (error) throw error;
      rows = (byBatch ?? []) as typeof rows;
      // Unbatched / attendance claims: treat the id as a singleton request.
      if (!rows.length) {
        const single = await claimDb
          .from("hr_ot_claims")
          .select("id, status, staff_id, work_date, location_id, request_batch_id")
          .eq("id", data.requestBatchId)
          .maybeSingle();
        if (single.error) throw single.error;
        rows = single.data ? ([single.data] as typeof rows) : [];
      }
    }
    if (!rows.length) throw new Error("OT request not found.");

    const statuses = new Set(rows.map((row) => String(row.status)));
    if (statuses.size !== 1) {
      throw new Error("OT request rows have mixed statuses; refresh and retry.");
    }

    let lastStatus: HrOtStatus = String(rows[0]!.status) as HrOtStatus;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const result = await applyOtClaimAction({
        claimId: String(row.id),
        action: data.action,
        note: data.note,
        context,
        skipNotify: true,
      });
      lastStatus = result.status;
    }

    try {
      const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
      const locId = (rows[0]!.location_id as string | null) ?? null;
      const dates = rows.map((row) => String(row.work_date).slice(0, 10)).join(", ");
      if (lastStatus === "manager_verified") {
        const ids = await loadOtHooNotifyUserIds(context.userId);
        await notifyUsers({
          userIds: ids,
          locationId: locId,
          category: "hr_ot",
          title: "OT request ready for Head of Operations",
          body: `Supervisor OT (${rows.length} day(s): ${dates}) needs HOO preview/approve.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: String(rows[0]!.id),
        });
      } else if (lastStatus === "ops_approved") {
        const ids = await findUsersWithCapability("hr.ot.approve", locId);
        await notifyUsers({
          userIds: ids.filter((id) => id !== context.userId),
          locationId: locId,
          category: "hr_ot",
          title: "OT request ready for HR",
          body: `OT request (${rows.length} day(s): ${dates}) was HOO approved and needs HR.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: String(rows[0]!.id),
        });
      } else if (lastStatus === "submitted" && data.action === "resubmit") {
        const ids = await otSubmittedNotifyUserIds({
          staffId: String(rows[0]!.staff_id),
          locationId: locId,
          excludeUserId: context.userId,
        });
        await notifyUsers({
          userIds: ids,
          locationId: locId,
          category: "hr_ot",
          title: "OT request resubmitted",
          body: `OT request (${rows.length} day(s): ${dates}) was resubmitted and needs site supervisor approval.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: String(rows[0]!.id),
        });
      } else if (lastStatus === "changes_requested") {
        const { data: head } = await claimDb
          .from("hr_ot_claims")
          .select("submitted_by, staff(user_id)")
          .eq("id", rows[0]!.id)
          .maybeSingle();
        const staffJoin = head
          ? Array.isArray(head.staff)
            ? head.staff[0]
            : head.staff
          : null;
        const notifyIds = [
          ...new Set(
            [head?.submitted_by, staffJoin?.user_id]
              .filter((id): id is string => Boolean(id) && id !== context.userId)
              .map(String),
          ),
        ];
        if (notifyIds.length) {
          await notifyUsers({
            userIds: notifyIds,
            locationId: locId,
            category: "hr_ot",
            title: "OT change requested",
            body: `OT request (${rows.length} day(s): ${dates}) was sent back for changes.${data.note ? ` ${data.note}` : ""}`,
            severity: "warning",
            actionUrl: "/people/hr/ot",
            sourceType: "hr_ot_claims",
            sourceId: String(rows[0]!.id),
          });
        }
      }
    } catch {
      /* non-blocking */
    }

    return {
      ok: true as const,
      status: lastStatus,
      count: rows.length,
      requestBatchId: (rows[0]!.request_batch_id as string | null) ?? data.requestBatchId ?? null,
    };
  },
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve"] } },
);

export const listMyOtEligibilityDays = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
  }),
  async (data, context) => {
    const mine = await myStaff(context);
    if (!mine?.id) return [];

    const policy = await loadOtPolicy(context);
    const category = await staffEmploymentCategory(context, mine.id, mine.employment_type);
    if (!isOtEligible({ employmentCategory: category, staffId: mine.id, policy })) {
      return [];
    }
    const contractDays = await readContractWorkingDays(context, mine.id);
    if (isSupervisorOtContract(contractDays)) return [];

    const now = new Date();
    const month =
      data.month ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);

    const { data: summaries, error } = await context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, work_date, location_id, scheduled_in, scheduled_out, actual_in, actual_out, worked_minutes, overtime_minutes",
      )
      .eq("staff_id", mine.id)
      .gte("work_date", start)
      .lte("work_date", end)
      .gt("overtime_minutes", 0)
      .order("work_date", { ascending: false })
      .limit(40);
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }

    return (summaries ?? [])
      .map((s) => {
        const computed = computeAttendanceOvertimeMinutes({
          workedMinutes: Number(s.worked_minutes ?? 0),
          actualOut: s.actual_out as string | null,
          scheduledIn: s.scheduled_in as string | null,
          scheduledOut: s.scheduled_out as string | null,
        });
        const eligibleMinutes = resolveEligibleOtMinutes({
          storedOvertimeMinutes: s.overtime_minutes as number | null,
          computedOvertimeMinutes: computed,
        });
        return {
          attendanceDailyId: String(s.id),
          workDate: String(s.work_date).slice(0, 10),
          locationId: (s.location_id as string | null) ?? null,
          scheduledIn: (s.scheduled_in as string | null) ?? null,
          scheduledOut: (s.scheduled_out as string | null) ?? null,
          actualIn: (s.actual_in as string | null) ?? null,
          actualOut: (s.actual_out as string | null) ?? null,
          eligibleMinutes,
          claimable: eligibleMinutes >= minClaimable,
        };
      })
      .filter((d) => d.eligibleMinutes > 0);
  },
  { auth: { capability: "hr.ot.submit" } },
);

export const getOtPolicySnapshot = createAuthenticatedActionNoInput(async (context) => {
  const policy = await loadOtPolicy(context);
  return {
    minClaimableMinutes: policyNumber(policy.min_claimable_minutes, 60),
    rounding: String(policy.rounding ?? "down"),
    eligibleCategories: Array.isArray(policy.eligible_categories)
      ? policy.eligible_categories.map(String)
      : ["secondment"],
    rateWeekday: resolveOtRateMultiplier("weekday", policy),
    rateWeeklyOff: resolveOtRateMultiplier("weekly_off", policy),
    ratePublicHoliday: resolveOtRateMultiplier("public_holiday", policy),
    rateEid: resolveOtRateMultiplier("eid", policy),
  };
}, { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve", "hr.policy.configure"] } });

const SUPERVISOR_OT_AUTH = {
  auth: { anyCapability: ["hr.ot.verify", "hr.ot.approve"] as ["hr.ot.verify", "hr.ot.approve"] },
};

type SupervisorOtStaffRow = {
  id: string;
  fullName: string;
  employeeCode: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  locationId: string | null;
  locationName: string | null;
  contractWorkingDays: number | null;
  supervisorContract: boolean;
};

/**
 * Org-chart reporting rollup for the actor (team leads, supervisors under them,
 * and all staff below). Venue dump only when that chart subtree is empty — see
 * loadSupervisorOtTeamStaffIds. Not company-wide.
 *
 * Flat selects only (no nested locations()) so a broken embed cannot 500 the
 * picker. contract_working_days soft-fails when the column is not migrated yet.
 */
async function loadSupervisorOtTeamStaff(userId: string): Promise<SupervisorOtStaffRow[]> {
  const { teamStaffIds } = await loadSupervisorOtTeamStaffIds(userId);
  if (teamStaffIds.length === 0) return [];

  const rows: Array<{
    id: string;
    full_name: string | null;
    employee_code: string | null;
    phone: string | null;
    department: string | null;
    job_title: string | null;
    location_id: string | null;
  }> = [];
  for (let i = 0; i < teamStaffIds.length; i += 100) {
    const chunk = teamStaffIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, employee_code, phone, department, job_title, location_id")
      .in("id", chunk)
      .in("status", ["active", "on_leave", "serving_notice"])
      .is("deleted_at", null)
      .order("full_name");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      rows.push({
        id: String(row.id),
        full_name: (row.full_name as string | null) ?? null,
        employee_code: (row.employee_code as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        department: (row.department as string | null) ?? null,
        job_title: (row.job_title as string | null) ?? null,
        location_id: (row.location_id as string | null) ?? null,
      });
    }
  }
  rows.sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));

  const locationNameById = new Map<string, string>();
  const locationIds = [...new Set(rows.map((row) => row.location_id).filter(Boolean))] as string[];
  for (let i = 0; i < locationIds.length; i += 100) {
    const chunk = locationIds.slice(i, i + 100);
    const { data: locs, error: locErr } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .in("id", chunk);
    if (locErr) {
      console.warn("[supervisor-ot] location name lookup failed", locErr.message);
      break;
    }
    for (const loc of locs ?? []) {
      if (loc.id && loc.name) locationNameById.set(String(loc.id), String(loc.name));
    }
  }

  const ids = rows.map((row) => row.id);
  const daysByStaff = new Map<string, number | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data: extRows, error: extErr } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, contract_working_days")
      .in("staff_id", chunk);
    if (extErr) {
      if (/contract_working_days|schema cache|does not exist/i.test(extErr.message)) {
        console.warn("[supervisor-ot] contract_working_days unavailable", extErr.message);
        break;
      }
      throw new Error(extErr.message);
    }
    for (const row of extRows ?? []) {
      daysByStaff.set(
        String(row.staff_id),
        row.contract_working_days == null ? null : Number(row.contract_working_days),
      );
    }
  }

  return rows.map((row) => {
    const days = daysByStaff.get(row.id) ?? null;
    return {
      id: row.id,
      fullName: String(row.full_name ?? ""),
      employeeCode: row.employee_code,
      phone: row.phone,
      department: row.department,
      jobTitle: row.job_title,
      locationId: row.location_id,
      locationName: row.location_id ? (locationNameById.get(row.location_id) ?? null) : null,
      contractWorkingDays: days,
      supervisorContract: isSupervisorOtContract(days),
    };
  });
}

/** Safe: production must not surface React #441 digests under the employee picker. */
export const listStaffForSupervisorOt = createSafeAuthenticatedActionNoInput(
  async (context) => loadSupervisorOtTeamStaff(context.userId),
  SUPERVISOR_OT_AUTH,
);

export const setStaffContractWorkingDays = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    contractWorkingDays: z.union([z.literal(26), z.literal(28), z.null()]),
  }),
  async (data, context) => {
    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .maybeSingle();
    if (staffErr) throw staffErr;
    if (!staff) throw new Error("Staff not found.");

    const { error } = await context.supabase.from("staff_profile_ext").upsert(
      {
        staff_id: data.staffId,
        contract_working_days: data.contractWorkingDays,
        updated_by: context.userId,
      },
      { onConflict: "staff_id" },
    );
    if (error) {
      if (/permission|row-level|policy/i.test(error.message)) {
        throw new ForbiddenError("Only HR can set contract working days.");
      }
      throw error;
    }
    return { staffId: data.staffId, contractWorkingDays: data.contractWorkingDays };
  },
  { auth: { capability: "hr.profile.edit" } },
);

const supervisorOtDaySchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Extra OT hours for this date only (not a multi-day combined total). */
  hours: z.number().gt(0).max(24),
});

export const submitSupervisorOtClaim = createAuthenticatedAction(
  z.object({
    entries: z
      .array(
        z
          .object({
            staffId: z.string().uuid(),
            /** Preferred: one hours value per OT date. */
            days: z.array(supervisorOtDaySchema).min(1).max(14).optional(),
            /** @deprecated Prefer `days` — same hours applied to every date. */
            workDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(14).optional(),
            /** @deprecated Prefer `days`. */
            hours: z.number().gt(0).max(24).optional(),
            rateType: z.enum(HR_OT_RATE_TYPES).default("weekday"),
            purpose: z.string().trim().min(3).max(1000),
          })
          .superRefine((entry, ctx) => {
            const days =
              entry.days != null
                ? normalizeSupervisorOtDays(entry.days)
                : normalizeSupervisorOtDays(
                    (entry.workDates ?? []).map((workDate) => ({
                      workDate,
                      hours: Number(entry.hours),
                    })),
                  );
            if (days.length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Add at least one overtime date with hours for each employee.",
                path: ["days"],
              });
            }
          }),
      )
      .min(1)
      .max(40),
  }),
  async (data, context) => {
    const staffIds = [...new Set(data.entries.map((entry) => entry.staffId))];
    if (staffIds.length !== data.entries.length) {
      throw new Error("Each selected employee may appear only once.");
    }
    const entryByStaff = new Map(data.entries.map((entry) => [entry.staffId, entry]));
    const daysByStaff = new Map(
      data.entries.map((entry) => {
        const days =
          entry.days != null
            ? normalizeSupervisorOtDays(entry.days)
            : normalizeSupervisorOtDays(
                (entry.workDates ?? []).map((workDate) => ({
                  workDate,
                  hours: Number(entry.hours),
                })),
              );
        return [entry.staffId, days] as const;
      }),
    );
    const { teamStaffIds } = await loadSupervisorOtTeamStaffIds(context.userId);
    const teamSet = new Set(teamStaffIds);
    for (const staffId of staffIds) {
      if (!teamSet.has(staffId)) {
        throw new ForbiddenError("You can only request OT for people on your team.");
      }
    }

    const staffById = new Map<
      string,
      { id: string; full_name: string | null; location_id: string | null; employment_type: string | null }
    >();
    for (let i = 0; i < staffIds.length; i += 100) {
      const chunk = staffIds.slice(i, i + 100);
      const { data: rows, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, full_name, location_id, employment_type")
        .in("id", chunk)
        .is("deleted_at", null);
      if (staffErr) throw staffErr;
      for (const row of rows ?? []) {
        staffById.set(String(row.id), {
          id: String(row.id),
          full_name: (row.full_name as string | null) ?? null,
          location_id: (row.location_id as string | null) ?? null,
          employment_type: (row.employment_type as string | null) ?? null,
        });
      }
    }
    for (const staffId of staffIds) {
      if (!staffById.has(staffId)) throw new Error("Staff not found.");
    }

    const contractByStaff = new Map<string, number | null>();
    for (const staffId of staffIds) {
      contractByStaff.set(staffId, await readContractWorkingDays(context, staffId));
    }

    const ineligibleNames: string[] = [];
    for (const staffId of staffIds) {
      const days = contractByStaff.get(staffId) ?? null;
      if (!isSupervisorOtContract(days)) {
        ineligibleNames.push(String(staffById.get(staffId)?.full_name ?? "Staff"));
      }
    }
    if (ineligibleNames.length > 0) {
      throw new Error(
        ineligibleNames.length === 1
          ? "Set this employee's contract to 26 or 28 working days before a supervisor OT request."
          : `Supervisor OT requests need a 26- or 28-day contract. Remove or fix: ${ineligibleNames.join(", ")}.`,
      );
    }

    const policy = await loadOtPolicy(context);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;

    type DayClaimMeta = {
      claimedMinutes: number;
      amountQar: number;
    };
    type StaffClaimMeta = {
      rateType: HrOtRateType;
      rateMultiplier: number;
      purpose: string;
      paySnapshot: ReturnType<typeof otPaySnapshot>;
      pay: StaffOtPay;
      contractDays: number;
      byDate: Map<string, DayClaimMeta>;
    };
    const metaByStaff = new Map<string, StaffClaimMeta>();
    for (const entry of data.entries) {
      const contractDays = contractByStaff.get(entry.staffId);
      if (!isSupervisorOtContract(contractDays)) continue;
      const days = daysByStaff.get(entry.staffId) ?? [];
      if (days.length === 0) {
        throw new Error("Add at least one overtime date with hours for each employee.");
      }
      const rateMultiplier = resolveOtRateMultiplier(entry.rateType, policy);
      const pay = await staffPay(entry.staffId);
      const byDate = new Map<string, DayClaimMeta>();
      for (const day of days) {
        const claimedMinutes = assertMinClaimableMinutes(
          Math.round(day.hours * 60),
          minClaimable,
          rounding,
        );
        byDate.set(day.workDate, {
          claimedMinutes,
          amountQar: amountFor(claimedMinutes, rateMultiplier, pay, policy, contractDays),
        });
      }
      metaByStaff.set(entry.staffId, {
        rateType: entry.rateType,
        rateMultiplier,
        purpose: entry.purpose.trim(),
        paySnapshot: otPaySnapshot(pay, policy, contractDays),
        pay,
        contractDays,
        byDate,
      });
    }

    const slots = supervisorOtClaimSlots(
      staffIds.map((staffId) => ({
        staffId,
        workDates: (daysByStaff.get(staffId) ?? []).map((day) => day.workDate),
      })),
    );
    if (slots.length === 0) {
      throw new Error("Add at least one overtime date for each employee.");
    }
    const dates = [...new Set(slots.map((slot) => slot.workDate))].sort();
    const slotKey = new Set(
      slots.map((slot) => {
        const rateType = entryByStaff.get(slot.staffId)?.rateType ?? "weekday";
        return `${slot.staffId}:${slot.workDate}:${rateType}`;
      }),
    );

    const { data: existing, error: existingErr } = await context.supabase
      .from("hr_ot_claims")
      .select("staff_id, work_date, rate_type, status")
      .in("staff_id", staffIds)
      .in("work_date", dates);
    if (existingErr) throw existingErr;
    const blocked = (existing ?? []).filter((row) => {
      if (row.status === "rejected" || row.status === "cancelled") return false;
      const key = `${String(row.staff_id)}:${String(row.work_date).slice(0, 10)}:${String(row.rate_type)}`;
      return slotKey.has(key);
    });
    if (blocked.length > 0) {
      const labels = blocked.map((row) => {
        const name = String(staffById.get(String(row.staff_id))?.full_name ?? "Staff");
        return `${name} (${String(row.work_date).slice(0, 10)})`;
      });
      throw new Error(`An active OT claim already exists for ${labels.join(", ")}.`);
    }

    const now = new Date().toISOString();
    const linked = await loadLinkedStaffRecord(context.userId);
    // Site supervisor filing for their tree already did the verify step.
    const siteSupervisorFiling = Boolean(
      linked && isSiteSupervisorTitle(linked.jobTitle, linked.staffRole),
    );
    const initialStatus: HrOtStatus = siteSupervisorFiling ? "manager_verified" : "submitted";

    // One OT request (batch + number) per staff — multi-date stays one request.
    const requestByStaff = new Map<string, { requestBatchId: string; requestNumber: string }>();
    for (const staffId of staffIds) {
      requestByStaff.set(staffId, {
        requestBatchId: crypto.randomUUID(),
        requestNumber: await nextOtRequestNumber(context),
      });
    }

    const rows = slots.flatMap((slot) => {
      const staff = staffById.get(slot.staffId);
      const meta = metaByStaff.get(slot.staffId);
      const dayMeta = meta?.byDate.get(slot.workDate);
      const request = requestByStaff.get(slot.staffId);
      if (!staff || !meta || !dayMeta || !request) return [];
      return [
        {
          staff_id: slot.staffId,
          location_id: staff.location_id ?? null,
          work_date: slot.workDate,
          eligible_minutes: dayMeta.claimedMinutes,
          claimed_minutes: dayMeta.claimedMinutes,
          approved_minutes: siteSupervisorFiling ? dayMeta.claimedMinutes : null,
          rate_type: meta.rateType,
          rate_multiplier: meta.rateMultiplier,
          amount_qar: dayMeta.amountQar,
          ...meta.paySnapshot,
          status: initialStatus,
          notes: meta.purpose,
          purpose: meta.purpose,
          claim_source: "supervisor" as const,
          contract_working_days: meta.contractDays,
          request_batch_id: request.requestBatchId,
          request_number: request.requestNumber,
          submitted_by: context.userId,
          submitted_at: now,
          verified_by: siteSupervisorFiling ? context.userId : null,
          verified_at: siteSupervisorFiling ? now : null,
          created_by: context.userId,
        },
      ];
    });

    const { data: inserted, error } = await context.supabase
      .from("hr_ot_claims")
      .insert(rows)
      .select("id, work_date, staff_id, request_batch_id, request_number");
    if (error) {
      if (/hr_ot_claims_active_uq|duplicate key/i.test(error.message)) {
        throw new Error("An active OT claim already exists for this staff, date, and rate type.");
      }
      if (/request_batch_id|request_number|ops_approved|schema cache|does not exist/i.test(error.message)) {
        throw new Error(
          "OT request batching is not available yet. Apply the latest OT migration and retry.",
        );
      }
      throw error;
    }

    for (const row of inserted ?? []) {
      const purpose = metaByStaff.get(String(row.staff_id))?.purpose;
      await appendApproval(context, String(row.id), "submit", "submitted", purpose);
      if (siteSupervisorFiling) {
        await appendApproval(context, String(row.id), "manager", "verified", purpose);
      }
    }

    try {
      const { notifyUsers } = await import("@/lib/notifications/action-notify");
      const locationIds = [
        ...new Set(
          staffIds
            .map((id) => staffById.get(id)?.location_id ?? null)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const notifyLoc = locationIds.length === 1 ? locationIds[0] : null;
      const siteIds = new Set<string>();
      if (!siteSupervisorFiling) {
        for (const staffId of staffIds) {
          const ids = await loadOtSiteSupervisorNotifyUserIds(staffId, {
            excludeUserId: context.userId,
          });
          for (const id of ids) siteIds.add(id);
        }
      }
      const hooIds = siteSupervisorFiling
        ? await loadOtHooNotifyUserIds(context.userId)
        : [];
      const userIds = [...new Set([...siteIds, ...hooIds])];
      const names = staffIds
        .map((id) => String(staffById.get(id)?.full_name ?? "Staff"))
        .slice(0, 5);
      const more = staffIds.length > names.length ? ` +${staffIds.length - names.length}` : "";
      const numbers = staffIds
        .map((id) => requestByStaff.get(id)?.requestNumber)
        .filter(Boolean)
        .slice(0, 5);
      await notifyUsers({
        userIds,
        locationId: notifyLoc,
        category: "hr_ot",
        title: siteSupervisorFiling
          ? "Supervisor OT ready for Head of Operations"
          : "Supervisor OT request",
        body: `${names.join(", ")}${more} · ${dates.join(", ")} · ${staffIds.length} request(s) (${rows.length} day-row(s)) · ${numbers.join(", ")}.`,
        severity: "warning",
        actionUrl: "/people/hr/ot",
        sourceType: "hr_ot_claims",
        sourceId: inserted?.[0] ? String(inserted[0].id) : null,
      });
    } catch {
      /* non-blocking */
    }

    const firstStaffDays = daysByStaff.get(staffIds[0]!) ?? [];
    const firstClaimed = firstStaffDays[0]
      ? Math.round(firstStaffDays[0].hours * 60)
      : 0;
    const requests = staffIds.map((staffId) => {
      const meta = requestByStaff.get(staffId)!;
      return {
        staffId,
        requestBatchId: meta.requestBatchId,
        requestNumber: meta.requestNumber,
        claimIds: (inserted ?? [])
          .filter((row) => String(row.staff_id) === staffId)
          .map((row) => String(row.id)),
      };
    });
    return {
      count: inserted?.length ?? rows.length,
      staffCount: staffIds.length,
      requestCount: requests.length,
      claimedMinutes: firstClaimed,
      ids: (inserted ?? []).map((row) => String(row.id)),
      requestBatchId: requests[0]?.requestBatchId ?? null,
      requestNumber: requests[0]?.requestNumber ?? null,
      requests,
      status: initialStatus,
    };
  },
  SUPERVISOR_OT_AUTH,
);

/**
 * Edit an existing supervisor OT request (per-day hours/dates/purpose/rate).
 * Allowed while `canEditOtBeforeHoo`; when status is `changes_requested`, also
 * resubmits to restart at site supervisor (`submitted`).
 */
export const reviseSupervisorOtRequest = createAuthenticatedAction(
  z
    .object({
      requestBatchId: z.string().uuid().optional().nullable(),
      claimIds: z.array(z.string().uuid()).min(1).max(40).optional(),
      days: z.array(supervisorOtDaySchema).min(1).max(14),
      rateType: z.enum(HR_OT_RATE_TYPES).default("weekday"),
      purpose: z.string().trim().min(3).max(1000),
      /** When true (default) and status is changes_requested, resubmit after edit. */
      resubmit: z.boolean().optional().default(true),
    })
    .refine((d) => Boolean(d.requestBatchId) || Boolean(d.claimIds?.length), {
      message: "requestBatchId or claimIds is required",
    }),
  async (data, context) => {
    const canApprove = canOtApprove(context);
    const canOps = canOtOpsApprove(context);
    const teamScope = await otSiteSupervisorTeamStaffIds(context);
    const claimDb = teamScope || canOps ? supabaseAdmin : context.supabase;

    let existingRows: Array<{
      id: string;
      status: string;
      staff_id: string;
      work_date: string;
      location_id: string | null;
      request_batch_id: string | null;
      request_number: string | null;
      submitted_by: string | null;
      claim_source: string | null;
      rate_type: string;
      contract_working_days: number | null;
    }> = [];

    if (data.claimIds?.length) {
      const { data: byIds, error } = await claimDb
        .from("hr_ot_claims")
        .select(
          "id, status, staff_id, work_date, location_id, request_batch_id, request_number, submitted_by, claim_source, rate_type, contract_working_days",
        )
        .in("id", data.claimIds)
        .order("work_date", { ascending: true });
      if (error) throw error;
      existingRows = (byIds ?? []) as typeof existingRows;
    } else if (data.requestBatchId) {
      const { data: byBatch, error } = await claimDb
        .from("hr_ot_claims")
        .select(
          "id, status, staff_id, work_date, location_id, request_batch_id, request_number, submitted_by, claim_source, rate_type, contract_working_days",
        )
        .eq("request_batch_id", data.requestBatchId)
        .order("work_date", { ascending: true });
      if (error) throw error;
      existingRows = (byBatch ?? []) as typeof existingRows;
      if (!existingRows.length) {
        const single = await claimDb
          .from("hr_ot_claims")
          .select(
            "id, status, staff_id, work_date, location_id, request_batch_id, request_number, submitted_by, claim_source, rate_type, contract_working_days",
          )
          .eq("id", data.requestBatchId)
          .maybeSingle();
        if (single.error) throw single.error;
        existingRows = single.data ? ([single.data] as typeof existingRows) : [];
      }
    }
    if (!existingRows.length) throw new Error("OT request not found.");

    const statuses = new Set(existingRows.map((row) => String(row.status)));
    if (statuses.size !== 1) {
      throw new Error("OT request rows have mixed statuses; refresh and retry.");
    }
    const from = String(existingRows[0]!.status) as HrOtStatus;
    if (!canEditOtBeforeHoo(from) && !canApprove) {
      throw new ForbiddenError("OT request is locked after Head of Operations approval.");
    }

    const staffIds = [...new Set(existingRows.map((row) => String(row.staff_id)))];
    if (staffIds.length !== 1) {
      throw new Error("Revise supports one staff member per OT request.");
    }
    const staffId = staffIds[0]!;
    const isSubmitter = existingRows.some((row) => row.submitted_by === context.userId);
    if (!isSubmitter && !canApprove) {
      throw new ForbiddenError("Only the submitter can edit this OT request.");
    }

    const days = normalizeSupervisorOtDays(data.days);
    if (days.length === 0) {
      throw new Error("Add at least one overtime date with hours.");
    }

    const policy = await loadOtPolicy(context);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;
    const contractDays =
      existingRows[0]!.contract_working_days == null
        ? await readContractWorkingDays(context, staffId)
        : Number(existingRows[0]!.contract_working_days);
    if (!isSupervisorOtContract(contractDays) && existingRows[0]!.claim_source === "supervisor") {
      throw new Error("Supervisor OT requests need a 26- or 28-day contract.");
    }

    const rateType = data.rateType;
    const rateMultiplier = resolveOtRateMultiplier(rateType, policy);
    const pay = await staffPay(staffId);
    const purpose = data.purpose.trim();
    const paySnapshot = otPaySnapshot(pay, policy, contractDays);
    const dayMeta = new Map<
      string,
      { claimedMinutes: number; amountQar: number }
    >();
    for (const day of days) {
      const claimedMinutes = assertMinClaimableMinutes(
        Math.round(day.hours * 60),
        minClaimable,
        rounding,
      );
      dayMeta.set(day.workDate, {
        claimedMinutes,
        amountQar: amountFor(claimedMinutes, rateMultiplier, pay, policy, contractDays),
      });
    }

    const requestBatchId =
      (existingRows[0]!.request_batch_id as string | null) ?? data.requestBatchId ?? null;
    const requestNumber = (existingRows[0]!.request_number as string | null) ?? null;
    const locationId = (existingRows[0]!.location_id as string | null) ?? null;
    const existingByDate = new Map(
      existingRows.map((row) => [String(row.work_date).slice(0, 10), row] as const),
    );
    const nextDates = new Set(days.map((day) => day.workDate));
    const shouldResubmit = Boolean(data.resubmit) && from === "changes_requested";
    const nextStatus: HrOtStatus = shouldResubmit ? "submitted" : from;
    const now = new Date().toISOString();

    // Cancel day-rows removed from the request.
    for (const row of existingRows) {
      const workDate = String(row.work_date).slice(0, 10);
      if (nextDates.has(workDate)) continue;
      const { error } = await claimDb
        .from("hr_ot_claims")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("status", from);
      if (error) throw error;
      await appendApproval(context, String(row.id), "submit", "cancelled", purpose, {
        useAdmin: Boolean(teamScope) || canOps,
      });
    }

    // Block collisions for newly added dates (other active claims).
    const newDates = days.map((d) => d.workDate).filter((d) => !existingByDate.has(d));
    if (newDates.length > 0) {
      const { data: collisions, error: collisionErr } = await claimDb
        .from("hr_ot_claims")
        .select("work_date, status, rate_type")
        .eq("staff_id", staffId)
        .in("work_date", newDates)
        .eq("rate_type", rateType);
      if (collisionErr) throw collisionErr;
      const blocked = (collisions ?? []).filter(
        (row) => row.status !== "rejected" && row.status !== "cancelled",
      );
      if (blocked.length > 0) {
        throw new Error(
          `An active OT claim already exists for ${blocked
            .map((row) => String(row.work_date).slice(0, 10))
            .join(", ")}.`,
        );
      }
    }

    const keptIds: string[] = [];
    for (const day of days) {
      const meta = dayMeta.get(day.workDate)!;
      const prior = existingByDate.get(day.workDate);
      if (prior) {
        const patch: Record<string, unknown> = {
          claimed_minutes: meta.claimedMinutes,
          eligible_minutes: meta.claimedMinutes,
          amount_qar: meta.amountQar,
          rate_type: rateType,
          rate_multiplier: rateMultiplier,
          purpose,
          notes: purpose,
          ...paySnapshot,
          status: nextStatus,
          approved_minutes: null,
          updated_at: now,
        };
        if (shouldResubmit) {
          patch.submitted_by = prior.submitted_by ?? context.userId;
          patch.submitted_at = now;
          patch.verified_by = null;
          patch.verified_at = null;
          patch.ops_approved_by = null;
          patch.ops_approved_at = null;
          patch.approved_by = null;
          patch.approved_at = null;
        }
        const { error } = await claimDb
          .from("hr_ot_claims")
          .update(patch)
          .eq("id", prior.id)
          .eq("status", from);
        if (error) throw error;
        await appendApproval(
          context,
          String(prior.id),
          "submit",
          shouldResubmit ? "resubmitted" : "revised",
          purpose,
          { useAdmin: Boolean(teamScope) || canOps },
        );
        keptIds.push(String(prior.id));
      } else {
        const { data: inserted, error } = await claimDb
          .from("hr_ot_claims")
          .insert({
            staff_id: staffId,
            location_id: locationId,
            work_date: day.workDate,
            eligible_minutes: meta.claimedMinutes,
            claimed_minutes: meta.claimedMinutes,
            approved_minutes: null,
            rate_type: rateType,
            rate_multiplier: rateMultiplier,
            amount_qar: meta.amountQar,
            ...paySnapshot,
            status: nextStatus,
            notes: purpose,
            purpose,
            claim_source: existingRows[0]!.claim_source ?? "supervisor",
            contract_working_days: contractDays,
            request_batch_id: requestBatchId,
            request_number: requestNumber,
            submitted_by: existingRows[0]!.submitted_by ?? context.userId,
            submitted_at: now,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (error) {
          if (/hr_ot_claims_active_uq|duplicate key/i.test(error.message)) {
            throw new Error("An active OT claim already exists for this staff, date, and rate type.");
          }
          throw error;
        }
        await appendApproval(
          context,
          String(inserted.id),
          "submit",
          shouldResubmit ? "resubmitted" : "revised",
          purpose,
          { useAdmin: Boolean(teamScope) || canOps },
        );
        keptIds.push(String(inserted.id));
      }
    }

    if (shouldResubmit) {
      try {
        const { notifyUsers } = await import("@/lib/notifications/action-notify");
        const ids = await otSubmittedNotifyUserIds({
          staffId,
          locationId,
          excludeUserId: context.userId,
        });
        const datesLabel = days.map((d) => d.workDate).join(", ");
        await notifyUsers({
          userIds: ids,
          locationId,
          category: "hr_ot",
          title: "OT request resubmitted",
          body: `OT request (${days.length} day(s): ${datesLabel}) was edited and resubmitted and needs site supervisor approval.`,
          severity: "warning",
          actionUrl: "/people/hr/ot",
          sourceType: "hr_ot_claims",
          sourceId: keptIds[0] ?? null,
        });
      } catch {
        /* non-blocking */
      }
    }

    return {
      ok: true as const,
      status: nextStatus,
      count: keptIds.length,
      claimIds: keptIds,
      requestBatchId,
      requestNumber,
      resubmitted: shouldResubmit,
    };
  },
  { auth: { anyCapability: ["hr.ot.submit", "hr.ot.verify", "hr.ot.approve"] } },
);
