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
  resolveEligibleOtMinutes,
  resolveOtRateMultiplier,
  type HrOtActor,
  type HrOtRateType,
  type HrOtRounding,
  type HrOtStatus,
} from "@/lib/hr-ot";
import { policyNumber } from "@/lib/hr-policy";
import { readPolicySection } from "@/lib/hr-policy-read";
import { canUserDo } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/server/authorize";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  type AuthContext,
} from "@/lib/server/create-action";

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id, employment_type, department")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
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
) {
  const { error } = await context.supabase.from("hr_ot_claim_approvals").insert({
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
) {
  const hourly = hourlyRateFromPay({
    monthlyBasicQar: pay.monthlyBasicQar,
    dailyRateQar: pay.dailyRateQar,
    hoursPerDay: policyNumber(policy.hours_per_day, 8),
    daysPerMonth: policyNumber(policy.days_per_month, 30),
  });
  return computeOtAmountQar({
    approvedMinutes: minutes,
    rateMultiplier,
    hourlyRateQar: hourly,
  });
}

const CLAIM_SELECT =
  "id, staff_id, location_id, work_date, attendance_daily_id, scheduled_in, scheduled_out, actual_in, actual_out, eligible_minutes, claimed_minutes, approved_minutes, rate_type, rate_multiplier, amount_qar, status, evidence_path, notes, created_at, staff(full_name, employee_code, user_id, location_id, employment_type, department), locations(id, code, name)";

export const listOtClaims = createAuthenticatedAction(
  z.object({
    status: z.enum([...HR_OT_STATUSES, "all", "queue"]).optional().nullable(),
    mineOnly: z.boolean().optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().nullable(),
    staffId: z.string().uuid().optional().nullable(),
  }),
  async (data, context) => {
    const canApprove = canUserDo(context.roles ?? [], "hr.ot.approve");
    const canVerify = canUserDo(context.roles ?? [], "hr.ot.verify");
    const canSubmit = canUserDo(context.roles ?? [], "hr.ot.submit");
    if (!canApprove && !canVerify && !canSubmit) {
      throw new ForbiddenError("Missing OT permission.");
    }

    const mine = await myStaff(context);
    let query = context.supabase
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .order("work_date", { ascending: false })
      .limit(200);

    if (data.mineOnly || (!canApprove && !canVerify)) {
      if (!mine?.id) return [];
      query = query.eq("staff_id", mine.id);
    } else if (data.staffId) {
      query = query.eq("staff_id", data.staffId);
    }

    if (data.status === "queue") {
      query = query.in("status", ["submitted", "manager_verified"]);
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
    const canSee =
      canUserDo(context.roles ?? [], "hr.ot.approve") ||
      canUserDo(context.roles ?? [], "hr.ot.verify");
    if (!canSee) throw new ForbiddenError("OT summaries require verify or approve.");

    const start = `${data.month}-01`;
    const [y, m] = data.month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    const { data: rows, error } = await context.supabase
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .gte("work_date", start)
      .lte("work_date", end)
      .limit(1000);
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
    const canApprove = canUserDo(context.roles ?? [], "hr.ot.approve");
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
    const eligible = isOtEligible({
      employmentCategory: category,
      staffId,
      policy,
    });

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
    const canApprove = canUserDo(context.roles ?? [], "hr.ot.approve");
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
    const { data: existing, error: readErr } = await context.supabase
      .from("hr_ot_claims")
      .select(CLAIM_SELECT)
      .eq("id", data.claimId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("OT claim not found.");

    const from = String(existing.status) as HrOtStatus;
    const mine = await myStaff(context);
    const canVerify = canUserDo(context.roles ?? [], "hr.ot.verify");
    const canApprove = canUserDo(context.roles ?? [], "hr.ot.approve");
    const isOwner = mine?.id === existing.staff_id;

    const policy = await loadOtPolicy(context);
    const minClaimable = policyNumber(policy.min_claimable_minutes, 60);
    const rounding = String(policy.rounding ?? "down") as HrOtRounding;
    const pay = await staffPay(context, String(existing.staff_id));
    const rateMultiplier = Number(existing.rate_multiplier ?? 1);

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
      patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy);
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
      patch.amount_qar = amountFor(mins, rateMultiplier, pay, policy);
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
      approvalStep = "hr";
      approvalAction = "approved";
    } else if (data.action === "reject") {
      if (!canVerify && !canApprove) throw new ForbiddenError("Cannot reject OT claim.");
      actor = canApprove && from === "manager_verified" ? "hr" : "manager";
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

    const { data: updated, error } = await context.supabase
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

    await appendApproval(context, data.claimId, approvalStep, approvalAction, data.note);

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
