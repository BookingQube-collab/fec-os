"use server";

import { z } from "zod";

import { canUserDo } from "@/lib/rbac";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

import { buildAttendanceReview } from "./attendance-flags";
import { buildLeaveInsights } from "./leave-insights";
import { buildRosterRecommendations } from "./roster-recommendations";
import { normalizeHm, ymdAdd } from "./time";
import type { AssistResult } from "./types";

/**
 * Read-only review notes. These actions select existing attendance, roster, and leave
 * rows and return text. They do not insert, update, or delete punches, summaries,
 * roster assignments, leave balances, or device sync.
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PAGE = 1000;
const MAX_PAGES = 6;

type Row = Record<string, unknown>;

function rel(row: Row, key: string): Row | null {
  const value = row[key];
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null;
  if (value && typeof value === "object") return value as Row;
  return null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function locationLabel(row: Row): string {
  const loc = rel(row, "locations");
  return text(loc?.name).trim() || text(loc?.code).trim();
}

function staffLabel(row: Row): string {
  return text(rel(row, "staff")?.full_name).trim();
}

function staffIdOf(row: Row): string | null {
  const id = text(row.staff_id).trim();
  return id || null;
}

function missingTable(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /does not exist|schema cache/i.test(error.message));
}

async function loadPages(
  fetchPage: (from: number, to: number) => Promise<{ rows: Row[]; error: { message?: string } | null }>,
): Promise<{ rows: Row[]; missing: boolean }> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const result = await fetchPage(from, from + PAGE - 1);
    if (result.error) {
      if (missingTable(result.error)) return { rows: [], missing: true };
      throw result.error;
    }
    rows.push(...result.rows);
    if (result.rows.length < PAGE) break;
  }
  return { rows, missing: false };
}

async function assertSite(context: AuthContext, locationId: string | null | undefined, viewAll: boolean) {
  if (!locationId || viewAll) return;
  await assertLocationAccess(context, locationId);
}

const insufficient: AssistResult = { status: "insufficient", items: [] };

export const getAttendanceReviewFlags = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
  }),
  async (data, context): Promise<AssistResult> => {
    if (data.dateTo < data.dateFrom) return insufficient;
    const viewAll = canUserDo(context.roles ?? [], "attendance.view_all");
    await assertSite(context, data.locationId, viewAll);
    const punchFrom = `${ymdAdd(data.dateFrom, -1)}T00:00:00.000Z`;
    const punchTo = `${ymdAdd(data.dateTo, 2)}T00:00:00.000Z`;

    const [days, punches, roster] = await Promise.all([
      loadPages(async (from, to) => {
        let q = context.supabase
          .from("attendance_daily_summary")
          .select(
            "location_id, staff_id, work_date, status, missed_punch, punch_count, overtime_minutes, actual_in, actual_out, scheduled_in, scheduled_out, staff(full_name), locations(name, code)",
          )
          .gte("work_date", data.dateFrom)
          .lte("work_date", data.dateTo)
          .order("work_date", { ascending: true })
          .range(from, to);
        if (data.locationId) q = q.eq("location_id", data.locationId);
        const { data: page, error } = await q;
        return { rows: (page ?? []) as Row[], error };
      }),
      loadPages(async (from, to) => {
        let q = context.supabase
          .from("attendance_logs")
          .select("location_id, staff_id, punch_at, probable_duplicate, attendance_date, staff(full_name)")
          .eq("probable_duplicate", true)
          .gte("punch_at", punchFrom)
          .lt("punch_at", punchTo)
          .order("punch_at", { ascending: true })
          .range(from, to);
        if (data.locationId) q = q.eq("location_id", data.locationId);
        const { data: page, error } = await q;
        return { rows: (page ?? []) as Row[], error };
      }),
      loadPages(async (from, to) => {
        let q = context.supabase
          .from("attendance_roster_assignments")
          .select("location_id, staff_id, work_date, shift_start, shift_end, is_week_off, staff(full_name), locations(name, code)")
          .gte("work_date", data.dateFrom)
          .lte("work_date", data.dateTo)
          .order("work_date", { ascending: true })
          .range(from, to);
        if (data.locationId) q = q.eq("location_id", data.locationId);
        const { data: page, error } = await q;
        return { rows: (page ?? []) as Row[], error };
      }),
    ]);
    if (days.missing && punches.missing && roster.missing) return insufficient;

    return buildAttendanceReview({
      periodFrom: data.dateFrom,
      periodTo: data.dateTo,
      days: days.rows.map((row) => ({
        staffId: staffIdOf(row),
        staffName: staffLabel(row),
        locationId: text(row.location_id),
        locationName: locationLabel(row),
        workDate: text(row.work_date).slice(0, 10),
        status: text(row.status),
        missedPunch: Boolean(row.missed_punch),
        punchCount: Number(row.punch_count ?? 0),
        overtimeMinutes: Number(row.overtime_minutes ?? 0),
        actualIn: row.actual_in ? text(row.actual_in) : null,
        actualOut: row.actual_out ? text(row.actual_out) : null,
        scheduledIn: row.scheduled_in ? text(row.scheduled_in) : null,
        scheduledOut: row.scheduled_out ? text(row.scheduled_out) : null,
      })),
      punches: punches.rows.map((row) => ({
        staffId: staffIdOf(row),
        staffName: staffLabel(row),
        locationId: text(row.location_id),
        punchAt: text(row.punch_at),
        probableDuplicate: Boolean(row.probable_duplicate),
        attendanceDate: row.attendance_date ? text(row.attendance_date).slice(0, 10) : null,
      })),
      roster: roster.rows.map((row) => ({
        staffId: text(row.staff_id),
        staffName: staffLabel(row),
        locationId: text(row.location_id),
        locationName: locationLabel(row),
        workDate: text(row.work_date).slice(0, 10),
        shiftStart: normalizeHm(text(row.shift_start)),
        shiftEnd: normalizeHm(text(row.shift_end)),
        isWeekOff: Boolean(row.is_week_off),
      })),
    });
  },
  { auth: { capability: "attendance.view" } },
);

export const getRosterAssistRecommendations = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
  }),
  async (data, context): Promise<AssistResult> => {
    if (data.dateTo < data.dateFrom) return insufficient;
    const viewAll = canUserDo(context.roles ?? [], "attendance.view_all");
    await assertSite(context, data.locationId, viewAll);

    const [assignments, leaves, openings] = await Promise.all([
      loadPages(async (from, to) => {
        let q = context.supabase
          .from("attendance_roster_assignments")
          .select("location_id, staff_id, work_date, shift_start, shift_end, is_week_off, staff(full_name), locations(name, code)")
          .gte("work_date", data.dateFrom)
          .lte("work_date", data.dateTo)
          .order("work_date", { ascending: true })
          .range(from, to);
        if (data.locationId) q = q.eq("location_id", data.locationId);
        const { data: page, error } = await q;
        return { rows: (page ?? []) as Row[], error };
      }),
      loadPages(async (from, to) => {
        const { data: page, error } = await context.supabase
          .from("hr_leave_requests")
          .select("staff_id, date_from, date_to, status")
          .in("status", ["pending", "approved"])
          .lte("date_from", data.dateTo)
          .gte("date_to", data.dateFrom)
          .order("date_from", { ascending: true })
          .range(from, to);
        return { rows: (page ?? []) as Row[], error };
      }),
      loadPages(async (from, to) => {
        let q = context.supabase
          .from("attendance_shift_templates")
          .select("location_id, name, start_time, end_time, active")
          .eq("active", true)
          .order("name", { ascending: true })
          .range(from, to);
        if (data.locationId) q = q.or(`location_id.eq.${data.locationId},location_id.is.null`);
        const { data: page, error } = await q;
        return { rows: (page ?? []) as Row[], error };
      }),
    ]);
    if (assignments.missing && leaves.missing) return insufficient;

    return buildRosterRecommendations({
      periodFrom: data.dateFrom,
      periodTo: data.dateTo,
      assignments: assignments.rows.map((row) => ({
        staffId: text(row.staff_id),
        staffName: staffLabel(row),
        locationId: text(row.location_id),
        locationName: locationLabel(row),
        workDate: text(row.work_date).slice(0, 10),
        shiftStart: normalizeHm(text(row.shift_start)),
        shiftEnd: normalizeHm(text(row.shift_end)),
        isWeekOff: Boolean(row.is_week_off),
      })),
      leaves: leaves.rows.map((row) => ({
        staffId: text(row.staff_id),
        dateFrom: text(row.date_from).slice(0, 10),
        dateTo: text(row.date_to).slice(0, 10),
        status: text(row.status),
      })),
      openings: openings.rows
        .filter((row) => row.active !== false)
        .map((row) => ({
          locationId: row.location_id ? text(row.location_id) : null,
          name: text(row.name),
          start: text(row.start_time),
          end: text(row.end_time),
        })),
    });
  },
  {
    auth: {
      anyCapability: [
        "people.view_roster",
        "people.import_roster",
        "people.edit_roster",
        "daily_ops.roster.upload",
        "attendance.view",
      ],
    },
  },
);

export const getLeaveAssistInsights = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid().nullable().optional(),
  }),
  async (data, context): Promise<AssistResult> => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" });
    const dateFrom = ymdAdd(today, -120);
    const dateTo = ymdAdd(today, 90);

    const requests = await loadPages(async (from, to) => {
      const { data: page, error } = await context.supabase
        .from("hr_leave_requests")
        .select("id, staff_id, leave_type, date_from, date_to, status, staff(full_name, location_id)")
        .in("status", ["pending", "approved", "rejected"])
        .lte("date_from", dateTo)
        .gte("date_to", dateFrom)
        .order("date_from", { ascending: true })
        .range(from, to);
      return { rows: (page ?? []) as Row[], error };
    });
    if (requests.missing) return insufficient;

    let locationId: string | null = null;
    if (data.staffId) {
      const { data: staffRow, error: staffError } = await context.supabase
        .from("staff")
        .select("location_id")
        .eq("id", data.staffId)
        .maybeSingle();
      if (staffError && !missingTable(staffError)) throw staffError;
      locationId = staffRow?.location_id ? text(staffRow.location_id) : null;
    }

    const spanFrom = requests.rows.reduce((min, row) => {
      const value = text(row.date_from).slice(0, 10);
      return value && value < min ? value : min;
    }, dateTo);
    const spanTo = requests.rows.reduce((max, row) => {
      const value = text(row.date_to).slice(0, 10);
      return value && value > max ? value : max;
    }, dateFrom);

    const roster = requests.rows.length
      ? await loadPages(async (from, to) => {
          let q = context.supabase
            .from("attendance_roster_assignments")
            .select("location_id, staff_id, work_date, is_week_off, locations(name, code)")
            .gte("work_date", spanFrom)
            .lte("work_date", spanTo)
            .eq("is_week_off", false)
            .order("work_date", { ascending: true })
            .range(from, to);
          if (locationId) q = q.eq("location_id", locationId);
          const { data: page, error } = await q;
          return { rows: (page ?? []) as Row[], error };
        })
      : { rows: [] as Row[], missing: false };

    const byDay = new Map<string, { locationId: string; locationName: string; workDate: string; staff: Set<string> }>();
    for (const row of roster.rows) {
      const workDate = text(row.work_date).slice(0, 10);
      const id = text(row.location_id);
      const key = `${id}|${workDate}`;
      let bucket = byDay.get(key);
      if (!bucket) {
        bucket = { locationId: id, locationName: locationLabel(row), workDate, staff: new Set() };
        byDay.set(key, bucket);
      }
      const staffId = text(row.staff_id);
      if (staffId) bucket.staff.add(staffId);
    }

    const mappedRequests = requests.rows.map((row) => {
      const staff = rel(row, "staff");
      return {
        id: text(row.id),
        staffId: text(row.staff_id),
        staffName: text(staff?.full_name).trim(),
        locationId: staff?.location_id ? text(staff.location_id) : null,
        locationName: null as string | null,
        leaveType: text(row.leave_type),
        dateFrom: text(row.date_from).slice(0, 10),
        dateTo: text(row.date_to).slice(0, 10),
        status: text(row.status),
      };
    });
    const locationIds = [...new Set(mappedRequests.map((row) => row.locationId).filter((id): id is string => Boolean(id)))];
    if (locationIds.length) {
      const { data: locations, error: locationError } = await context.supabase
        .from("locations")
        .select("id, name, code")
        .in("id", locationIds);
      if (locationError && !missingTable(locationError)) throw locationError;
      const labels = new Map(
        (locations ?? []).map((row) => [text(row.id), text(row.name).trim() || text(row.code).trim()]),
      );
      for (const row of mappedRequests) {
        if (row.locationId) row.locationName = labels.get(row.locationId) || null;
      }
    }
    const scopedRequests = data.staffId
      ? mappedRequests.filter(
          (row) => row.staffId === data.staffId || (locationId != null && row.locationId === locationId),
        )
      : mappedRequests;

    return buildLeaveInsights({
      requests: scopedRequests,
      rosterDays: [...byDay.values()].map((day) => ({
        locationId: day.locationId,
        locationName: day.locationName,
        workDate: day.workDate,
        onDuty: day.staff.size,
      })),
    });
  },
  { auth: { anyCapability: ["hr.leave.manage", "hr.leave.approve_manager"] } },
);
