"use server";

import { z } from "zod";

import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { defaultPayrollPeriod } from "@/lib/attendance-hr/roster-period";
import { formatLocationLabel } from "@/lib/locations/normalize";
import { aggregateHeadcountBySite, sumLeaveDaysInPeriod } from "@/lib/hr-advanced";

function tableMissing(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache|relation/i.test(message));
}

export const getHrReportsSummary = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  async (data, context: AuthContext) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const period = defaultPayrollPeriod(today);
    const dateFrom = data.dateFrom ?? period.dateFrom;
    const dateTo = data.dateTo ?? period.dateTo;

    let staffQ = context.supabase
      .from("staff")
      .select("id, location_id, locations(code, name)")
      .in("status", ["active", "on_leave"])
      .is("deleted_at", null)
      .limit(2000);
    if (data.locationId) staffQ = staffQ.eq("location_id", data.locationId);
    const { data: staffRows, error: staffErr } = await staffQ;
    if (staffErr && !tableMissing(staffErr.message)) throw staffErr;

    const bySite = aggregateHeadcountBySite(
      (staffRows ?? []).map((s) => {
        const loc = Array.isArray(s.locations) ? s.locations[0] : s.locations;
        return {
          locationId: (s.location_id as string | null) ?? null,
          locationCode: (loc as { code?: string } | null)?.code ?? null,
          locationName: (loc as { name?: string } | null)?.name ?? null,
        };
      }),
    ).map((row) => ({
      ...row,
      label: formatLocationLabel(row.locationCode, row.locationName) || "Unassigned",
    }));

    const { data: leaveRows, error: leaveErr } = await context.supabase
      .from("hr_leave_requests")
      .select("days, status, date_from, date_to")
      .eq("status", "approved")
      .lte("date_from", dateTo)
      .gte("date_to", dateFrom)
      .limit(2000);
    if (leaveErr && !tableMissing(leaveErr.message) && !/permission/i.test(leaveErr.message)) throw leaveErr;

    const leaveDaysInPeriod = sumLeaveDaysInPeriod(
      (leaveRows ?? []).map((r) => ({
        days: Number(r.days ?? 0),
        status: String(r.status),
        dateFrom: String(r.date_from),
        dateTo: String(r.date_to),
      })),
      dateFrom,
      dateTo,
    );

    let presentDays = 0;
    let absentDays = 0;
    let attendanceQ = context.supabase
      .from("attendance_daily_summary")
      .select("status")
      .gte("work_date", dateFrom)
      .lte("work_date", dateTo)
      .limit(5000);
    if (data.locationId) attendanceQ = attendanceQ.eq("location_id", data.locationId);
    const { data: attRows, error: attErr } = await attendanceQ;
    if (attErr && !tableMissing(attErr.message)) throw attErr;
    for (const row of attRows ?? []) {
      const status = String(row.status);
      if (["present", "late", "overtime", "early_leave", "early_departure"].includes(status)) presentDays += 1;
      else if (status === "absent") absentDays += 1;
    }

    return {
      period: { month: period.month, dateFrom, dateTo },
      headcountBySite: bySite,
      leaveDaysInPeriod,
      attendance: { presentDays, absentDays },
      payrollExportHref: `/api/people/attendance-hr/export?format=payroll&from=${dateFrom}&to=${dateTo}${
        data.locationId ? `&locationId=${data.locationId}` : ""
      }`,
      attendanceReportsHref: `/people/attendance/reports?from=${dateFrom}&to=${dateTo}`,
    };
  },
  { auth: { anyCapability: ["hr.manage", "people.view_roster", "payroll.view"] } },
);
