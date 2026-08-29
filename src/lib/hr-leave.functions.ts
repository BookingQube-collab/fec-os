"use server";

import { z } from "zod";

import { createAuthenticatedAction, createAuthenticatedActionNoInput, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { canUserDo } from "@/lib/rbac";
import { dispatchHrNotify } from "@/lib/attendance-hr/hr-notify-dispatch";
import {
  assertLeaveTransition,
  countLeaveDays,
  HR_LEAVE_STATUSES,
  HR_LEAVE_TYPES,
  type HrLeaveActor,
  type HrLeaveStatus,
} from "@/lib/hr-leave";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import {
  DEFAULT_ANNUAL_ALLOTMENT,
  DEFAULT_SICK_ALLOTMENT,
  detectLeaveConflicts,
  enumerateLeaveDates,
  mapHrLeaveTypeToAttendance,
  summarizeLeaveBalances,
  sumUsedLeaveDays,
} from "@/lib/hr-advanced";

async function myStaff(context: AuthContext) {
  const { data } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code, location_id, user_id")
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
    // Column may be missing before migration; retry without hr_leave_request_id.
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
  const [rosterRes, attendanceRes, leaveRes] = await Promise.all([
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
  ]);

  return detectLeaveConflicts({
    dateFrom,
    dateTo,
    rosterDates: (rosterRes.data ?? []).map((r) => String(r.work_date)),
    attendancePresentDates: (attendanceRes.data ?? []).map((r) => String(r.work_date)),
    overlappingLeave: (leaveRes.data ?? [])
      .filter((r) => !excludeId || String(r.id) !== excludeId)
      .map((r) => ({
        dateFrom: String(r.date_from).slice(0, 10),
        dateTo: String(r.date_to).slice(0, 10),
        status: String(r.status),
      })),
  });
}

export const listLeaveRequests = createAuthenticatedAction(
  z.object({
    status: z.enum(HR_LEAVE_STATUSES).nullable().optional(),
    mineOnly: z.boolean().optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage");
    const staff = await myStaff(context);
    const scopedToSelf = !manage || data.mineOnly;
    if (scopedToSelf && !staff?.id) return [];
    const { data: rows, error } = await context.supabase
      .from("hr_leave_requests")
      .select("id, staff_id, leave_type, date_from, date_to, days, reason, status, review_note, created_at, staff(full_name, employee_code)")
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
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
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
    return { conflicts, days: countLeaveDays(data.dateFrom, data.dateTo) };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);

export const getLeaveBalanceSummary = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().optional(),
    year: z.number().int().min(2020).max(2100).optional(),
  }),
  async (data, context) => {
    const manage = canUserDo(context.roles ?? [], "hr.leave.manage") || canUserDo(context.roles ?? [], "hr.manage");
    const mine = await myStaff(context);
    const staffId = manage && data.staffId ? data.staffId : mine?.id;
    if (!staffId) return { year: data.year ?? new Date().getFullYear(), balances: [] };
    const year = data.year ?? new Date().getFullYear();

    const { data: allotments, error: balErr } = await context.supabase
      .from("hr_leave_balances")
      .select("leave_type, allotted_days")
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
    }));
    if (allotmentRows.length === 0) {
      allotmentRows = [
        { leaveType: "annual", allottedDays: DEFAULT_ANNUAL_ALLOTMENT },
        { leaveType: "sick", allottedDays: DEFAULT_SICK_ALLOTMENT },
      ];
    }
    return { year, balances: summarizeLeaveBalances(allotmentRows, used) };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.manage", "hr.employee_app"] } },
);

export const upsertLeaveBalance = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    leaveType: z.enum(HR_LEAVE_TYPES),
    year: z.number().int().min(2020).max(2100),
    allottedDays: z.number().min(0).max(365),
    notes: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.from("hr_leave_balances").upsert(
      {
        staff_id: data.staffId,
        leave_type: data.leaveType,
        period_year: data.year,
        allotted_days: data.allottedDays,
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
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    if (!staff) throw new ForbiddenError("Your login is not linked to a staff record.");
    const days = countLeaveDays(data.dateFrom, data.dateTo);
    if (days < 1) throw new Error("Leave end date must be on or after the start date.");
    const conflicts = await loadLeaveConflicts(context, staff.id, data.dateFrom, data.dateTo);
    if (conflicts.length > 0 && !data.acknowledgeConflicts) {
      return { id: null as string | null, days, conflicts, requiresAck: true as const };
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
      })
      .select("id")
      .single();
    if (error) throw error;
    await dispatchHrNotify({
      kind: "leave_submitted",
      staffName: staff.full_name,
      workDate: data.dateFrom,
      locationId: staff.location_id,
      sourceId: row.id,
    });
    return { id: row.id as string, days, conflicts, requiresAck: false as const };
  },
  { auth: { capability: "hr.employee_app" } },
);

export const reviewLeaveRequest = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    status: z.enum(["approved", "rejected", "cancelled"]),
    reviewNote: z.string().max(500).optional().nullable(),
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
    const actor: HrLeaveActor = data.status === "cancelled" && isOwner ? "employee" : "hr";
    if (actor === "hr" && !manage) throw new ForbiddenError("You cannot review this leave request.");
    if (actor === "employee" && !isOwner) throw new ForbiddenError("You can only cancel your own leave request.");
    assertLeaveTransition(from, data.status as HrLeaveStatus, actor);
    const { error } = await context.supabase
      .from("hr_leave_requests")
      .update({
        status: data.status,
        review_note: data.reviewNote ?? null,
        reviewed_by: actor === "hr" ? context.userId : null,
        reviewed_at: actor === "hr" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw error;
    const staffRow = Array.isArray(existing.staff) ? existing.staff[0] : existing.staff;
    let syncedDays = 0;
    if (data.status === "approved") {
      const sync = await syncApprovedLeaveToAttendance(context, {
        id: String(existing.id),
        staffId: String(existing.staff_id),
        locationId: (staffRow as { location_id?: string | null } | null)?.location_id ?? null,
        leaveType: String(existing.leave_type),
        dateFrom: String(existing.date_from).slice(0, 10),
        dateTo: String(existing.date_to).slice(0, 10),
      });
      syncedDays = sync.syncedDays;
    }
    await dispatchHrNotify({
      kind: data.status === "approved" ? "leave_approved" : data.status === "rejected" ? "leave_rejected" : "leave_submitted",
      staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
      workDate: String(existing.date_from).slice(0, 10),
      locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
      sourceId: existing.id as string,
    });
    return { ok: true, syncedDays };
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

export const listStaffForLeaveBalances = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("staff")
    .select("id, full_name, employee_code")
    .in("status", ["active", "on_leave"])
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    name: s.full_name as string,
    employeeCode: (s.employee_code as string | null) ?? null,
  }));
}, { auth: { anyCapability: ["hr.leave.manage", "hr.manage"] } });
