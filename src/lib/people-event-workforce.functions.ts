"use server";

/**
 * People/HR event workforce listings — attendance, crew, and event picker
 * for modules under /people/event-* (ongoing manage; Events stays setup).
 */

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

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
        const dateFrom = String(
          r.venue_access ?? r.setup_start ?? r.event_start ?? "",
        ).slice(0, 10) || null;
        const dateTo = String(r.dismantle_end ?? r.event_end ?? dateFrom ?? "").slice(0, 10) || null;
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
  }),
  async (data, context): Promise<{ rows: PeopleEventAttendanceRow[] }> => {
    let q = context.supabase
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

    const { data: rows, error } = await q;
    if (error) {
      if (/event_id|schema cache/i.test(error.message)) return { rows: [] };
      throw error;
    }
    if (!rows?.length) return { rows: [] };

    const staffIds = [...new Set(rows.map((r) => r.staff_id as string).filter(Boolean))];
    const eventIds = [...new Set(rows.map((r) => r.event_id as string).filter(Boolean))];
    const locIds = [...new Set(rows.map((r) => r.location_id as string).filter(Boolean))];
    const [{ data: staff }, { data: events }, { data: locs }] = await Promise.all([
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code")
        .in("id", staffIds),
      context.supabase
        .from("events")
        .select("id, name, event_name")
        .in("id", eventIds),
      locIds.length
        ? context.supabase.from("locations").select("id, code, name").in("id", locIds)
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
      if (search) {
        const hay =
          `${person?.name ?? ""} ${person?.code ?? ""} ${eventName ?? ""} ${locationName ?? ""}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }
      mapped.push({
        id: r.id as string,
        eventId,
        eventName,
        staffId,
        staffName: person?.name ?? null,
        employeeCode: person?.code ?? null,
        workDate: String(r.work_date).slice(0, 10),
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
