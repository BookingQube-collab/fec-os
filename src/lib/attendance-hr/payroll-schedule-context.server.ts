/**
 * Load roster week-off + leave + ops-accepted correction clocks for payroll readiness / Generate.
 * daily_summary often keeps status=missed_punch on rest days or after approved corrections;
 * attachPayrollScheduleContext + applyPayrollAcceptedCorrectionOverlay overlay the same
 * signals the attendance listing / My Attendance use.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE } from "@/lib/attendance-hr/constants";
import {
  applyPayrollAcceptedCorrectionOverlay,
  applyPayrollDeviceLogPunchOverlay,
  attachPayrollScheduleContext,
  hasPayrollCompletePunches,
  isPayrollPaidNonWorkDay,
  type PayrollDayInput,
  type PayrollDeviceLogPunch,
  type PayrollLeaveDay,
  type PayrollRosterDay,
} from "@/lib/attendance-hr/payroll";
import {
  punchesFromCorrectionValue,
  type AcceptedCorrectionPunch,
  type MissedPunchStepRole,
} from "@/lib/attendance-hr/missed-punch-approval";
import { collectPagedRows } from "@/lib/attendance-hr/roster-register-scope";

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function asStepRole(value: unknown): MissedPunchStepRole | null {
  if (value === "manager" || value === "ops" || value === "hr" || value === "gm") return value;
  return null;
}

async function loadPayrollRosterDays(
  staffIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<PayrollRosterDay[]> {
  if (!staffIds.length) return [];
  const roster: PayrollRosterDay[] = [];
  for (const chunk of chunkIds(staffIds, 80)) {
    const pages = await collectPagedRows(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("attendance_roster_assignments")
        .select("staff_id, work_date, is_week_off")
        .in("staff_id", chunk)
        .gte("work_date", dateFrom)
        .lte("work_date", dateTo)
        .order("staff_id", { ascending: true })
        .order("work_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    for (const row of pages) {
      const staffId = String(row.staff_id ?? "").trim();
      const day = String(row.work_date ?? "").slice(0, 10);
      if (!staffId || !day) continue;
      roster.push({
        staff_id: staffId,
        work_date: day,
        is_week_off: Boolean(row.is_week_off),
      });
    }
  }
  return roster;
}

async function loadPayrollLeaveDays(
  staffIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<PayrollLeaveDay[]> {
  if (!staffIds.length) return [];
  const leave: PayrollLeaveDay[] = [];
  for (const chunk of chunkIds(staffIds, 80)) {
    const pages = await collectPagedRows(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("attendance_leave_records")
        .select("staff_id, leave_date, leave_type")
        .in("staff_id", chunk)
        .gte("leave_date", dateFrom)
        .lte("leave_date", dateTo)
        .order("leave_date", { ascending: true })
        .order("staff_id", { ascending: true })
        .range(from, to);
      if (error) {
        // Leave table may be missing on older environments — schedule context still works from roster.
        if (/does not exist|schema cache|relation/i.test(error.message)) return [];
        throw error;
      }
      return data ?? [];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    for (const row of pages) {
      const staffId = String(row.staff_id ?? "").trim();
      const day = String(row.leave_date ?? "").slice(0, 10);
      const leaveType = String(row.leave_type ?? "").trim();
      if (!staffId || !day || !leaveType) continue;
      leave.push({ staff_id: staffId, work_date: day, leave_type: leaveType });
    }
  }
  return leave;
}

async function loadWeeklyOffWeekdayByStaff(staffIds: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!staffIds.length) return out;
  for (const chunk of chunkIds(staffIds, 200)) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, weekly_off_weekday")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const id = String(row.id ?? "");
      if (!id) continue;
      const wd = row.weekly_off_weekday;
      out.set(id, wd == null || !Number.isFinite(Number(wd)) ? null : Number(wd));
    }
  }
  return out;
}

/** Same ops-accepted correction clocks the attendance listing overlays. */
async function loadPayrollAcceptedCorrectionPunches(
  staffIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<AcceptedCorrectionPunch[]> {
  if (!staffIds.length) return [];
  const out: AcceptedCorrectionPunch[] = [];
  for (const chunk of chunkIds(staffIds, 80)) {
    const { data, error } = await supabaseAdmin
      .from("attendance_corrections")
      .select("id, staff_id, work_date, status, current_step_role, new_value, requested_at")
      .in("staff_id", chunk)
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .in("status", ["pending", "approved"]);
    if (error) {
      if (/does not exist|schema cache|column/i.test(error.message)) return out;
      throw error;
    }
    for (const row of data ?? []) {
      const clocks = punchesFromCorrectionValue((row.new_value ?? null) as Record<string, unknown> | null);
      out.push({
        id: String(row.id),
        staffId: row.staff_id ? String(row.staff_id) : null,
        workDate: row.work_date ? String(row.work_date).slice(0, 10) : null,
        status: String(row.status ?? ""),
        currentStepRole: asStepRole(row.current_step_role),
        punchType: clocks.punchType,
        punchAt: clocks.punchAt,
        punchInAt: clocks.punchInAt,
        punchOutAt: clocks.punchOutAt,
        requestedAt: row.requested_at ? String(row.requested_at) : null,
      });
    }
  }
  return out;
}

/**
 * Load attendance_logs for staff whose daily_summary still looks incomplete after
 * roster/correction overlays — same hydration source the attendance listing uses.
 */
async function loadPayrollDeviceLogPunches(
  staffIds: string[],
  dateFrom: string,
  dateTo: string,
): Promise<PayrollDeviceLogPunch[]> {
  if (!staffIds.length) return [];
  const out: PayrollDeviceLogPunch[] = [];
  for (const chunk of chunkIds(staffIds, 80)) {
    const pages = await collectPagedRows(async (from, to) => {
      const { data, error } = await supabaseAdmin
        .from("attendance_logs")
        .select("staff_id, attendance_date, punch_at, excluded_from_calc, probable_duplicate")
        .in("staff_id", chunk)
        .gte("attendance_date", dateFrom)
        .lte("attendance_date", dateTo)
        .order("punch_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data ?? [];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
    for (const row of pages) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      const day = String(row.attendance_date ?? "").slice(0, 10);
      const punchAt = row.punch_at ? String(row.punch_at) : "";
      if (!staffId || !day || !punchAt) continue;
      out.push({
        staff_id: staffId,
        work_date: day,
        punch_at: punchAt,
        excluded_from_calc: Boolean(row.excluded_from_calc),
        probable_duplicate: Boolean(row.probable_duplicate),
      });
    }
  }
  return out;
}

function staffIdsNeedingPayrollLogHydration(days: PayrollDayInput[]): string[] {
  const ids = new Set<string>();
  for (const day of days) {
    const staffId = day.staff_id ? String(day.staff_id) : "";
    if (!staffId) continue;
    if (isPayrollPaidNonWorkDay(day)) continue;
    if (hasPayrollCompletePunches(day)) continue;
    const incomplete = Boolean(day.actual_in) !== Boolean(day.actual_out);
    const punchless = !day.actual_in && !day.actual_out;
    if (!incomplete && !punchless) continue;
    // Only hydrate days that look like attendance gaps (not clean present without clocks).
    const status = String(day.status ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (
      day.missed_punch ||
      status === "missed_punch" ||
      status === "absent" ||
      status === "incomplete" ||
      status === "review_required" ||
      incomplete
    ) {
      ids.add(staffId);
    }
  }
  return [...ids];
}

/** Overlay roster week-off + leave (+ standing weekday) + accepted MP corrections onto payroll day inputs. */
export async function withPayrollScheduleContext(
  days: PayrollDayInput[],
  opts: { dateFrom: string; dateTo: string; staffIds?: string[] },
): Promise<PayrollDayInput[]> {
  const staffIds =
    opts.staffIds?.length ?
      [...new Set(opts.staffIds)]
    : [
        ...new Set(
          days
            .map((d) => (d.staff_id ? String(d.staff_id) : ""))
            .filter(Boolean),
        ),
      ];
  if (!staffIds.length || days.length === 0) return days;

  const [roster, leave, weeklyOffWeekdayByStaff, acceptedCorrections] = await Promise.all([
    loadPayrollRosterDays(staffIds, opts.dateFrom, opts.dateTo),
    loadPayrollLeaveDays(staffIds, opts.dateFrom, opts.dateTo),
    loadWeeklyOffWeekdayByStaff(staffIds),
    loadPayrollAcceptedCorrectionPunches(staffIds, opts.dateFrom, opts.dateTo),
  ]);

  const scheduled = attachPayrollScheduleContext(days, {
    roster,
    leave,
    weeklyOffWeekdayByStaff,
  });
  const corrected = applyPayrollAcceptedCorrectionOverlay(scheduled, acceptedCorrections);

  // Stale daily_summary (one-sided / punchless MP) while attendance_logs already has both
  // clocks — same hydration attendance reports apply before counting Missed punch.
  const hydrateIds = staffIdsNeedingPayrollLogHydration(corrected);
  if (!hydrateIds.length) return corrected;
  const logs = await loadPayrollDeviceLogPunches(hydrateIds, opts.dateFrom, opts.dateTo);
  if (!logs.length) return corrected;
  return applyPayrollDeviceLogPunchOverlay(corrected, logs);
}
