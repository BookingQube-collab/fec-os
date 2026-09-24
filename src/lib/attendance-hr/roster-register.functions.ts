"use server";

import { z } from "zod";

import { canUserDo, type AppRole } from "@/lib/rbac";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { ForbiddenError } from "@/lib/server/authorize";
import { assertAttendanceRosterLocation } from "@/lib/attendance-hr/roster-apply";
import { loadActiveShiftTemplates } from "@/lib/attendance-hr/roster-amend";
import { recalculateAttendanceRange } from "@/lib/attendance-hr/process";
import { matchShiftTemplate, parseTimeCell } from "@/lib/attendance-hr/roster-upload";
import {
  assertRosterDeletePeriod,
  chunkIds,
  collectPagedRows,
  rosterAmendRecalcLocationIds,
  rosterPatchFromDayStatus,
  rosterRowMatchesSearch,
  type RosterDayStatus,
  type RosterLeaveType,
} from "@/lib/attendance-hr/roster-register-scope";
import { mapRosterPeriodByDayIndex, monthBounds, nextPayrollMonth } from "@/lib/attendance-hr/roster-period";
import { ATTENDANCE_DAILY_LIST_PAGE_SIZE } from "@/lib/attendance-hr/constants";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function parseHm(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return parseTimeCell(value) ?? (/^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : null);
}

export type RosterRegisterRow = {
  id: string;
  locationId: string;
  locationCode: string | null;
  locationName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  qid: string | null;
  workDate: string;
  shiftStart: string | null;
  shiftEnd: string | null;
  shiftTemplateId: string | null;
  isWeekOff: boolean;
  /** From attendance_leave_records when present (annual_leave / sick_leave). */
  leaveType: RosterLeaveType | null;
  source: string;
};

async function syncRosterLeaveRecord(
  supabase: AuthContext["supabase"],
  input: {
    locationId: string;
    staffId: string;
    workDate: string;
    leaveType: RosterLeaveType | null;
    userId: string;
  },
) {
  if (input.leaveType) {
    const { error } = await supabase.from("attendance_leave_records").upsert(
      {
        location_id: input.locationId,
        staff_id: input.staffId,
        leave_date: input.workDate,
        leave_type: input.leaveType,
        source: "roster_amend",
        created_by: input.userId,
      },
      { onConflict: "staff_id,leave_date" },
    );
    if (error) throw error;
    return;
  }
  // Day status left leave — clear the leave row so attendance matches On duty / Week off.
  const { error } = await supabase
    .from("attendance_leave_records")
    .delete()
    .eq("staff_id", input.staffId)
    .eq("leave_date", input.workDate);
  if (error) throw error;
}

function assertCanAmendRoster(roles: AppRole[] | string[] | undefined) {
  const list = (roles ?? []) as AppRole[];
  if (
    canUserDo(list, "people.import_roster") ||
    canUserDo(list, "people.edit_roster") ||
    canUserDo(list, "daily_ops.roster.upload")
  ) {
    return;
  }
  throw new ForbiddenError("Forbidden: missing capability to amend the shift roster.");
}

function assertCanViewRosterRegister(roles: AppRole[] | string[] | undefined) {
  const list = (roles ?? []) as AppRole[];
  if (
    canUserDo(list, "people.view_roster") ||
    canUserDo(list, "people.import_roster") ||
    canUserDo(list, "people.edit_roster") ||
    canUserDo(list, "daily_ops.roster.upload") ||
    canUserDo(list, "attendance.view")
  ) {
    return;
  }
  throw new ForbiddenError("Forbidden: missing capability to view the shift roster.");
}

