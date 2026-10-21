"use server";

import { z } from "zod";

import { computeAttendanceOvertimeMinutes } from "@/lib/attendance-hr/overtime";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import {
  aggregateOtSummaries,
  assertCanMarkPayrollPosted,
  assertMinClaimableMinutes,
  assertOtTransition,
  computeOtAmountQar,
  hourlyRateFromPay,
  HR_OT_RATE_TYPES,
  HR_OT_STATUSES,
  isOtEligible,
  isSupervisorOtContract,
  otApprovalQueueStatuses,
  otPayDaysPerMonth,
  resolveEligibleOtMinutes,
  resolveOtRateMultiplier,
  supervisorOtClaimSlots,
  supervisorOtContractMessage,
  type HrOtActor,
  type HrOtRateType,
  type HrOtRounding,
  type HrOtStatus,
} from "@/lib/hr-ot";
import { policyNumber } from "@/lib/hr-policy";
import { readPolicySection } from "@/lib/hr-policy-read";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canActorPerform } from "@/lib/arcade/access";
import { isSiteSupervisorTitle } from "@/lib/attendance-hr/missed-punch-approval";
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
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
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
    status: String(row.status) as HrOtStatus,
    evidencePath: (row.evidence_path as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? (row.notes as string | null) ?? null,
    claimSource: (row.claim_source as string | null) ?? "attendance",
    contractWorkingDays:
      row.contract_working_days == null ? null : Number(row.contract_working_days),
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

async function staffPay(context: AuthContext, staffId: string) {
  const { data: comp } = await context.supabase
    .from("staff_compensation")
    .select("monthly_salary_qar, daily_rate_qar")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (comp) {
    return {
      monthlyBasicQar: comp.monthly_salary_qar == null ? null : Number(comp.monthly_salary_qar),
      dailyRateQar: comp.daily_rate_qar == null ? null : Number(comp.daily_rate_qar),
    };
  }
  const { data: hist } = await context.supabase
    .from("staff_salary_history")
    .select("basic_qar, monthly_total_qar, daily_rate_qar")
    .eq("staff_id", staffId)
    .order("effective_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    monthlyBasicQar:
      hist?.basic_qar != null
        ? Number(hist.basic_qar)
        : hist?.monthly_total_qar != null
          ? Number(hist.monthly_total_qar)
          : null,
    dailyRateQar: hist?.daily_rate_qar == null ? null : Number(hist.daily_rate_qar),
  };
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

function amountFor(
  minutes: number,
  rateMultiplier: number,
  pay: { monthlyBasicQar: number | null; dailyRateQar: number | null },
  policy: Record<string, unknown>,
  contractWorkingDays?: number | null,
) {
  const hourly = hourlyRateFromPay({
    monthlyBasicQar: pay.monthlyBasicQar,
    dailyRateQar: pay.dailyRateQar,
    hoursPerDay: policyNumber(policy.hours_per_day, 8),
    daysPerMonth: otPayDaysPerMonth({
      contractWorkingDays,
      policyDaysPerMonth: policyNumber(policy.days_per_month, 30),
    }),
  });
  return computeOtAmountQar({
    approvedMinutes: minutes,
    rateMultiplier,
    hourlyRateQar: hourly,
  });
}

const CLAIM_SELECT =
  "id, staff_id, location_id, work_date, attendance_daily_id, scheduled_in, scheduled_out, actual_in, actual_out, eligible_minutes, claimed_minutes, approved_minutes, rate_type, rate_multiplier, amount_qar, status, evidence_path, notes, purpose, claim_source, contract_working_days, created_at, staff(full_name, employee_code, user_id, location_id, employment_type, department), locations(id, code, name)";

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
    let query = claimDb
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .order("work_date", { ascending: false })
      .limit(200);

    if (data.mineOnly || (!canApprove && !canVerify)) {
      if (!mine?.id) return [];
      query = query.eq("staff_id", mine.id);
    } else if (teamScope) {
      if (teamScope.length === 0) return [];
      if (data.staffId) {
        if (!teamScope.includes(data.staffId)) return [];
        query = query.eq("staff_id", data.staffId);
      } else {
        query = query.in("staff_id", teamScope);
      }
    } else if (data.staffId) {
      query = query.eq("staff_id", data.staffId);
    }

    if (data.status === "queue") {
      query = query.in("status", [...otApprovalQueueStatuses(canApprove)]);
    } else if (data.status && data.status !== "all") {
      query = query.eq("status", data.status);
    }

    if (data.month) {
      const start = `${data.month}-01`;
      const [y, m] = data.month.split("-").map(Number);
      const endDate = new Date(Date.UTC(y, m, 0));
      const end = endDate.toISOString().slice(0, 10);
      query = query.gte("work_date", start).lte("work_date", end);
    }

    const { data: rows, error } = await query;
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((r) => mapClaimRow(r as Record<string, unknown>));
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

    const mapped = (rows ?? []).map((r) => {
      const claim = mapClaimRow(r as Record<string, unknown>);
      return {
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
      };
    });
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
    const pay = await staffPay(context, staffId);
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
    const pay = await staffPay(context, staffId);
    const amountQar = amountFor(claimedMinutes, rateMultiplier, pay, policy);
    const status: HrOtStatus = data.asDraft ? "draft" : "submitted";

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
        status,
        evidence_path: data.evidencePath ?? null,
        notes: data.notes ?? null,
        purpose: data.notes ?? null,
        claim_source: "attendance",
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

export const actOnOtClaim = createAuthenticatedAction(
  z.object({
    claimId: z.string().uuid(),
    action: z.enum([
      "submit",
      "verify",
      "approve",
      "reject",
      "cancel",
      "payroll_posted",
    ]),
    approvedMinutes: z.number().int().positive().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const teamScope = await otSiteSupervisorTeamStaffIds(context);
    // Team-scoped site supervisors use admin read (same as listOtClaims) so RLS
    // that keys only on staff.user_id does not hide claims when the login links
    // via employee_code / name fallback.
    const claimDb = teamScope ? supabaseAdmin : context.supabase;
    const { data: existing, error: readErr } = await claimDb
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .eq("id", data.claimId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("OT claim not found.");

    const from = String(existing.status) as HrOtStatus;
    const mine = await myStaff(context);
    const canVerify = canOtVerify(context);
    const canApprove = canOtApprove(context);
    const isOwner = mine?.id === existing.staff_id;

    const policy = await loadOtPolicy(context);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;
    const pay = await staffPay(context, String(existing.staff_id));
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

    if (data.action === "submit") {
      if (!isOwner && !canApprove) throw new ForbiddenError("Only the employee can submit this claim.");
      actor = "employee";
      to = "submitted";
      assertOtTransition(from, to, actor);
      patch.status = to;
      patch.submitted_by = context.userId;
      patch.submitted_at = new Date().toISOString();
      approvalStep = "submit";
      approvalAction = "submitted";
    } else if (data.action === "verify") {
      if (!canVerify && !canApprove) throw new ForbiddenError("Manager verification required.");
      await assertOtClaimInSiteSupervisorTeam(context, String(existing.staff_id));
      actor = "manager";
      to = "manager_verified";
      assertOtTransition(from, to, canApprove ? "hr" : actor);
      const mins = assertMinClaimableMinutes(
        data.approvedMinutes ?? Number(existing.claimed_minutes ?? 0),
        minClaimable,
        rounding,
      );
      patch.status = to;
      patch.approved_minutes = mins;
      patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy, contractDays);
      patch.verified_by = context.userId;
      patch.verified_at = new Date().toISOString();
      approvalStep = "manager";
      approvalAction = "verified";
    } else if (data.action === "approve") {
      if (!canApprove) throw new ForbiddenError("HR approval required.");
      actor = "hr";
      to = "hr_approved";
      assertOtTransition(from, to, actor);
      const mins = assertMinClaimableMinutes(
        data.approvedMinutes ??
          Number(existing.approved_minutes ?? existing.claimed_minutes ?? 0),
        minClaimable,
        rounding,
      );
      patch.status = to;
      patch.approved_minutes = mins;
      patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy, contractDays);
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
      approvalStep = "hr";
      approvalAction = "approved";
    } else if (data.action === "reject") {
      if (!canVerify && !canApprove) throw new ForbiddenError("Cannot reject OT claim.");
      actor = canApprove && from === "manager_verified" ? "hr" : "manager";
      if (actor === "manager") {
        await assertOtClaimInSiteSupervisorTeam(context, String(existing.staff_id));
      }
      to = "rejected";
      assertOtTransition(from, to, actor);
      patch.status = to;
      approvalStep = actor === "hr" ? "hr" : "manager";
      approvalAction = "rejected";
    } else if (data.action === "cancel") {
      if (!isOwner && !canApprove) throw new ForbiddenError("Cannot cancel this OT claim.");
      actor = isOwner ? "employee" : "hr";
      to = "cancelled";
      assertOtTransition(from, to, actor);
      patch.status = to;
      approvalStep = "submit";
      approvalAction = "cancelled";
    } else if (data.action === "payroll_posted") {
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
      .eq("id", data.claimId)
      .eq("status", from)
      .select("status")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      if (data.action === "payroll_posted") {
        throw new Error("OT claim is already payroll_posted.");
      }
      throw new Error("OT claim status changed; refresh and retry.");
    }

    await appendApproval(context, data.claimId, approvalStep, approvalAction, data.note, {
      useAdmin: Boolean(teamScope),
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
        sourceId: data.claimId,
      });
    }
    if (to === "rejected") {
      await appendEmployeeEvent(context, {
        staffId: String(existing.staff_id),
        eventType: "ot_rejected",
        effectiveOn: String(existing.work_date).slice(0, 10),
        payload: { rate_type: existing.rate_type, note: data.note ?? null },
        sourceTable: "hr_ot_claims",
        sourceId: data.claimId,
      });
    }

    if (to === "submitted" || to === "manager_verified" || to === "hr_approved" || to === "rejected") {
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
            title: "OT claim submitted",
            body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} needs site supervisor approval.`,
            severity: "warning",
            actionUrl: "/people/hr/ot",
            sourceType: "hr_ot_claims",
            sourceId: data.claimId,
          });
        } else if (to === "manager_verified") {
          const ids = await findUsersWithCapability("hr.ot.approve", locId);
          await notifyUsers({
            userIds: ids,
            locationId: locId,
            category: "hr_ot",
            title: "OT claim ready for HR",
            body: `OT for ${staffName} on ${String(existing.work_date).slice(0, 10)} was site supervisor approved and needs HR.`,
            severity: "warning",
            actionUrl: "/people/hr/ot",
            sourceType: "hr_ot_claims",
            sourceId: data.claimId,
          });
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
            sourceId: data.claimId,
          });
        }
      } catch {
        /* non-blocking */
      }
    }

    return { ok: true as const, status: to };
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

export const submitSupervisorOtClaim = createAuthenticatedAction(
  z.object({
    entries: z
      .array(
        z.object({
          staffId: z.string().uuid(),
          workDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(14),
          hours: z.number().gt(0).max(24),
          rateType: z.enum(HR_OT_RATE_TYPES).default("weekday"),
          purpose: z.string().trim().min(3).max(1000),
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

    type StaffClaimMeta = {
      claimedMinutes: number;
      rateType: HrOtRateType;
      rateMultiplier: number;
      purpose: string;
      amountQar: number;
    };
    const metaByStaff = new Map<string, StaffClaimMeta>();
    for (const entry of data.entries) {
      const contractDays = contractByStaff.get(entry.staffId);
      if (!isSupervisorOtContract(contractDays)) continue;
      const claimedMinutes = assertMinClaimableMinutes(
        Math.round(entry.hours * 60),
        minClaimable,
        rounding,
      );
      const rateMultiplier = resolveOtRateMultiplier(entry.rateType, policy);
      const pay = await staffPay(context, entry.staffId);
      metaByStaff.set(entry.staffId, {
        claimedMinutes,
        rateType: entry.rateType,
        rateMultiplier,
        purpose: entry.purpose.trim(),
        amountQar: amountFor(claimedMinutes, rateMultiplier, pay, policy, contractDays),
      });
    }

    const slots = supervisorOtClaimSlots(
      data.entries.map((entry) => ({
        staffId: entry.staffId,
        workDates: entry.workDates,
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

    const rows = slots.flatMap((slot) => {
      const staff = staffById.get(slot.staffId);
      const contractDays = contractByStaff.get(slot.staffId);
      const meta = metaByStaff.get(slot.staffId);
      if (!staff || !isSupervisorOtContract(contractDays) || !meta) return [];
      return [
        {
          staff_id: slot.staffId,
          location_id: staff.location_id ?? null,
          work_date: slot.workDate,
          eligible_minutes: meta.claimedMinutes,
          claimed_minutes: meta.claimedMinutes,
          approved_minutes: siteSupervisorFiling ? meta.claimedMinutes : null,
          rate_type: meta.rateType,
          rate_multiplier: meta.rateMultiplier,
          amount_qar: meta.amountQar,
          status: initialStatus,
          notes: meta.purpose,
          purpose: meta.purpose,
          claim_source: "supervisor" as const,
          contract_working_days: contractDays,
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
      .select("id, work_date, staff_id");
    if (error) {
      if (/hr_ot_claims_active_uq|duplicate key/i.test(error.message)) {
        throw new Error("An active OT claim already exists for this staff, date, and rate type.");
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
      const { findUsersWithCapability, notifyUsers } = await import("@/lib/notifications/action-notify");
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
      const hrIds = await findUsersWithCapability("hr.ot.approve", notifyLoc);
      const userIds = [...new Set([...siteIds, ...hrIds])];
      const names = staffIds
        .map((id) => String(staffById.get(id)?.full_name ?? "Staff"))
        .slice(0, 5);
      const more = staffIds.length > names.length ? ` +${staffIds.length - names.length}` : "";
      await notifyUsers({
        userIds,
        locationId: notifyLoc,
        category: "hr_ot",
        title: siteSupervisorFiling
          ? "Supervisor OT ready for HR"
          : "Supervisor OT request",
        body: `${names.join(", ")}${more} · ${dates.join(", ")} · ${rows.length} claim(s) · ${staffIds.length} staff.`,
        severity: "warning",
        actionUrl: "/people/hr/ot",
        sourceType: "hr_ot_claims",
        sourceId: inserted?.[0] ? String(inserted[0].id) : null,
      });
    } catch {
      /* non-blocking */
    }

    const firstClaimed = metaByStaff.get(staffIds[0]!)?.claimedMinutes ?? 0;
    return {
      count: inserted?.length ?? rows.length,
      staffCount: staffIds.length,
      claimedMinutes: firstClaimed,
      ids: (inserted ?? []).map((row) => String(row.id)),
    };
  },
  SUPERVISOR_OT_AUTH,
);
