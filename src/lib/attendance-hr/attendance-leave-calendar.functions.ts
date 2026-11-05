"use server";

import { z } from "zod";

import { canSeeAttendanceListing } from "@/lib/attendance-listing-access";
import {
  addCalendarDays,
  aggregateCalendarByLocation,
  aggregateCalendarDays,
  aggregateCalendarKpis,
  buildAttendanceExceptions,
  buildCalendarEmployeeRows,
  buildOnLeaveToday,
  calendarMonthBounds,
  calendarWeekBounds,
  filterCalendarRows,
  locationShortageHints,
  type CalendarEmployeeRow,
  type CalendarExceptionGroup,
  type CalendarKpis,
  type CalendarLeavePerson,
  type CalendarLocationBreakdown,
  type CalendarDayAggregate,
  type CalendarStatusFilter,
} from "@/lib/attendance-hr/attendance-leave-calendar";
import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";
import { getAttendanceHrBootstrap, getAttendanceHrDaily } from "@/lib/attendance-hr.functions";
import { loadLinkedStaffRecord } from "@/lib/linked-staff-job-title.server";
import { canUserDo } from "@/lib/rbac";
import { loadDirectReportStaffIds } from "@/lib/reporting-manager-access.server";
import { getAttendanceListingSites } from "@/lib/reporting-manager-access.functions";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const statusFilterSchema = z.enum([
  "all",
  "present",
  "absent",
  "leave",
  "late",
  "week_off",
  "holiday",
  "missed_punch",
]);

