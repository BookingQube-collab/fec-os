"use server";

/**
 * People/HR event workforce listings — attendance, crew, and event picker
 * for modules under /people/event-* (ongoing manage; Events stays setup).
 */

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { eventPayOpenWindow } from "@/lib/events/event-payroll";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

const Ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Uuid = z.string().uuid();

export type PeopleEventOption = {
  id: string;
  name: string;
  eventNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  status: string | null;
};

export type PeopleEventAttendanceRow = {
  id: string;
  eventId: string;
  eventName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  workDate: string;
  status: string;
  locationId: string | null;
  locationName: string | null;
  biometricUserId: string | null;
  scheduledIn: string | null;
  scheduledOut: string | null;
  actualIn: string | null;
  actualOut: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  workedMinutes: number;
  missedPunch: boolean;
  /** From event_staff_assignments (or schedule slot fallback). */
  roleLabel: string | null;
  eventRoleId: string | null;
};

export type PeopleEventCrewRow = {
  id: string;
  eventId: string;
  eventName: string | null;
  eventNumber: string | null;
  locationId: string | null;
  locationName: string | null;
  staffId: string;
  staffName: string | null;
  employeeCode: string | null;
  assignmentType: string;
  roleLabel: string;
  dateFrom: string;
  dateTo: string;
  payOnEventRun: boolean;
  status: string;
  notes: string | null;
};

