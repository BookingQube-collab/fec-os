"use server";

import { z } from "zod";

import { qatarTodayYmd } from "@/lib/attendance-hr/dashboard";
import {
  attendanceRowCountsAsPresent,
  buildTeamToday,
  teamTodayCompanyWide,
  type TeamTodayAnnualBalance,
  type TeamTodayLeave,
  type TeamTodayMember,
} from "@/lib/hr/team-today";
import { formatLocationRecord } from "@/lib/locations/normalize";
import { loadRosterChartStaffIds } from "@/lib/reporting-manager-access.server";
import { createAuthenticatedAction } from "@/lib/server/create-action";
import { isJokerStaff } from "@/lib/staff-status";
import { isRosterAssignableStaffStatus } from "@/lib/attendance-hr/roster-register-scope";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

type StaffRow = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  location_id: string | null;
  status: string | null;
  employment_type: string | null;
  deleted_at: string | null;
};

function memberFromRow(row: StaffRow, reportingManagerStaffId: string | null): TeamTodayMember {
  return {
    staffId: row.id,
    name: row.full_name?.trim() || "—",
    jobTitle: row.job_title,
    homeLocationId: row.location_id,
    reportingManagerStaffId,
    assignable:
      !row.deleted_at &&
      isRosterAssignableStaffStatus(row.status) &&
      !isJokerStaff({ status: row.status, employmentType: row.employment_type }),
  };
}

async function loadStaffRows(staffIds: readonly string[]): Promise<StaffRow[]> {
  const rows: StaffRow[] = [];
  for (const chunk of chunks(staffIds, 100)) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, job_title, location_id, status, employment_type, deleted_at")
      .in("id", [...chunk]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      rows.push({
        id: String(row.id),
        full_name: row.full_name ?? null,
        job_title: row.job_title ?? null,
        location_id: row.location_id ?? null,
        status: row.status ?? null,
        employment_type: row.employment_type ?? null,
        deleted_at: row.deleted_at ?? null,
      });
    }
  }
  return rows;
}

async function loadCompanyStaffRows(): Promise<StaffRow[]> {
  const rows: StaffRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("staff")
      .select("id, full_name, job_title, location_id, status, employment_type, deleted_at")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const row of page) {
      rows.push({
        id: String(row.id),
        full_name: row.full_name ?? null,
        job_title: row.job_title ?? null,
        location_id: row.location_id ?? null,
        status: row.status ?? null,
        employment_type: row.employment_type ?? null,
        deleted_at: row.deleted_at ?? null,
      });
    }
    if (page.length < 1000) break;
  }
  return rows;
}

async function loadReportingManagers(staffIds: readonly string[]): Promise<Map<string, string | null>> {
  const managers = new Map<string, string | null>();
  for (const chunk of chunks(staffIds, 100)) {
    const { data, error } = await supabaseAdmin
      .from("staff_profile_ext")
      .select("staff_id, reporting_manager_staff_id")
      .in("staff_id", [...chunk]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      if (!staffId) continue;
      managers.set(staffId, row.reporting_manager_staff_id ? String(row.reporting_manager_staff_id) : null);
    }
  }
  return managers;
}

async function loadExtraLocations(staffIds: readonly string[]): Promise<Map<string, string[]>> {
  const extras = new Map<string, string[]>();
  for (const chunk of chunks(staffIds, 80)) {
    const { data, error } = await supabaseAdmin
      .from("staff_work_locations")
      .select("staff_id, location_id")
      .in("staff_id", [...chunk]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      const locationId = row.location_id ? String(row.location_id) : "";
      if (!staffId || !locationId) continue;
      const list = extras.get(staffId) ?? [];
      if (!list.includes(locationId)) list.push(locationId);
      extras.set(staffId, list);
    }
  }
  return extras;
}

async function loadPunchedStaffIds(staffIds: readonly string[], today: string): Promise<string[]> {
  const punched = new Set<string>();
  for (const chunk of chunks(staffIds, 80)) {
    const { data: summaries, error: summaryError } = await supabaseAdmin
      .from("attendance_daily_summary")
      .select("staff_id, punch_count, status, actual_in")
      .eq("work_date", today)
      .in("staff_id", [...chunk]);
    if (summaryError) throw new Error(summaryError.message);
    for (const row of summaries ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      if (!staffId) continue;
      const day = row as { punch_count?: number | null; actual_in?: string | null; status?: string | null };
      if (
        attendanceRowCountsAsPresent({
          punchCount: day.punch_count,
          status: day.status ?? row.status,
          actualIn: day.actual_in,
        })
      ) {
        punched.add(staffId);
      }
    }

    const { data: logs, error: logError } = await supabaseAdmin
      .from("attendance_logs")
      .select("staff_id, excluded_from_calc")
      .eq("attendance_date", today)
      .in("staff_id", [...chunk]);
    if (logError) throw new Error(logError.message);
    for (const row of logs ?? []) {
      const log = row as { staff_id?: string | null; excluded_from_calc?: boolean | null };
      if (log.excluded_from_calc) continue;
      const staffId = log.staff_id ? String(log.staff_id) : "";
      if (staffId) punched.add(staffId);
    }
  }
  return [...punched];
}

