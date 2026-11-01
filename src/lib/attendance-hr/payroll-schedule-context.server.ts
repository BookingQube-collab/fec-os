/**
 * Load roster week-off + leave for payroll readiness / Generate.
 * daily_summary often keeps status=missed_punch on rest days; attachPayrollScheduleContext
 * overlays the same schedule signals the attendance listing uses.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE } from "@/lib/attendance-hr/constants";
import {
  attachPayrollScheduleContext,
  type PayrollDayInput,
  type PayrollLeaveDay,
  type PayrollRosterDay,
} from "@/lib/attendance-hr/payroll";
import { collectPagedRows } from "@/lib/attendance-hr/roster-register-scope";

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
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

/** Overlay roster week-off + leave (+ standing weekday) onto payroll day inputs. */
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

  const [roster, leave, weeklyOffWeekdayByStaff] = await Promise.all([
    loadPayrollRosterDays(staffIds, opts.dateFrom, opts.dateTo),
    loadPayrollLeaveDays(staffIds, opts.dateFrom, opts.dateTo),
    loadWeeklyOffWeekdayByStaff(staffIds),
  ]);

  return attachPayrollScheduleContext(days, {
    roster,
    leave,
    weeklyOffWeekdayByStaff,
  });
}