/** Compact event picker for People filters (active events only). */
export const listPeopleEventOptions = createAuthenticatedAction(
  z
    .object({
      locationId: Uuid.nullable().optional(),
      search: z.string().max(120).optional().nullable(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .default({}),
  async (data, context): Promise<{ events: PeopleEventOption[] }> => {
    let q = context.supabase
      .from("events")
      .select(
        "id, name, event_name, event_number, location_id, event_start, event_end, status, venue_access, setup_start, dismantle_end",
      )
      .is("deleted_at", null)
      .order("event_start", { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 120);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(
        `name.ilike.%${s}%,event_name.ilike.%${s}%,event_number.ilike.%${s}%,client_name.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id).filter(Boolean))] as string[];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] as Array<{ id: string; code: string | null; name: string | null }> };
    const locMap = new Map(
      (locs ?? []).map((l) => [
        l.id,
        [l.code, l.name].filter(Boolean).join(" · ") || (l.name as string) || null,
      ]),
    );

    return {
      events: (rows ?? []).map((r) => {
        // Same open-window policy as event payroll Create & generate (event_start → event_end).
        const open = eventPayOpenWindow({
          event_start: (r.event_start as string | null) ?? null,
          event_end: (r.event_end as string | null) ?? null,
          venue_access: (r.venue_access as string | null) ?? null,
          setup_start: (r.setup_start as string | null) ?? null,
          dismantle_end: (r.dismantle_end as string | null) ?? null,
        });
        const dateFrom = open.dateFrom || null;
        const dateTo = open.dateTo || dateFrom;
        return {
          id: r.id as string,
          name: String(r.name || r.event_name || "Event"),
          eventNumber: (r.event_number as string | null) ?? null,
          locationId: (r.location_id as string | null) ?? null,
          locationName: r.location_id ? (locMap.get(r.location_id as string) ?? null) : null,
          dateFrom,
          dateTo,
          status: (r.status as string | null) ?? null,
        };
      }),
    };
  },
  {
    auth: {
      anyCapability: ["people.view_roster", "events.view", "attendance.view", "payroll.view"],
    },
  },
);

/**
 * When monthly recalc upserted summaries without event_id, re-tag person-days that
 * still have event-scoped punches so Event Attendance can list them again.
 */
async function retagSummariesFromEventPunches(
  db: AuthContext["supabase"],
  input: {
    eventId: string;
    locationId?: string | null;
    staffId?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  },
): Promise<number> {
  let punchQ = db
    .from("attendance_logs")
    .select("staff_id, attendance_date, location_id")
    .eq("event_id", input.eventId)
    .not("staff_id", "is", null)
    .limit(2000);
  if (input.locationId) punchQ = punchQ.eq("location_id", input.locationId);
  if (input.staffId) punchQ = punchQ.eq("staff_id", input.staffId);
  if (input.dateFrom) punchQ = punchQ.gte("attendance_date", input.dateFrom);
  if (input.dateTo) punchQ = punchQ.lte("attendance_date", input.dateTo);
  const { data: punches, error } = await punchQ;
  if (error) {
    if (/event_id|schema cache|does not exist/i.test(error.message)) return 0;
    throw error;
  }
  if (!punches?.length) return 0;

  const keys = new Map<string, { staffId: string; workDate: string; locationId: string }>();
  for (const punch of punches) {
    const staffId = punch.staff_id ? String(punch.staff_id) : "";
    const workDate = String(punch.attendance_date ?? "").slice(0, 10);
    const locationId = punch.location_id ? String(punch.location_id) : "";
    if (!staffId || !workDate || !locationId) continue;
    keys.set(`${locationId}|${staffId}|${workDate}`, { staffId, workDate, locationId });
  }
  let tagged = 0;
  for (const entry of keys.values()) {
    const { error: updError } = await db
      .from("attendance_daily_summary")
      .update({ event_id: input.eventId })
      .eq("location_id", entry.locationId)
      .eq("staff_id", entry.staffId)
      .eq("work_date", entry.workDate)
      .is("event_id", null);
    if (updError) {
      if (/event_id|schema cache|does not exist/i.test(updError.message)) return tagged;
      throw updError;
    }
    tagged += 1;
  }
  return tagged;
}

/** Event-tagged attendance_daily_summary rows for People → Event attendance. */
export const listPeopleEventAttendance = createAuthenticatedAction(
  z.object({
    eventId: Uuid.nullable().optional(),
    locationId: Uuid.nullable().optional(),
    staffId: Uuid.nullable().optional(),
    dateFrom: Ymd.nullable().optional(),
    dateTo: Ymd.nullable().optional(),
    search: z.string().max(120).optional().nullable(),
    limit: z.number().int().min(1).max(2000).optional(),
    /** Skip assignment/slot role joins — Overview KPIs/charts do not need roles. */
    includeRoles: z.boolean().optional(),
  }),
  async (data, _context): Promise<{ rows: PeopleEventAttendanceRow[] }> => {
    const includeRoles = data.includeRoles !== false;
    // Capability already checked by createAuthenticatedAction. Bypass per-row
    // attendance RLS (user_can_access_attendance) for Event Attendance listing.
    const db = supabaseAdmin as AuthContext["supabase"];

    const buildSummaryQuery = () => {
      let q = db
        .from("attendance_daily_summary")
        .select(
          "id, event_id, staff_id, work_date, status, location_id, biometric_user_id, scheduled_in, scheduled_out, actual_in, actual_out, late_minutes, early_leave_minutes, overtime_minutes, worked_minutes, missed_punch",
        )
        .not("event_id", "is", null)
        .order("work_date", { ascending: false })
        .limit(data.limit ?? 800);

      if (data.eventId) q = q.eq("event_id", data.eventId);
      if (data.locationId) q = q.eq("location_id", data.locationId);
      if (data.staffId) q = q.eq("staff_id", data.staffId);
      if (data.dateFrom) q = q.gte("work_date", data.dateFrom);
      if (data.dateTo) q = q.lte("work_date", data.dateTo);
      return q;
    };

    let { data: rows, error } = await buildSummaryQuery();
    if (error) {
      // Column missing / schema cache lag — surface empty rather than crash the page,
      // but log so Event Attendance is not silently "broken" in production.
      if (/event_id|schema cache|does not exist/i.test(error.message)) {
        console.error("[listPeopleEventAttendance] event_id query failed:", error.message);
        return { rows: [] };
      }
      throw error;
    }

    // Self-heal: punches still carry event_id after monthly recalc wiped the summary tag.
    if ((!rows || rows.length === 0) && data.eventId) {
      const retagged = await retagSummariesFromEventPunches(db, {
        eventId: data.eventId,
        locationId: data.locationId,
        staffId: data.staffId,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      });
      if (retagged > 0) {
        const retry = await buildSummaryQuery();
        if (retry.error) throw retry.error;
        rows = retry.data;
      }
    }

    if (!rows?.length) return { rows: [] };

    const staffIds = [...new Set(rows.map((r) => r.staff_id as string).filter(Boolean))];
    const eventIds = [...new Set(rows.map((r) => r.event_id as string).filter(Boolean))];
    const locIds = [...new Set(rows.map((r) => r.location_id as string).filter(Boolean))];
    const [{ data: staff }, { data: events }, { data: locs }] = await Promise.all([
      db.from("staff").select("id, full_name, employee_code").in("id", staffIds),
      db.from("events").select("id, name, event_name").in("id", eventIds),
      locIds.length
        ? db.from("locations").select("id, code, name").in("id", locIds)
        : Promise.resolve({ data: [] as Array<{ id: string; code: string | null; name: string | null }> }),
    ]);
    const staffMap = new Map(
      (staff ?? []).map((s) => [
        s.id as string,
        {
          name: s.full_name as string,
          code: (s.employee_code as string | null) ?? null,
        },
      ]),
    );
    const eventMap = new Map(
      (events ?? []).map((e) => [
        e.id as string,
        String(e.name || e.event_name || "Event"),
      ]),
    );
    const locMap = new Map(
      (locs ?? []).map((l) => [
        l.id as string,
        [l.code, l.name].filter(Boolean).join(" · ") || (l.name as string) || null,
      ]),
    );

    type AssignmentRole = {
      eventId: string;
      staffId: string;
      roleLabel: string | null;
      eventRoleId: string | null;
      dateFrom: string;
      dateTo: string;
    };
    const assignmentRoles: AssignmentRole[] = [];
    type SlotRole = {
      eventId: string;
      staffId: string;
      workDate: string;
      roleLabel: string | null;
      eventRoleId: string | null;
    };
    const slotRoleByKey = new Map<string, SlotRole>();

    if (includeRoles) {
      {
        type AssignRow = {
          event_id: string;
          staff_id: string;
          role_label: string | null;
          event_role_id?: string | null;
          date_from: string;
          date_to: string;
        };
        let assigns: AssignRow[] = [];
        const primary = await db
          .from("event_staff_assignments")
          .select("event_id, staff_id, role_label, event_role_id, date_from, date_to")
          .in("event_id", eventIds)
          .in("staff_id", staffIds);
        if (
          primary.error &&
          /event_role_id|schema cache|does not exist/i.test(primary.error.message)
        ) {
          const legacy = await db
            .from("event_staff_assignments")
            .select("event_id, staff_id, role_label, date_from, date_to")
            .in("event_id", eventIds)
            .in("staff_id", staffIds);
          if (legacy.error && !/event_staff_assignments|schema cache/i.test(legacy.error.message)) {
            throw legacy.error;
          }
          assigns = (legacy.data ?? []) as AssignRow[];
        } else if (
          primary.error &&
          !/event_staff_assignments|schema cache/i.test(primary.error.message)
        ) {
          throw primary.error;
        } else {
          assigns = (primary.data ?? []) as AssignRow[];
        }
        for (const a of assigns) {
          assignmentRoles.push({
            eventId: a.event_id as string,
            staffId: a.staff_id as string,
            roleLabel: (a.role_label as string | null) ?? null,
            eventRoleId: (a.event_role_id as string | null) ?? null,
            dateFrom: String(a.date_from ?? "").slice(0, 10),
            dateTo: String(a.date_to ?? "").slice(0, 10),
          });
        }
      }

      // Slot-level role when assignment is missing or not covering the work date.
      {
        type SlotRow = {
          event_id: string;
          staff_id: string;
          work_date: string;
          role_label: string | null;
          event_role_id?: string | null;
        };
        const workDates = [
          ...new Set(rows.map((r) => String(r.work_date).slice(0, 10)).filter(Boolean)),
        ];
        let slotQuery = db
          .from("event_schedule_slots")
          .select("event_id, staff_id, work_date, role_label, event_role_id")
          .in("event_id", eventIds)
          .in("staff_id", staffIds);
        if (workDates.length <= 62) slotQuery = slotQuery.in("work_date", workDates);
        let slots: SlotRow[] = [];
        const primary = await slotQuery;
        if (
          primary.error &&
          /event_role_id|schema cache|does not exist/i.test(primary.error.message)
        ) {
          let legacyQ = db
            .from("event_schedule_slots")
            .select("event_id, staff_id, work_date, role_label")
            .in("event_id", eventIds)
            .in("staff_id", staffIds);
          if (workDates.length <= 62) legacyQ = legacyQ.in("work_date", workDates);
          const legacy = await legacyQ;
          if (legacy.error && !/event_schedule_slots|schema cache/i.test(legacy.error.message)) {
            throw legacy.error;
          }
          slots = (legacy.data ?? []) as SlotRow[];
        } else if (
          primary.error &&
          !/event_schedule_slots|schema cache/i.test(primary.error.message)
        ) {
          throw primary.error;
        } else {
          slots = (primary.data ?? []) as SlotRow[];
        }
        for (const s of slots) {
          const workDate = String(s.work_date ?? "").slice(0, 10);
          const key = `${s.event_id as string}:${s.staff_id as string}:${workDate}`;
          if (slotRoleByKey.has(key)) continue;
          slotRoleByKey.set(key, {
            eventId: s.event_id as string,
            staffId: s.staff_id as string,
            workDate,
            roleLabel: (s.role_label as string | null) ?? null,
            eventRoleId: (s.event_role_id as string | null) ?? null,
          });
        }
      }
    }

    function resolveRole(
      eventId: string,
      staffId: string,
      workDate: string,
    ): { roleLabel: string | null; eventRoleId: string | null } {
      if (!includeRoles) return { roleLabel: null, eventRoleId: null };
      const covering = assignmentRoles.filter(
        (a) =>
          a.eventId === eventId &&
          a.staffId === staffId &&
          (!a.dateFrom || a.dateFrom <= workDate) &&
          (!a.dateTo || a.dateTo >= workDate),
      );
      const preferred =
        covering.find((a) => a.eventRoleId || a.roleLabel) ??
        assignmentRoles.find(
          (a) =>
            a.eventId === eventId &&
            a.staffId === staffId &&
            Boolean(a.eventRoleId || a.roleLabel),
        );
      if (preferred) {
        return { roleLabel: preferred.roleLabel, eventRoleId: preferred.eventRoleId };
      }
      const slot = slotRoleByKey.get(`${eventId}:${staffId}:${workDate}`);
      if (slot) {
        return { roleLabel: slot.roleLabel, eventRoleId: slot.eventRoleId };
      }
      return { roleLabel: null, eventRoleId: null };
    }

    const search = data.search?.trim().toLowerCase() ?? "";
    const mapped: PeopleEventAttendanceRow[] = [];
    for (const r of rows) {
      const eventId = r.event_id as string;
      const staffId = (r.staff_id as string | null) ?? "";
      if (!staffId) continue;
      const person = staffMap.get(staffId);
      const eventName = eventMap.get(eventId) ?? null;
      const locationId = (r.location_id as string | null) ?? null;
      const locationName = locationId ? (locMap.get(locationId) ?? null) : null;
      const workDate = String(r.work_date).slice(0, 10);
      const role = resolveRole(eventId, staffId, workDate);
      if (search) {
        const hay =
          `${person?.name ?? ""} ${person?.code ?? ""} ${eventName ?? ""} ${locationName ?? ""} ${role.roleLabel ?? ""}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }
      mapped.push({
        id: r.id as string,
        eventId,
        eventName,
        staffId,
        staffName: person?.name ?? null,
        employeeCode: person?.code ?? null,
        workDate,
        status: String(r.status ?? ""),
        locationId,
        locationName,
        biometricUserId: (r.biometric_user_id as string | null) ?? null,
        scheduledIn: (r.scheduled_in as string | null) ?? null,
        scheduledOut: (r.scheduled_out as string | null) ?? null,
        actualIn: (r.actual_in as string | null) ?? null,
        actualOut: (r.actual_out as string | null) ?? null,
        lateMinutes: Number(r.late_minutes ?? 0),
        earlyLeaveMinutes: Number(r.early_leave_minutes ?? 0),
        overtimeMinutes: Number(r.overtime_minutes ?? 0),
        workedMinutes: Number(r.worked_minutes ?? 0),
        missedPunch: Boolean(r.missed_punch),
        roleLabel: role.roleLabel,
        eventRoleId: role.eventRoleId,
      });
    }
    return { rows: mapped };
  },
  { auth: { capability: "attendance.view" } },
);

/** Cross-event crew assignments for People → Event crew. */
export const listPeopleEventCrew = createAuthenticatedAction(
  z.object({
    eventId: Uuid.nullable().optional(),
    locationId: Uuid.nullable().optional(),
    staffId: Uuid.nullable().optional(),
    assignmentType: z.string().max(40).nullable().optional(),
    status: z.enum(["active", "closed", "all"]).optional().nullable(),
    search: z.string().max(120).optional().nullable(),
    limit: z.number().int().min(1).max(2000).optional(),
  }),
  async (data, context): Promise<{ rows: PeopleEventCrewRow[] }> => {
    let q = context.supabase
      .from("event_staff_assignments")
      .select(
        "id, event_id, staff_id, assignment_type, role_label, date_from, date_to, pay_on_event_run, notes, status",
      )
      .order("date_from", { ascending: false })
      .limit(data.limit ?? 800);

    if (data.eventId) q = q.eq("event_id", data.eventId);
    if (data.assignmentType) q = q.eq("assignment_type", data.assignmentType);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.staffId) q = q.eq("staff_id", data.staffId);

    const { data: rows, error } = await q;
    if (error) {
      if (/event_staff_assignments|schema cache/i.test(error.message)) return { rows: [] };
      throw error;
    }
    if (!rows?.length) return { rows: [] };

    const staffIds = [...new Set(rows.map((r) => r.staff_id as string))];
    const eventIds = [...new Set(rows.map((r) => r.event_id as string))];
    const [{ data: staff }, { data: events }] = await Promise.all([
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code")
        .in("id", staffIds),
      context.supabase
        .from("events")
        .select("id, name, event_name, event_number, location_id")
        .in("id", eventIds),
    ]);

    const locIds = [
      ...new Set((events ?? []).map((e) => e.location_id).filter(Boolean)),
    ] as string[];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] as Array<{ id: string; code: string | null; name: string | null }> };

    const staffMap = new Map(
      (staff ?? []).map((s) => [
        s.id as string,
        {
          name: s.full_name as string,
          code: (s.employee_code as string | null) ?? null,
        },
      ]),
    );
    const locMap = new Map(
      (locs ?? []).map((l) => [
        l.id,
        [l.code, l.name].filter(Boolean).join(" · ") || null,
      ]),
    );
    const eventMap = new Map(
      (events ?? []).map((e) => [
        e.id as string,
        {
          name: String(e.name || e.event_name || "Event"),
          number: (e.event_number as string | null) ?? null,
          locationId: (e.location_id as string | null) ?? null,
          locationName: e.location_id
            ? (locMap.get(e.location_id as string) ?? null)
            : null,
        },
      ]),
    );

    const search = data.search?.trim().toLowerCase() ?? "";
    const mapped: PeopleEventCrewRow[] = [];
    for (const r of rows) {
      const eventId = r.event_id as string;
      const ev = eventMap.get(eventId);
      if (data.locationId && ev?.locationId !== data.locationId) continue;
      const person = staffMap.get(r.staff_id as string);
      if (search) {
        const hay =
          `${person?.name ?? ""} ${person?.code ?? ""} ${ev?.name ?? ""} ${r.role_label ?? ""}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }
      mapped.push({
        id: r.id as string,
        eventId,
        eventName: ev?.name ?? null,
        eventNumber: ev?.number ?? null,
        locationId: ev?.locationId ?? null,
        locationName: ev?.locationName ?? null,
        staffId: r.staff_id as string,
        staffName: person?.name ?? null,
        employeeCode: person?.code ?? null,
        assignmentType: String(r.assignment_type ?? ""),
        roleLabel: String(r.role_label ?? "crew"),
        dateFrom: String(r.date_from).slice(0, 10),
        dateTo: String(r.date_to).slice(0, 10),
        payOnEventRun: Boolean(r.pay_on_event_run),
        status: String(r.status ?? "active"),
        notes: (r.notes as string | null) ?? null,
      });
    }
    return { rows: mapped };
  },
  {
    auth: {
      anyCapability: ["people.view_roster", "events.view", "attendance.view"],
    },
  },
);