async function loadLeaves(staffIds: readonly string[], today: string): Promise<Array<TeamTodayLeave & { staffId: string }>> {
  const leaves: Array<TeamTodayLeave & { staffId: string }> = [];
  for (const chunk of chunks(staffIds, 80)) {
    const { data, error } = await supabaseAdmin
      .from("hr_leave_requests")
      .select("staff_id, leave_type, status, date_from, date_to")
      .in("staff_id", [...chunk])
      .lte("date_from", today)
      .gte("date_to", today)
      .in("status", ["approved", "pending"]);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      if (!staffId) continue;
      leaves.push({
        staffId,
        leaveType: String(row.leave_type ?? ""),
        status: String(row.status ?? ""),
        dateFrom: String(row.date_from ?? ""),
        dateTo: String(row.date_to ?? ""),
      });
    }
  }
  return leaves;
}

async function loadAnnualBalances(staffIds: readonly string[], year: number): Promise<TeamTodayAnnualBalance[]> {
  const allotted = new Map<string, Omit<TeamTodayAnnualBalance, "staffId" | "usedDays">>();
  const used = new Map<string, number>();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  for (const chunk of chunks(staffIds, 80)) {
    const { data: balances, error: balanceError } = await supabaseAdmin
      .from("hr_leave_balances")
      .select("staff_id, allotted_days, carried_forward, expired_days, pending_days")
      .eq("leave_type", "annual")
      .eq("period_year", year)
      .in("staff_id", [...chunk]);
    if (balanceError) throw new Error(balanceError.message);
    for (const row of balances ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      if (!staffId) continue;
      allotted.set(staffId, {
        allottedDays: Number(row.allotted_days ?? 0),
        carriedForwardDays: Number(row.carried_forward ?? 0),
        expiredDays: Number(row.expired_days ?? 0),
        pendingDays: Number(row.pending_days ?? 0),
      });
    }

    const { data: usedRows, error: usedError } = await supabaseAdmin
      .from("hr_leave_requests")
      .select("staff_id, days, date_from")
      .eq("leave_type", "annual")
      .eq("status", "approved")
      .gte("date_from", from)
      .lte("date_from", to)
      .in("staff_id", [...chunk]);
    if (usedError) throw new Error(usedError.message);
    for (const row of usedRows ?? []) {
      const staffId = row.staff_id ? String(row.staff_id) : "";
      if (!staffId) continue;
      used.set(staffId, (used.get(staffId) ?? 0) + Number(row.days ?? 0));
    }
  }

  return [...allotted.keys()].map((staffId) => {
    const row = allotted.get(staffId);
    return {
      staffId,
      allottedDays: row?.allottedDays ?? 0,
      carriedForwardDays: row?.carriedForwardDays ?? 0,
      expiredDays: row?.expiredDays ?? 0,
      pendingDays: row?.pendingDays ?? 0,
      usedDays: used.get(staffId) ?? 0,
    };
  });
}

async function loadLocationLabels(locationIds: readonly string[]) {
  if (locationIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, code, name, region")
    .in("id", [...locationIds]);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    label: formatLocationRecord(row),
  }));
}

export const getTeamToday = createAuthenticatedAction(
  z.object({}),
  async (_data, context) => {
    const today = qatarTodayYmd();
    const companyWide = teamTodayCompanyWide(context.roles ?? []);
    const { data: viewerRows, error: viewerError } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .limit(1);
    if (viewerError) throw new Error(viewerError.message);
    const viewerStaffId = viewerRows?.[0]?.id ? String(viewerRows[0].id) : null;

    const staffIds = companyWide ? null : await loadRosterChartStaffIds(context.userId);
    if (!companyWide && (!staffIds || staffIds.length === 0)) {
      return buildTeamToday({
        viewerStaffId,
        companyWide: false,
        today,
        people: [],
      });
    }

    const staffRows = companyWide ? await loadCompanyStaffRows() : await loadStaffRows(staffIds ?? []);
    const loadedIds = staffRows.map((row) => row.id);
    const [managers, extras] = await Promise.all([
      loadReportingManagers(loadedIds),
      loadExtraLocations(loadedIds),
    ]);
    const people = staffRows.map((row) => ({
      ...memberFromRow(row, managers.get(row.id) ?? null),
      extraLocationIds: extras.get(row.id) ?? [],
    }));
    const visibleIds = companyWide
      ? people.filter((person) => person.assignable !== false).map((person) => person.staffId)
      : (staffIds ?? []);
    const visible = new Set(visibleIds);
    const year = Number(today.slice(0, 4));
    const [punchedStaffIds, leaves, annualBalances] = await Promise.all([
      loadPunchedStaffIds(visibleIds, today),
      loadLeaves(visibleIds, today),
      loadAnnualBalances(visibleIds, year),
    ]);
    const locationIds = new Set<string>();
    for (const person of people) {
      if (!visible.has(person.staffId)) continue;
      if (person.homeLocationId) locationIds.add(person.homeLocationId);
      for (const id of person.extraLocationIds ?? []) {
        if (id) locationIds.add(id);
      }
    }
    const locations = await loadLocationLabels([...locationIds]);
    return buildTeamToday({
      viewerStaffId,
      companyWide,
      today,
      people,
      staffIds: companyWide ? null : visibleIds,
      punchedStaffIds,
      leaves,
      annualBalances,
      locations,
    });
  },
  { defaultInput: {}, auth: { anyCapability: ["hr.employee_app", "dashboard.view", "people.view_roster"] } },
);