const calendarInputSchema = z.object({
  /** Calendar month YYYY-MM (default: Qatar today month). */
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  /** Anchor day for week/day views and “today” panels. */
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  view: z.enum(["month", "week", "day"]).optional(),
  locationId: z.string().uuid().nullable().optional(),
  departmentIds: z.array(z.string().uuid()).optional(),
  staffQ: z.string().max(120).optional(),
  jobTitle: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  status: statusFilterSchema.optional(),
  /** When set, include employee-level rows for this day (drawer). */
  detailDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AttendanceLeaveCalendarResult = {
  today: string;
  month: string;
  view: "month" | "week" | "day";
  dateFrom: string;
  dateTo: string;
  anchorDate: string;
  companyWide: boolean;
  sites: Array<{ id: string; code: string; name: string | null }>;
  filterOptions: {
    departments: string[];
    jobTitles: string[];
  };
  kpis: CalendarKpis;
  days: CalendarDayAggregate[];
  locationBreakdown: CalendarLocationBreakdown[];
  onLeaveToday: CalendarLeavePerson[];
  upcomingLeaves: CalendarLeavePerson[];
  exceptions: CalendarExceptionGroup[];
  shortageHints: Array<{ locationId: string; label: string; coveragePct: number }>;
  lastSyncAt: string | null;
  detailDate: string | null;
  detailRows: CalendarEmployeeRow[];
};

async function assertCalendarAccess(userId: string, roles: string[]) {
  const [linked, reports] = await Promise.all([
    loadLinkedStaffRecord(userId),
    loadDirectReportStaffIds(userId),
  ]);
  const roleList = roles as never;
  const allowed =
    canSeeAttendanceListing(
      roleList,
      reports.directReportStaffIds.length > 0,
      linked?.jobTitle,
      linked?.department,
      linked?.staffRole,
    ) ||
    canUserDo(roleList, "attendance.view") ||
    canUserDo(roleList, "attendance.view_all");
  if (!allowed) {
    throw new ForbiddenError("Attendance & Leave Calendar is limited to management roles.");
  }
  return linked;
}

function resolveRange(input: z.infer<typeof calendarInputSchema>, today: string) {
  const view = input.view ?? "month";
  const anchor = input.anchorDate ?? today;
  const month = input.month ?? anchor.slice(0, 7);
  if (view === "day") {
    return { view, month, anchorDate: anchor, dateFrom: anchor, dateTo: anchor };
  }
  if (view === "week") {
    const week = calendarWeekBounds(anchor);
    return { view, month: anchor.slice(0, 7), anchorDate: anchor, ...week };
  }
  const bounds = calendarMonthBounds(month);
  return { view, month, anchorDate: anchor, ...bounds };
}

export const getAttendanceLeaveCalendar = createAuthenticatedAction(
  calendarInputSchema,
  async (data, context): Promise<AttendanceLeaveCalendarResult> => {
    await assertCalendarAccess(context.userId, context.roles ?? []);
    const today = qatarTodayYmd();
    const range = resolveRange(data, today);
    const kpiDate = data.anchorDate && data.anchorDate <= today ? data.anchorDate : today;

    const [rawRows, sitesRes, bootstrap] = await Promise.all([
      getAttendanceHrDaily({
        locationId: data.locationId ?? null,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        departmentIds: data.departmentIds,
        staffQ: data.staffQ,
      }),
      getAttendanceListingSites(),
      getAttendanceHrBootstrap({ includeStaff: false }).catch(() => null),
    ]);

    const filtered = filterCalendarRows(rawRows, {
      staffQ: data.staffQ,
      jobTitle: data.jobTitle,
      department: data.department,
      status: (data.status ?? "all") as CalendarStatusFilter,
      today,
    });

    // KPI / side panels always use Qatar “today” (or past anchor), never a future day as actuals.
    const panelDate = kpiDate;
    const needExtraToday =
      panelDate < range.dateFrom || panelDate > range.dateTo
        ? await getAttendanceHrDaily({
            locationId: data.locationId ?? null,
            dateFrom: panelDate,
            dateTo: panelDate,
            departmentIds: data.departmentIds,
            staffQ: data.staffQ,
          })
        : rawRows;
    const todayFiltered = filterCalendarRows(needExtraToday, {
      staffQ: data.staffQ,
      jobTitle: data.jobTitle,
      department: data.department,
      status: (data.status ?? "all") as CalendarStatusFilter,
      today,
    });

    const upcomingTo = addCalendarDays(today, 7);
    const upcomingFrom = addCalendarDays(today, 1);
    const staffIds = [
      ...new Set(
        filtered
          .map((row) => row.staff_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    let upcomingLeaves: CalendarLeavePerson[] = [];
    if (staffIds.length > 0) {
      const { data: leaveRows } = await supabaseAdmin
        .from("hr_leave_requests")
        .select(
          "staff_id, leave_type, date_from, date_to, status, staff(full_name, employee_code)",
        )
        .eq("status", "approved")
        .lte("date_from", upcomingTo)
        .gte("date_to", upcomingFrom)
        .in("staff_id", staffIds.slice(0, 2000))
        .limit(500);
      upcomingLeaves = (leaveRows ?? []).map((row) => {
        const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
        const person = staff as { full_name?: string | null; employee_code?: string | null } | null;
        return {
          staffId: String(row.staff_id),
          staffName: person?.full_name ?? null,
          employeeCode: person?.employee_code ?? null,
          leaveType: String(row.leave_type ?? ""),
          locationCode: null,
          dateFrom: String(row.date_from).slice(0, 10),
          dateTo: String(row.date_to).slice(0, 10),
        };
      });
    }

    const departments = new Set<string>();
    const jobTitles = new Set<string>();
    for (const row of rawRows) {
      if (row.department?.trim()) departments.add(row.department.trim());
      if (row.job_title?.trim()) jobTitles.add(row.job_title.trim());
    }

    const devices = (bootstrap as { devices?: Array<{ last_adms_at?: string | null; last_sync_at?: string | null }> } | null)
      ?.devices;
    let lastSyncAt: string | null = null;
    for (const device of devices ?? []) {
      for (const stamp of [device.last_sync_at, device.last_adms_at]) {
        if (!stamp) continue;
        if (!lastSyncAt || stamp > lastSyncAt) lastSyncAt = stamp;
      }
    }

    const locationBreakdown = aggregateCalendarByLocation(todayFiltered, panelDate, { today });
    const detailDate = data.detailDate ?? null;
    const detailSource =
      detailDate && detailDate >= range.dateFrom && detailDate <= range.dateTo
        ? filtered
        : detailDate
          ? filterCalendarRows(
              await getAttendanceHrDaily({
                locationId: data.locationId ?? null,
                dateFrom: detailDate,
                dateTo: detailDate,
                departmentIds: data.departmentIds,
                staffQ: data.staffQ,
              }),
              {
                staffQ: data.staffQ,
                jobTitle: data.jobTitle,
                department: data.department,
                status: (data.status ?? "all") as CalendarStatusFilter,
                today,
              },
            )
          : [];

    type BootstrapSite = {
      location_id?: string;
      location?: { id?: string; code?: string; name?: string | null } | null;
    };
    let sites = sitesRes.companyWide
      ? ((bootstrap as { sites?: BootstrapSite[] } | null)?.sites ?? [])
          .map((site) => {
            const id = site.location?.id ?? site.location_id;
            const code = site.location?.code;
            if (!id || !code) return null;
            return { id, code, name: site.location?.name ?? null };
          })
          .filter((site): site is { id: string; code: string; name: string | null } => Boolean(site))
      : sitesRes.sites.map((site) => ({
          id: site.id,
          code: site.code,
          name: site.name ?? null,
        }));
    if (sitesRes.companyWide && sites.length === 0) {
      const { data: locRows } = await context.supabase
        .from("locations")
        .select("id, code, name")
        .eq("status", "active")
        .order("code");
      sites = (locRows ?? []).map((loc) => ({
        id: String(loc.id),
        code: String(loc.code),
        name: loc.name ?? null,
      }));
    }

    return {
      today,
      month: range.month,
      view: range.view,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      anchorDate: range.anchorDate,
      companyWide: sitesRes.companyWide,
      sites,
      filterOptions: {
        departments: [...departments].sort((a, b) => a.localeCompare(b)),
        jobTitles: [...jobTitles].sort((a, b) => a.localeCompare(b)),
      },
      kpis: aggregateCalendarKpis(todayFiltered, panelDate, { today }),
      days: aggregateCalendarDays(filtered, {
        today,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
      locationBreakdown,
      onLeaveToday: buildOnLeaveToday(todayFiltered, panelDate, { today }),
      upcomingLeaves,
      exceptions: buildAttendanceExceptions(todayFiltered, panelDate, { today }),
      shortageHints: locationShortageHints(locationBreakdown),
      lastSyncAt,
      detailDate,
      detailRows: detailDate ? buildCalendarEmployeeRows(detailSource, detailDate, { today }) : [],
    };
  },
  { auth: { anyCapability: ["attendance.view", "hr.employee_app"] } },
);
