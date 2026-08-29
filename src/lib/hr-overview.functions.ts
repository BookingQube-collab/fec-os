"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { canUserDo } from "@/lib/rbac";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { getPayrollAttendanceSummary } from "@/lib/attendance-hr-field.functions";
import { formatOtPolicySummary } from "@/lib/hr-advanced";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const getHrOverview = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context: AuthContext) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);
    const dayStart = `${today}T00:00:00+03:00`;
    const dayEnd = `${today}T23:59:59+03:00`;
    const expiryHorizon = new Date(`${today}T00:00:00+03:00`);
    expiryHorizon.setDate(expiryHorizon.getDate() + 30);
    const expiryTo = expiryHorizon.toISOString().slice(0, 10);

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

    const { count: onLeaveToday, error: onLeaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("date_from", today)
      .gte("date_to", today);
    const onLeaveMissing = Boolean(onLeaveErr && (tableMissing(onLeaveErr.message) || /permission/i.test(onLeaveErr.message)));
    if (onLeaveErr && !onLeaveMissing) throw onLeaveErr;

    let fieldCheckedIn = 0;
    const fieldQ = context.supabase
      .from("staff_location_events")
      .select("staff_id, event_type, recorded_at")
      .gte("recorded_at", dayStart)
      .lte("recorded_at", dayEnd)
      .in("event_type", ["check_in", "check_out"])
      .order("recorded_at", { ascending: false })
      .limit(2000);
    const { data: fieldRows, error: fieldErr } = data.locationId
      ? await fieldQ.eq("location_id", data.locationId)
      : await fieldQ;
    if (fieldErr && !tableMissing(fieldErr.message) && !/permission/i.test(fieldErr.message ?? "")) throw fieldErr;
    if (fieldRows?.length) {
      const lastByStaff = new Map<string, string>();
      for (const row of fieldRows) {
        const sid = String(row.staff_id);
        if (lastByStaff.has(sid)) continue;
        lastByStaff.set(sid, String(row.event_type));
      }
      fieldCheckedIn = [...lastByStaff.values()].filter((t) => t === "check_in").length;
    }

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

    const { count: expiringDocs, error: docsErr } = await context.supabase
      .from("hr_employee_documents")
      .select("id", { count: "exact", head: true })
      .not("expiry_date", "is", null)
      .lte("expiry_date", expiryTo);
    const docsMissing = Boolean(docsErr && (tableMissing(docsErr.message) || /permission/i.test(docsErr.message ?? "")));
    if (docsErr && !docsMissing) throw docsErr;

    const { count: openOnboarding, error: onboardErr } = await context.supabase
      .from("hr_staff_checklists")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    const onboardMissing = Boolean(
      onboardErr && (tableMissing(onboardErr.message) || /permission/i.test(onboardErr.message ?? "")),
    );
    if (onboardErr && !onboardMissing) throw onboardErr;

    const { count: activeAnnouncements, error: annErr } = await context.supabase
      .from("hr_announcements")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    const annMissing = Boolean(annErr && (tableMissing(annErr.message) || /permission/i.test(annErr.message ?? "")));
    if (annErr && !annMissing) throw annErr;

    let otPolicySummary: string | null = null;
    const { data: otRow, error: otErr } = await context.supabase
      .from("hr_ot_policy")
      .select(
        "overtime_after_minutes, max_daily_ot_minutes, max_weekly_ot_minutes, requires_preapproval, summary_notes",
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (otErr && !tableMissing(otErr.message) && !/permission/i.test(otErr.message ?? "")) throw otErr;
    if (otRow) {
      otPolicySummary = formatOtPolicySummary({
        overtimeAfterMinutes: Number(otRow.overtime_after_minutes ?? 480),
        maxDailyOtMinutes: otRow.max_daily_ot_minutes != null ? Number(otRow.max_daily_ot_minutes) : null,
        maxWeeklyOtMinutes: otRow.max_weekly_ot_minutes != null ? Number(otRow.max_weekly_ot_minutes) : null,
        requiresPreapproval: Boolean(otRow.requires_preapproval),
      });
      if (otRow.summary_notes) {
        otPolicySummary = `${otPolicySummary} — ${String(otRow.summary_notes).slice(0, 120)}`;
      }
    }

    return {
      headcount: headcount ?? 0,
      presentToday: presentToday ?? 0,
      onLeaveToday: onLeaveMissing ? 0 : onLeaveToday ?? 0,
      pendingLeave: leaveMissing ? 0 : pendingLeave ?? 0,
      fieldCheckedIn,
      payrollBlocked,
      expiringDocs: docsMissing ? 0 : expiringDocs ?? 0,
      openOnboarding: onboardMissing ? 0 : openOnboarding ?? 0,
      activeAnnouncements: annMissing ? 0 : activeAnnouncements ?? 0,
      otPolicySummary,
      period,
      today,
    };
  },
  { auth: { anyCapability: ["people.view_roster", "hr.manage", "hr.leave.manage"] } },
);
