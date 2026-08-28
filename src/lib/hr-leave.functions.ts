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

export const submitLeaveRequest = createAuthenticatedAction(
  z.object({
    leaveType: z.enum(HR_LEAVE_TYPES).default("annual"),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(500).optional().nullable(),
  }),
  async (data, context) => {
    const staff = await myStaff(context);
    if (!staff) throw new ForbiddenError("Your login is not linked to a staff record.");
    const days = countLeaveDays(data.dateFrom, data.dateTo);
    if (days < 1) throw new Error("Leave end date must be on or after the start date.");
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
    return { id: row.id as string, days };
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
      .select("id, staff_id, status, date_from, staff(full_name, user_id, location_id)")
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
    await dispatchHrNotify({
      kind: data.status === "approved" ? "leave_approved" : data.status === "rejected" ? "leave_rejected" : "leave_submitted",
      staffName: (staffRow as { full_name?: string } | null)?.full_name ?? "Staff",
      workDate: String(existing.date_from).slice(0, 10),
      locationId: (staffRow as { location_id?: string } | null)?.location_id ?? null,
      sourceId: existing.id as string,
    });
    return { ok: true };
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.employee_app"] } },
);