export const listUploadedRosterAssignments = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    staffId: z.string().uuid().nullable().optional(),
    dateFrom: ymd,
    dateTo: ymd,
    /** When true, only upload + amend rows (legacy import register). */
    sourceUploadOnly: z.boolean().optional().default(false),
    /** Optional single-source filter. Ignored when sourceUploadOnly is true. */
    source: z.enum(["upload", "amend", "manual", "copied"]).nullable().optional(),
  }),
  async (data, context) => {
    assertCanViewRosterRegister(context.roles);
    if (data.locationId) await assertAttendanceRosterLocation(context, data.locationId);

    // Page past PostgREST max_rows (~1000). A bare .limit(5000) still returns only ~1000 and
    // silently drops later FEC-month days (ordered work_date ASC) — then client staff filters
    // look like "18 rows / empty Sept 15–27" for a complete upload.
    type AssignmentPageRow = {
      id: string;
      location_id: string;
      staff_id: string;
      work_date: string;
      shift_template_id: string | null;
      shift_start: string | null;
      shift_end: string | null;
      is_week_off: boolean | null;
      source: string | null;
      created_at: string | null;
    };
    const assignments = await collectPagedRows<AssignmentPageRow>(async (from, to) => {
      let q = context.supabase
        .from("attendance_roster_assignments")
        .select(
          "id, location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off, source, created_at",
        )
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo)
        .order("work_date", { ascending: true })
        .order("staff_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (data.locationId) q = q.eq("location_id", data.locationId);
      if (data.staffId) q = q.eq("staff_id", data.staffId);
      if (data.sourceUploadOnly) q = q.in("source", ["upload", "amend"]);
      else if (data.source) q = q.eq("source", data.source);

      const { data: page, error } = await q;
      if (error) throw error;
      return (page ?? []) as AssignmentPageRow[];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);

    const staffIds = [...new Set(assignments.map((row) => String(row.staff_id)).filter(Boolean))];
    const locationIds = [...new Set(assignments.map((row) => String(row.location_id)).filter(Boolean))];
    const shiftIds = [
      ...new Set(
        assignments
          .map((row) => row.shift_template_id as string | null)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [staffRes, locRes, shiftRes] = await Promise.all([
      staffIds.length
        ? context.supabase.from("staff").select("id, full_name, employee_code, qid").in("id", staffIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length
        ? context.supabase.from("locations").select("id, code, name").in("id", locationIds)
        : Promise.resolve({ data: [], error: null }),
      shiftIds.length
        ? context.supabase
            .from("attendance_shift_templates")
            .select("id, start_time, end_time, name")
            .in("id", shiftIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (staffRes.error) throw staffRes.error;
    if (locRes.error) throw locRes.error;
    if (shiftRes.error) throw shiftRes.error;

    const staffById = new Map((staffRes.data ?? []).map((row) => [String(row.id), row]));
    const locById = new Map((locRes.data ?? []).map((row) => [String(row.id), row]));
    const shiftById = new Map((shiftRes.data ?? []).map((row) => [String(row.id), row]));

    const leaveByStaffDate = new Map<string, RosterLeaveType>();
    if (staffIds.length) {
      for (const staffChunk of chunkIds(staffIds, 200)) {
        const leaveRows = await collectPagedRows<{
          staff_id: string;
          leave_date: string;
          leave_type: string;
        }>(async (from, to) => {
          const { data: page, error } = await context.supabase
            .from("attendance_leave_records")
            .select("staff_id, leave_date, leave_type")
            .gte("leave_date", data.dateFrom)
            .lte("leave_date", data.dateTo)
            .in("staff_id", staffChunk)
            .order("leave_date", { ascending: true })
            .order("staff_id", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (page ?? []) as { staff_id: string; leave_date: string; leave_type: string }[];
        }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
        for (const leave of leaveRows) {
          const leaveType = String(leave.leave_type);
          if (leaveType !== "annual_leave" && leaveType !== "sick_leave") continue;
          leaveByStaffDate.set(
            `${String(leave.staff_id)}|${String(leave.leave_date).slice(0, 10)}`,
            leaveType,
          );
        }
      }
    }

    const mapped: RosterRegisterRow[] = assignments.map((row) => {
      const staff = staffById.get(String(row.staff_id));
      const loc = locById.get(String(row.location_id));
      const shift = row.shift_template_id ? shiftById.get(String(row.shift_template_id)) : undefined;
      const startFromRow = (row as { shift_start?: string | null }).shift_start;
      const endFromRow = (row as { shift_end?: string | null }).shift_end;
      const workDate = String(row.work_date).slice(0, 10);
      return {
        id: String(row.id),
        locationId: String(row.location_id),
        locationCode: (loc?.code as string | null | undefined) ?? null,
        locationName: (loc?.name as string | null | undefined) ?? null,
        staffId: String(row.staff_id),
        staffName: (staff?.full_name as string | null | undefined) ?? null,
        employeeCode: (staff?.employee_code as string | null | undefined) ?? null,
        qid: (staff?.qid as string | null | undefined) ?? null,
        workDate,
        shiftStart: startFromRow
          ? String(startFromRow).slice(0, 5)
          : shift?.start_time
            ? String(shift.start_time).slice(0, 5)
            : null,
        shiftEnd: endFromRow
          ? String(endFromRow).slice(0, 5)
          : shift?.end_time
            ? String(shift.end_time).slice(0, 5)
            : null,
        shiftTemplateId: (row.shift_template_id as string | null) ?? null,
        isWeekOff: Boolean(row.is_week_off),
        leaveType: leaveByStaffDate.get(`${String(row.staff_id)}|${workDate}`) ?? null,
        source: String(row.source ?? "manual"),
      };
    });

    return {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      count: mapped.length,
      rows: mapped,
    };
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

export const updateRosterAssignment = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    shiftStart: z.string().nullable().optional(),
    shiftEnd: z.string().nullable().optional(),
    isWeekOff: z.boolean().optional(),
    /** Preferred over isWeekOff when set — weekly off / leave / on duty. */
    dayStatus: z.enum(["on_duty", "weekly_off", "annual_leave", "sick_leave"]).optional(),
  }),
  async (data, context) => {
    assertCanAmendRoster(context.roles);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off, source")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    const existingLocationId = String(existing.location_id);
    await assertAttendanceRosterLocation(context, existingLocationId);

    const nextLocationId = data.locationId ?? existingLocationId;
    if (nextLocationId !== existingLocationId) {
      await assertAttendanceRosterLocation(context, nextLocationId);
    }

    const dayStatus: RosterDayStatus | null = data.dayStatus ?? null;
    const patch = dayStatus
      ? rosterPatchFromDayStatus(dayStatus)
      : {
          isWeekOff: data.isWeekOff ?? Boolean(existing.is_week_off),
          leaveType: null as RosterLeaveType | null,
          needsShiftTimes: !(data.isWeekOff ?? Boolean(existing.is_week_off)),
        };
    // Legacy isWeekOff-only callers: do not clear unrelated leave rows.
    const syncLeave = dayStatus != null;

    const isWeekOff = patch.isWeekOff;
    let shiftTemplateId: string | null = null;
    let shiftStart: string | null = null;
    let shiftEnd: string | null = null;

    if (patch.needsShiftTimes) {
      const shifts = await loadActiveShiftTemplates(context.supabase);
      const current = shifts.find((s) => s.id === existing.shift_template_id);
      const existingStart = existing.shift_start
        ? String(existing.shift_start).slice(0, 5)
        : current
          ? String(current.start_time).slice(0, 5)
          : null;
      const existingEnd = existing.shift_end
        ? String(existing.shift_end).slice(0, 5)
        : current
          ? String(current.end_time).slice(0, 5)
          : null;
      const incomingStart = data.shiftStart !== undefined ? parseHm(data.shiftStart) : undefined;
      const incomingEnd = data.shiftEnd !== undefined ? parseHm(data.shiftEnd) : undefined;
      shiftStart = incomingStart !== undefined ? incomingStart : existingStart;
      shiftEnd = incomingEnd !== undefined ? incomingEnd : existingEnd;
      if (!shiftStart || !shiftEnd) {
        throw new Error("On-duty rows need both shift start and end times.");
      }
      // Match an existing template when possible; times on the row are enough if none match.
      // Avoid creating templates on amend (no HR company / RLS create failures).
      const matched = matchShiftTemplate(shiftStart, shiftEnd, nextLocationId, shifts);
      const timesUnchanged =
        shiftStart === existingStart && shiftEnd === existingEnd && nextLocationId === existingLocationId;
      shiftTemplateId = matched ?? (timesUnchanged ? ((existing.shift_template_id as string | null) ?? null) : null);
    }

    const { error: updErr } = await context.supabase
      .from("attendance_roster_assignments")
      .update({
        location_id: nextLocationId,
        is_week_off: isWeekOff,
        shift_template_id: patch.needsShiftTimes ? shiftTemplateId : null,
        shift_start: patch.needsShiftTimes ? shiftStart : null,
        shift_end: patch.needsShiftTimes ? shiftEnd : null,
        source: existing.source === "upload" || existing.source === "amend" ? "amend" : existing.source,
      })
      .eq("id", data.id);
    if (updErr) throw updErr;

    const workDate = String(existing.work_date).slice(0, 10);
    if (syncLeave) {
      await syncRosterLeaveRecord(context.supabase, {
        locationId: nextLocationId,
        staffId: existing.staff_id,
        workDate,
        leaveType: patch.leaveType,
        userId: context.userId,
      });
    } else if (nextLocationId !== existingLocationId) {
      // Location-only amend: keep leave type, move the leave row with the assignment.
      const { error: leaveMoveErr } = await context.supabase
        .from("attendance_leave_records")
        .update({ location_id: nextLocationId })
        .eq("staff_id", existing.staff_id)
        .eq("leave_date", workDate);
      if (leaveMoveErr) throw leaveMoveErr;
    }

    for (const locationId of rosterAmendRecalcLocationIds(existingLocationId, nextLocationId)) {
      await recalculateAttendanceRange(context.supabase, locationId, workDate, workDate, {
        staffIds: [existing.staff_id],
      });
    }

    return {
      id: data.id,
      locationId: nextLocationId,
      isWeekOff,
      leaveType: patch.leaveType,
      dayStatus: dayStatus ?? (isWeekOff ? "weekly_off" : "on_duty"),
      shiftStart: patch.needsShiftTimes ? shiftStart : null,
      shiftEnd: patch.needsShiftTimes ? shiftEnd : null,
      shiftTemplateId: patch.needsShiftTimes ? shiftTemplateId : null,
    };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);

export const deleteRosterAssignment = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    assertCanAmendRoster(context.roles);

    const { data: existing, error: fetchErr } = await context.supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date")
      .eq("id", data.id)
      .single();
    if (fetchErr || !existing) throw fetchErr ?? new Error("Roster row not found");

    await assertAttendanceRosterLocation(context, existing.location_id);

    const { error: delErr } = await context.supabase
      .from("attendance_roster_assignments")
      .delete()
      .eq("id", data.id);
    if (delErr) throw delErr;

    const workDate = String(existing.work_date).slice(0, 10);
    // Clear roster-amend leave only; HR leave stays if the day was leave outside this UI.
    await context.supabase
      .from("attendance_leave_records")
      .delete()
      .eq("staff_id", existing.staff_id)
      .eq("leave_date", workDate)
      .eq("source", "roster_amend");

    await recalculateAttendanceRange(context.supabase, existing.location_id, workDate, workDate, {
      staffIds: [existing.staff_id],
    });

    return { ok: true as const, id: data.id };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);

const rosterScopeInput = z.object({
  locationId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  dateFrom: ymd,
  dateTo: ymd,
  sourceUploadOnly: z.boolean().optional().default(false),
  source: z.enum(["upload", "amend", "manual", "copied"]).nullable().optional(),
  search: z.string().nullable().optional(),
});

type RosterScopeAssignment = {
  id: string;
  location_id: string;
  staff_id: string;
  work_date: string;
  source: string | null;
};

async function fetchRosterAssignmentsInScope(
  supabase: AuthContext["supabase"],
  data: z.infer<typeof rosterScopeInput>,
): Promise<RosterScopeAssignment[]> {
  return collectPagedRows<RosterScopeAssignment>(async (from, to) => {
    let q = supabase
      .from("attendance_roster_assignments")
      .select("id, location_id, staff_id, work_date, source")
      .gte("work_date", data.dateFrom)
      .lte("work_date", data.dateTo)
      .order("id", { ascending: true })
      .range(from, to);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.staffId) q = q.eq("staff_id", data.staffId);
    if (data.sourceUploadOnly) q = q.in("source", ["upload", "amend"]);
    else if (data.source) q = q.eq("source", data.source);

    const { data: page, error } = await q;
    if (error) throw error;
    return (page ?? []) as RosterScopeAssignment[];
  }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);
}

async function applyRosterSearchFilter(
  supabase: AuthContext["supabase"],
  assignments: RosterScopeAssignment[],
  search: string,
): Promise<RosterScopeAssignment[]> {
  const q = search.trim();
  if (!q) return assignments;

  const staffIds = [...new Set(assignments.map((row) => String(row.staff_id)).filter(Boolean))];
  const locationIds = [...new Set(assignments.map((row) => String(row.location_id)).filter(Boolean))];
  const staffRows: { id: string; full_name: string | null; employee_code: string | null; qid: string | null }[] = [];
  const locRows: { id: string; code: string | null }[] = [];
  for (const ids of chunkIds(staffIds, 200)) {
    const staffRes = await supabase.from("staff").select("id, full_name, employee_code, qid").in("id", ids);
    if (staffRes.error) throw staffRes.error;
    staffRows.push(...((staffRes.data ?? []) as typeof staffRows));
  }
  for (const ids of chunkIds(locationIds, 200)) {
    const locRes = await supabase.from("locations").select("id, code").in("id", ids);
    if (locRes.error) throw locRes.error;
    locRows.push(...((locRes.data ?? []) as typeof locRows));
  }

  const staffById = new Map(staffRows.map((row) => [String(row.id), row]));
  const locById = new Map(locRows.map((row) => [String(row.id), row]));

  return assignments.filter((row) => {
    const staff = staffById.get(String(row.staff_id));
    const loc = locById.get(String(row.location_id));
    return rosterRowMatchesSearch(
      {
        staffName: staff?.full_name ?? null,
        employeeCode: staff?.employee_code ?? null,
        qid: staff?.qid ?? null,
        locationCode: loc?.code ?? null,
        workDate: String(row.work_date).slice(0, 10),
        source: String(row.source ?? "manual"),
      },
      q,
    );
  });
}

/** Delete every roster row in the selected period that matches the current register filters. */
export const deleteRosterAssignments = createAuthenticatedAction(
  rosterScopeInput,
  async (data, context) => {
    assertCanAmendRoster(context.roles);
    assertRosterDeletePeriod(data.dateFrom, data.dateTo);
    if (data.locationId) await assertAttendanceRosterLocation(context, data.locationId);

    const scoped = await fetchRosterAssignmentsInScope(context.supabase, data);
    const toDelete = data.search?.trim()
      ? await applyRosterSearchFilter(context.supabase, scoped, data.search)
      : scoped;

    if (!toDelete.length) {
      return { ok: true as const, deleted: 0, dateFrom: data.dateFrom, dateTo: data.dateTo };
    }

    const locationIds = [...new Set(toDelete.map((row) => String(row.location_id)))];
    for (const locationId of locationIds) {
      await assertAttendanceRosterLocation(context, locationId);
    }

    for (const ids of chunkIds(toDelete.map((row) => String(row.id)), 200)) {
      const { error: delErr } = await context.supabase
        .from("attendance_roster_assignments")
        .delete()
        .in("id", ids)
        .gte("work_date", data.dateFrom)
        .lte("work_date", data.dateTo);
      if (delErr) throw delErr;
    }

    const byLocation = new Map<string, { staffIds: Set<string>; minDate: string; maxDate: string }>();
    for (const row of toDelete) {
      const locationId = String(row.location_id);
      const staffId = String(row.staff_id);
      const workDate = String(row.work_date).slice(0, 10);
      const current = byLocation.get(locationId);
      if (!current) {
        byLocation.set(locationId, { staffIds: new Set([staffId]), minDate: workDate, maxDate: workDate });
        continue;
      }
      current.staffIds.add(staffId);
      if (workDate < current.minDate) current.minDate = workDate;
      if (workDate > current.maxDate) current.maxDate = workDate;
    }

    for (const [locationId, scope] of byLocation) {
      await recalculateAttendanceRange(context.supabase, locationId, scope.minDate, scope.maxDate, {
        staffIds: [...scope.staffIds],
      });
    }

    return {
      ok: true as const,
      deleted: toDelete.length,
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
    };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);

type CopySourceRow = {
  location_id: string;
  staff_id: string;
  work_date: string;
  shift_template_id: string | null;
  shift_start: string | null;
  shift_end: string | null;
  is_week_off: boolean;
};

/**
 * Copy every assignment in the selected FEC month into the next FEC month.
 * Dates map by day-of-period index (see mapRosterPeriodByDayIndex). Empty cells stay empty.
 * If the target already has rows, pass replace=true after UI confirm; otherwise returns needsReplace.
 */
export const copyRosterToNextMonth = createAuthenticatedAction(
  z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    replace: z.boolean().optional().default(false),
  }),
  async (data, context) => {
    assertCanAmendRoster(context.roles);

    const source = monthBounds(data.month);
    const targetMonth = nextPayrollMonth(data.month);
    const target = monthBounds(targetMonth);
    assertRosterDeletePeriod(source.dateFrom, source.dateTo);
    assertRosterDeletePeriod(target.dateFrom, target.dateTo);

    const dateMap = mapRosterPeriodByDayIndex(source.dateFrom, source.dateTo, target.dateFrom, target.dateTo);

    const sourceRows = await collectPagedRows<CopySourceRow>(async (from, to) => {
      const { data: page, error } = await context.supabase
        .from("attendance_roster_assignments")
        .select("location_id, staff_id, work_date, shift_template_id, shift_start, shift_end, is_week_off")
        .gte("work_date", source.dateFrom)
        .lte("work_date", source.dateTo)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (page ?? []) as CopySourceRow[];
    }, ATTENDANCE_DAILY_LIST_PAGE_SIZE);

    if (!sourceRows.length) {
      return {
        status: "empty" as const,
        sourceMonth: data.month,
        targetMonth,
        copied: 0,
        skipped: 0,
        replaced: 0,
        source: source,
        target,
      };
    }

    let targetCount = 0;
    {
      const { count, error } = await context.supabase
        .from("attendance_roster_assignments")
        .select("id", { count: "exact", head: true })
        .gte("work_date", target.dateFrom)
        .lte("work_date", target.dateTo);
      if (error) throw error;
      targetCount = count ?? 0;
    }

    if (targetCount > 0 && !data.replace) {
      return {
        status: "needs_replace" as const,
        sourceMonth: data.month,
        targetMonth,
        sourceCount: sourceRows.length,
        targetCount,
        copied: 0,
        skipped: 0,
        replaced: 0,
        source,
        target,
      };
    }

    const locationIds = [...new Set(sourceRows.map((row) => String(row.location_id)))];
    for (const locationId of locationIds) {
      await assertAttendanceRosterLocation(context, locationId);
    }

    let replaced = 0;
    if (targetCount > 0 && data.replace) {
      const existing = await fetchRosterAssignmentsInScope(context.supabase, {
        dateFrom: target.dateFrom,
        dateTo: target.dateTo,
        sourceUploadOnly: false,
      });
      replaced = existing.length;
      for (const ids of chunkIds(existing.map((row) => String(row.id)), 200)) {
        const { error: delErr } = await context.supabase
          .from("attendance_roster_assignments")
          .delete()
          .in("id", ids)
          .gte("work_date", target.dateFrom)
          .lte("work_date", target.dateTo);
        if (delErr) throw delErr;
      }
    }

    const payload: {
      location_id: string;
      staff_id: string;
      work_date: string;
      shift_template_id: string | null;
      shift_start: string | null;
      shift_end: string | null;
      is_week_off: boolean;
      source: string;
      created_by: string;
    }[] = [];
    let skipped = 0;
    for (const row of sourceRows) {
      const workDate = String(row.work_date).slice(0, 10);
      const mapped = dateMap.get(workDate);
      if (!mapped) {
        skipped += 1;
        continue;
      }
      const isWeekOff = Boolean(row.is_week_off);
      payload.push({
        location_id: String(row.location_id),
        staff_id: String(row.staff_id),
        work_date: mapped,
        shift_template_id: isWeekOff ? null : ((row.shift_template_id as string | null) ?? null),
        shift_start: isWeekOff
          ? null
          : row.shift_start
            ? String(row.shift_start).slice(0, 5)
            : null,
        shift_end: isWeekOff ? null : row.shift_end ? String(row.shift_end).slice(0, 5) : null,
        is_week_off: isWeekOff,
        source: "copied",
        created_by: context.userId,
      });
    }

    for (const chunk of chunkIds(payload, 400)) {
      const { error } = await context.supabase
        .from("attendance_roster_assignments")
        .upsert(chunk, { onConflict: "staff_id,work_date" });
      if (error) throw error;
    }

    const byLocation = new Map<string, { staffIds: Set<string>; minDate: string; maxDate: string }>();
    for (const row of payload) {
      const current = byLocation.get(row.location_id);
      if (!current) {
        byLocation.set(row.location_id, {
          staffIds: new Set([row.staff_id]),
          minDate: row.work_date,
          maxDate: row.work_date,
        });
        continue;
      }
      current.staffIds.add(row.staff_id);
      if (row.work_date < current.minDate) current.minDate = row.work_date;
      if (row.work_date > current.maxDate) current.maxDate = row.work_date;
    }
    for (const [locationId, scope] of byLocation) {
      await recalculateAttendanceRange(context.supabase, locationId, scope.minDate, scope.maxDate, {
        staffIds: [...scope.staffIds],
      });
    }

    await context.supabase.from("attendance_audit_events").insert({
      actor_id: context.userId,
      action: "roster.copy_to_next_month",
      entity_type: "attendance_roster_assignments",
      entity_id: null,
      location_id: locationIds[0] ?? null,
      after: {
        sourceMonth: data.month,
        targetMonth,
        sourceFrom: source.dateFrom,
        sourceTo: source.dateTo,
        targetFrom: target.dateFrom,
        targetTo: target.dateTo,
        copied: payload.length,
        skipped,
        replaced,
        mapping: "day_of_period_index",
      },
    });

    return {
      status: "ok" as const,
      sourceMonth: data.month,
      targetMonth,
      copied: payload.length,
      skipped,
      replaced,
      source,
      target,
    };
  },
  { auth: { anyCapability: ["people.import_roster", "people.edit_roster", "daily_ops.roster.upload"] } },
);
