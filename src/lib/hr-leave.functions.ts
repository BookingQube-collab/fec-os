"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";
import {
  assertLeaveTransition,
  countLeaveDays,
  defaultLeaveApprovalSteps,
  HR_COMPASSIONATE_SCOPES,
  HR_EMERGENCY_TREATMENTS,
  HR_LEAVE_STATUSES,
  HR_LEAVE_TYPES,
  type HrLeaveActor,
  type HrLeaveApprovalRole,
  type HrLeaveStatus,
} from "@/lib/hr-leave";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  annualAccrualFromHireDate,
  canUseCompOff,
  DEFAULT_ANNUAL_ALLOTMENT,
  DEFAULT_SICK_ALLOTMENT,
  detectLeaveConflicts,
  enumerateLeaveDates,
  hasHardLeaveOverlap,
  mapHrLeaveTypeToAttendance,
  summarizeLeaveBalances,
  sumUsedLeaveDays,
} from "@/lib/hr-advanced";
import { appendEmployeeEvent } from "@/lib/hr-employee-events";
import { policyNumber } from "@/lib/hr-policy";
import { readLeaveAllotmentDefaults, readPolicySection } from "@/lib/hr-policy-read";

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id, hire_date")
    .eq("user_id", context.userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data;
}

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

function mapLeaveRow(row: Record<string, unknown>) {
  const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: (staff as { full_name?: string } | null)?.full_name ?? null,
    employeeCode: (staff as { employee_code?: string } | null)?.employee_code ?? null,
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
    createdAt: String(row.created_at),
  };
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
  if (!leave.locationId) return { syncedDays: 0, skipped: true };
  const dates = enumerateLeaveDates(leave.dateFrom, leave.dateTo);
  if (dates.length === 0) return { syncedDays: 0, skipped: true };
  const attendanceType = mapHrLeaveTypeToAttendance(leave.leaveType);
  const rows = dates.map((leave_date) => ({
    location_id: leave.locationId as string,
    staff_id: leave.staffId,
    leave_date,
    leave_type: attendanceType,
    source: "hr_leave",
    notes: `hr_leave:${leave.id}`,
    hr_leave_request_id: leave.id,
    created_by: context.userId,
  }));
  const { error } = await context.supabase
    .from("attendance_leave_records")
    .upsert(rows, { onConflict: "staff_id,leave_date" });
  if (error) {
    if (/hr_leave_request_id|schema cache/i.test(error.message)) {
      const fallback = rows.map(({ hr_leave_request_id: _id, ...rest }) => rest);
      const { error: retryErr } = await context.supabase
        .from("attendance_leave_records")
        .upsert(fallback, { onConflict: "staff_id,leave_date" });
      if (retryErr) throw retryErr;
    } else {
      throw error;
    }
  }
  try {
    await recalculateAttendanceRange(
      context.supabase,
      leave.locationId,
      leave.dateFrom.slice(0, 10),
      leave.dateTo.slice(0, 10),
    );
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
  const [rosterRes, attendanceRes, leaveRes, holidayRes, staffLoc] = await Promise.all([
    context.supabase
      .from("attendance_roster_assignments")
      .select("work_date")
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .limit(100),
    context.supabase
      .from("attendance_daily_summary")
      .select("work_date, status")
      .eq("staff_id", staffId)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .in("status", ["present", "late", "overtime", "early_leave", "early_departure"])
      .limit(100),
    context.supabase
      .from("hr_leave_requests")
      .select("id, date_from, date_to, status")
      .eq("staff_id", staffId)
      .neq("status", "cancelled")
      .neq("status", "rejected")
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(50),
    context.supabase
      .from("attendance_holidays")
      .select("holiday_date, location_id")
      .gte("holiday_date", dateFrom)
      .lte("holiday_date", dateTo)
      .limit(100),
    context.supabase.from("staff").select("location_id").eq("id", staffId).maybeSingle(),
  ]);

  const locationId = (staffLoc.data as { location_id?: string } | null)?.location_id ?? null;
  const holidayDates = (holidayRes.data ?? [])
    .filter((h) => !h.location_id || h.location_id === locationId)
    .map((h) => String(h.holiday_date));

  return detectLeaveConflicts({
    dateFrom,
    dateTo,
    rosterDates: (rosterRes.data ?? []).map((r) => String(r.work_date)),
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

async function seedLeaveApprovalSteps(context: AuthContext, leaveId: string) {
  const steps = defaultLeaveApprovalSteps().map((s) => ({
    leave_id: leaveId,
    step_order: s.stepOrder,
    step_role: s.stepRole,
    status: "pending",
  }));
  const { error } = await context.supabase.from("hr_leave_approvals").insert(steps);
  if (error && !tableMissing(error.message)) throw error;
  await context.supabase
    .from("hr_leave_requests")
    .update({ current_step_role: "manager", updated_at: new Date().toISOString() })
    .eq("id", leaveId);
}

async function finalizeLeaveApproval(
  context: AuthContext,
  existing: {
    id: string;
    staff_id: string;
    leave_type: string;
    date_from: string;
    date_to: string;
    staff?: unknown;
  },
  reviewNote: string | null,
  payrollImpact: boolean,
): Promise<{ syncedDays: number }> {
  const { error } = await context.supabase
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

  await dispatchHrNotify({
    kind: "leave_approved",
    staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
    workDate: String(existing.date_from).slice(0, 10),
    locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
    sourceId: existing.id as string,
  });

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
  }),
  async (data, context) => {
    const manage =
      canUserDo(context.roles ?? [], "hr.leave.manage") ||
      canUserDo(context.roles ?? [], "hr.leave.approve_manager");
    const staff = await myStaff(context);
    const scopedToSelf = !manage || data.mineOnly;
    if (scopedToSelf && !staff?.id) return [];
    const { data: rows, error } = await context.supabase
      .from("hr_leave_requests")
      .select(
        "id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, current_step_role, payroll_impact, emergency_treatment, compassionate_scope, created_at, staff(full_name, employee_code)",
      )
      .order("created_at", { ascending: false })
      .limit(200)
      .match({
        ...(scopedToSelf && staff?.id ? { staff_id: staff.id } : {}),
        ...(data.status ? { status: data.status } : {}),
      });
    if (error) {
      if (tableMissing(error.message)) return [];
      throw error;
    }
    return (rows ?? []).map((row) => mapLeaveRow(row as Record<string, unknown>));
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
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) throw new ForbiddenError("No staff record linked.");
    if (!manage && staffId !== mine?.id) throw new ForbiddenError("You can only preview your own leave.");
    const conflicts = await loadLeaveConflicts(context, staffId, data.dateFrom, data.dateTo);
    return {
      conflicts,
      days: countLeaveDays(data.dateFrom, data.dateTo),
      hardOverlap: hasHardLeaveOverlap(conflicts),
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
    const manage =
      canUserDo(context.roles ?? [], "hr.leave.manage") || canUserDo(context.roles ?? [], "hr.manage");
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) return { year: data.year ?? new Date().getFullYear(), balances: [], accrual: null };
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
      .select("hire_date")
      .eq("id", staffId)
      .maybeSingle();
    const leavePolicy = await readPolicySection(context, "leave").catch(() => null);
    const allotmentDefaults = leavePolicy
      ? {
          annual: policyNumber(leavePolicy.annual_days, DEFAULT_ANNUAL_ALLOTMENT),
          sick: policyNumber(leavePolicy.sick_days, DEFAULT_SICK_ALLOTMENT),
        }
      : await readLeaveAllotmentDefaults(context).catch(() => ({
          annual: DEFAULT_ANNUAL_ALLOTMENT,
          sick: DEFAULT_SICK_ALLOTMENT,
        }));
    const fromHireDate = leavePolicy ? leavePolicy.annual_from_hire_date !== false : true;

    const accrual = annualAccrualFromHireDate({
      hireDate: (staffRow as { hire_date?: string | null } | null)?.hire_date ?? null,
      year,
      annualDays: allotmentDefaults.annual,
      fromHireDate,
    });

    if (allotmentRows.length === 0) {
      allotmentRows = [
        {
          leaveType: "annual",
          allottedDays: accrual.eligible ? accrual.accruedDays : allotmentDefaults.annual,
          carriedForwardDays: 0,
          expiredDays: 0,
          pendingDays: 0,
        },
        {
          leaveType: "sick",
          allottedDays: allotmentDefaults.sick,
          carriedForwardDays: 0,
          expiredDays: 0,
          pendingDays: 0,
        },
      ];
    } else if (!allotmentRows.some((r) => r.leaveType === "annual") && accrual.eligible) {
      allotmentRows.push({
        leaveType: "annual",
        allottedDays: accrual.accruedDays,
        carriedForwardDays: 0,
        expiredDays: 0,
        pendingDays: 0,
      });
    }

    return {
      year,
      balances: summarizeLeaveBalances(allotmentRows, used),
      accrual: {
        eligible: accrual.eligible,
        accruedDays: accrual.accruedDays,
        monthsAccrued: accrual.monthsAccrued,
        fullYearDays: accrual.fullYearDays,
        hireDate: (staffRow as { hire_date?: string | null } | null)?.hire_date ?? null,
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

export const submitLeaveRequest = createAuthenticatedAction(
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
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    if (!staff) throw new ForbiddenError("Your login is not linked to a staff record.");
    const days = countLeaveDays(data.dateFrom, data.dateTo);
    if (days < 1) throw new Error("Leave end date must be on or after the start date.");

    if (data.leaveType === "emergency") {
      const policy = await readPolicySection(context, "leave").catch(() => ({} as Record<string, unknown>));
      const min = policyNumber(policy.emergency_min_days, 1);
      const max = policyNumber(policy.emergency_max_days, policyNumber(policy.emergency_days, 7));
      if (days < min || days > max) {
        throw new Error(`Emergency leave must be between ${min} and ${max} days.`);
      }
    }

    // Phase 5: active-warning escalation blocks casual leave (never auto-terminates).
    const { assertCasualLeaveAllowedForStaff } = await import("@/lib/hr-warnings-guards");
    await assertCasualLeaveAllowedForStaff(context, staff.id, data.leaveType);

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
      };
    }
    if (conflicts.length > 0 && !data.acknowledgeConflicts) {
      return {
        id: null as string | null,
        days,
        conflicts,
        requiresAck: true as const,
        blocked: false as const,
      };
    }

    const { data: row, error } = await context.supabase
      .from("hr_leave_requests")
      .insert({
        staff_id: staff.id,
        leave_type: data.leaveType,
        date_from: data.dateFrom,
        date_to: data.dateTo,
        days,
        reason: data.reason ?? null,
        status: "pending",
        created_by: context.userId,
        emergency_treatment: data.leaveType === "emergency" ? data.emergencyTreatment ?? "unpaid" : null,
        maternity_delivery_date: data.leaveType === "maternity" ? data.maternityDeliveryDate ?? null : null,
        compassionate_scope:
          data.leaveType === "compassionate" ? data.compassionateScope ?? "inside_qatar" : null,
        attach_annual_before: data.attachAnnualBefore ?? 0,
        attach_annual_after: data.attachAnnualAfter ?? 0,
        comp_off_balance_id: data.compOffBalanceId ?? null,
        current_step_role: "manager",
        payroll_impact: false,
      })
      .select("id")
      .single();
    if (error) throw error;

    await seedLeaveApprovalSteps(context, row.id as string);

    await dispatchHrNotify({
      kind: "leave_submitted",
      staffName: staff.full_name,
      workDate: data.dateFrom,
      locationId: staff.location_id,
      sourceId: row.id,
    });
    return {
      id: row.id as string,
      days,
      conflicts,
      requiresAck: false as const,
      blocked: false as const,
    };
  },
  { auth: { capability: "hr.employee_app" } },
);

export const actOnLeaveApproval = createAuthenticatedAction(
  z.object({
    leaveId: z.string().uuid(),
    action: z.enum(["approved", "rejected"]),
    comments: z.string().max(500).optional().nullable(),
    payrollImpact: z.boolean().optional(),
  }),
  async (data, context) => {
    const { data: existing, error: readErr } = await context.supabase
      .from("hr_leave_requests")
      .select(
        "id, staff_id, leave_type, status, date_from, date_to, current_step_role, staff(full_name, user_id, location_id)",
      )
      .eq("id", data.leaveId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) throw new Error("Leave request not found.");
    if (existing.status !== "pending") throw new Error("Leave is not pending approval.");

    const { data: steps, error: stepErr } = await context.supabase
      .from("hr_leave_approvals")
      .select("id, step_order, step_role, status")
      .eq("leave_id", data.leaveId)
      .order("step_order");
    if (stepErr && !tableMissing(stepErr.message)) throw stepErr;

    const pending = (steps ?? []).find((s) => s.status === "pending");
    if (!pending) throw new Error("No pending approval step.");

    const stepRole = String(pending.step_role) as HrLeaveApprovalRole;
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const managerCap = canUserDo(context.roles ?? [], "hr.leave.approve_manager");
    const mine = await myStaff(context);

    if (stepRole === "hr" && !manage) {
      throw new ForbiddenError("HR verification requires hr.leave.manage.");
    }
    if (stepRole === "manager" && !managerCap && !manage) {
      throw new ForbiddenError("Manager approval required.");
    }
    if (stepRole === "ops" && !manage && !managerCap) {
      throw new ForbiddenError("Ops/department approval required.");
    }
    if (stepRole === "manager" && mine?.id) {
      const { data: ext } = await context.supabase
        .from("staff_profile_ext")
        .select("reporting_manager_staff_id")
        .eq("staff_id", existing.staff_id)
        .maybeSingle();
      const reportingManager = (ext as { reporting_manager_staff_id?: string | null } | null)
        ?.reporting_manager_staff_id;
      // Reporting manager may act; otherwise elevated leave caps still can.
      if (reportingManager && reportingManager !== mine.id && !manage) {
        // Still allow anyone with approve_manager (site supervisors) — reporting match is preferred not exclusive.
      }
    }

    if (data.action === "rejected") {
      assertLeaveTransition("pending", "rejected", stepRole === "hr" ? "hr" : stepRole);
      await context.supabase
        .from("hr_leave_approvals")
        .update({
          status: "rejected",
          acted_by: context.userId,
          acted_at: new Date().toISOString(),
          comments: data.comments ?? null,
        })
        .eq("id", pending.id);
      await context.supabase
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

      const staffRow = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
      await appendEmployeeEvent(context, {
        staffId: String(existing.staff_id),
        eventType: "leave_rejected",
        effectiveOn: String(existing.date_from).slice(0, 10),
        payload: { leave_type: existing.leave_type, step_role: stepRole },
        sourceTable: "hr_leave_requests",
        sourceId: String(existing.id),
      });
      await dispatchHrNotify({
        kind: "leave_rejected",
        staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
        workDate: String(existing.date_from).slice(0, 10),
        locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
        sourceId: existing.id as string,
      });
      return { ok: true as const, syncedDays: 0, final: true as const };
    }

    await context.supabase
      .from("hr_leave_approvals")
      .update({
        status: "approved",
        acted_by: context.userId,
        acted_at: new Date().toISOString(),
        comments: data.comments ?? null,
      })
      .eq("id", pending.id);

    const next = (steps ?? []).find(
      (s) => Number(s.step_order) > Number(pending.step_order) && s.status === "pending",
    );

    // Final attendance sync only on HR step (or last remaining step when HR acts).
    if (stepRole === "hr" || (!next && manage)) {
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
        data.comments ?? null,
        Boolean(data.payrollImpact),
      );
      return { ok: true as const, syncedDays: result.syncedDays, final: true as const };
    }

    const nextRole = next ? String(next.step_role) : null;
    await context.supabase
      .from("hr_leave_requests")
      .update({
        current_step_role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.leaveId);

    return { ok: true as const, syncedDays: 0, final: false as const, nextStep: nextRole };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager"] } },
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
      .select("id, staff_id, leave_type, status, date_from, date_to, staff(full_name, user_id, location_id)")
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
      "hr.warnings.manage",
      "hr.probation.manage",
      "hr.resignation.manage",
      "hr.termination.initiate",
      "hr.termination.approve",
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
