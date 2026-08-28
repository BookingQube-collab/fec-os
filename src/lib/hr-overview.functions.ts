"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { canUserDo } from "@/lib/rbac";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const getHrOverview = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context: AuthContext) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);

    const staffFilter = context.supabase
      .from("staff")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "on_leave"])
      .is("deleted_at", null);
    const { count: headcount, error: staffErr } = data.locationId
      ? await staffFilter.eq("location_id", data.locationId)
      : await staffFilter;
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;

    const presentFilter = context.supabase
      .from("attendance_daily_summary")
      .select("id", { count: "exact", head: true })
      .eq("work_date", today)
      .in("status", ["present", "late", "overtime", "early_leave", "early_departure"]);
    const { count: presentToday, error: presentErr } = data.locationId
      ? await presentFilter.eq("location_id", data.locationId)
      : await presentFilter;
    if (presentErr && !tableMissing(presentErr.message)) throw presentErr;

    const { count: pendingLeave, error: leaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    const leaveMissing = Boolean(leaveErr && (tableMissing(leaveErr.message) || /permission/i.test(leaveErr.message)));
    if (leaveErr && !leaveMissing) throw leaveErr;

    let payrollBlocked = 0;
    if (canUserDo(context.roles ?? [], "payroll.view")) {
      try {
        const payroll = await getPayrollAttendanceSummary({
          locationId: data.locationId ?? null,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        });
        payrollBlocked = payroll.blockedCount;
      } catch {
        payrollBlocked = 0;
      }
    }

    return {
      headcount: headcount ?? 0,
      presentToday: presentToday ?? 0,
      pendingLeave: leaveMissing ? 0 : pendingLeave ?? 0,
      payrollBlocked,
      period,
    };
  },
  { auth: { capability: "people.view_roster" } },
);
