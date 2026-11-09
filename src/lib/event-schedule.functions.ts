"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { bufferMinutesForLocation } from "@/lib/attendance-hr/shift-policy";
import { HEAD_OFFICE_LOCATION_CODE } from "@/lib/department-audience";
import {
  EVENT_CREW_SCHEDULE_CATEGORIES,
  eventCrewScheduleAddShiftMode,
  eventCrewScheduleAllowsPeopleFallback,
  eventCrewScheduleCategoryRoleLabel,
  isEventCrewScheduleActiveStaffStatus,
  selectCrewForScheduleCategory,
  type EventCrewScheduleCategory,
  type EventCrewScheduleRoleCandidate,
} from "@/lib/events/crew-schedule-categories";
import {
  eventRoleAllowsPeopleFallback,
  eventRoleScheduleMode,
  isKnownCrewScheduleCategoryCode,
  matchEventRole,
  resolveLabourHoursPerDay,
} from "@/lib/events/event-roles";
import {
  deriveEventDayStatus,
  enumerateDatesInclusive,
  LABOUR_DAY_DEFAULT_SCHEDULED_IN,
  LABOUR_DAY_DEFAULT_SCHEDULED_OUT,
  normalizeTimeHHMM,
  pairPunchTimes,
  seedSlotsFromAssignments,
  validateScheduleSlotTimes,
} from "@/lib/events/event-schedule";
import { isEventAssignmentClosed } from "@/lib/events/staff-assignments";
import type { EventScheduleSlotRow, EventSchedulePayload } from "@/lib/events/types";
import { ensureEventRoles } from "@/lib/event-roles.functions";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

const EventIdSchema = z.object({ eventId: z.string().uuid() });
const IdSchema = z.object({ id: z.string().uuid() });

async function writeEventAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    eventId?: string | null;
    locationId?: string | null;
    after?: unknown;
    before?: unknown;
  },
) {
  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    event_id: entry.eventId ?? null,
    location_id: entry.locationId ?? null,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
    metadata: {} as Json,
  });
}

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select("id, location_id, name, event_name, event_start, event_end, venue_access, setup_start, dismantle_end")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

async function assertEventCrewOpenForSchedule(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("event_staff_assignments")
    .select("id, status")
    .eq("event_id", eventId)
    .eq("status", "closed")
    .limit(1);
  if (error) {
    if (/status|schema cache/i.test(error.message)) return;
    throw error;
  }
  if ((data ?? []).length > 0) {
    throw new Error("Event crew is closed — reopen or undo close before changing the schedule.");
  }
}

async function loadEventGraceMinutes(context: AuthContext, locationId: string): Promise<number> {
  const { data } = await context.supabase
    .from("attendance_site_settings")
    .select("buffer_minutes")
    .eq("location_id", locationId)
    .maybeSingle();
  return bufferMinutesForLocation(data?.buffer_minutes ?? null);
}

function mapSlot(
  row: Record<string, unknown>,
  staff?: {
    full_name?: string | null;
    employee_code?: string | null;
    job_title?: string | null;
    is_head_office?: boolean;
  } | null,
): EventScheduleSlotRow {
  const code = staff?.employee_code?.trim() || null;
  const name = staff?.full_name?.trim() || null;
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    staff_id: String(row.staff_id),
    staff_name: code && name ? `${code} · ${name}` : name,
    staff_job_title: staff?.job_title ?? null,
    staff_is_head_office: Boolean(staff?.is_head_office),
    assignment_id: (row.assignment_id as string | null) ?? null,
    work_date: String(row.work_date).slice(0, 10),
    scheduled_in: normalizeTimeHHMM(String(row.scheduled_in).slice(0, 8)),
    scheduled_out: normalizeTimeHHMM(String(row.scheduled_out).slice(0, 8)),
    location_id: (row.location_id as string | null) ?? null,
    role_label: (row.role_label as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

async function resolveHeadOfficeLocationId(context: AuthContext): Promise<string | null> {
  const { data } = await context.supabase
    .from("locations")
    .select("id")
    .eq("code", HEAD_OFFICE_LOCATION_CODE)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export const getEventSchedule = createAuthenticatedAction(
  EventIdSchema,
  async (data, context): Promise<EventSchedulePayload> => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { data: slots, error } = await context.supabase
      .from("event_schedule_slots")
      .select(
        "id, event_id, staff_id, assignment_id, work_date, scheduled_in, scheduled_out, location_id, role_label, notes",
      )
      .eq("event_id", data.eventId)
      .order("work_date", { ascending: true })
      .order("scheduled_in", { ascending: true });
    if (error) {
      if (/event_schedule_slots|schema cache/i.test(error.message)) {
        return {
          slots: [],
          attendance: [],
          locationId: event.location_id as string,
          headOfficeLocationId: await resolveHeadOfficeLocationId(context),
          crewClosed: false,
          deviceIds: [],
        };
      }
      throw error;
    }

    const headOfficeLocationId = await resolveHeadOfficeLocationId(context);
    const staffIds = [...new Set((slots ?? []).map((s) => s.staff_id as string))];
    const { data: staff } = staffIds.length
      ? await context.supabase
          .from("staff")
          .select("id, full_name, employee_code, job_title, location_id")
          .in("id", staffIds)
      : {
          data: [] as Array<{
            id: string;
            full_name: string;
            employee_code: string | null;
            job_title: string | null;
            location_id: string | null;
          }>,
        };
    const staffById = new Map(
      (staff ?? []).map((s) => [
        s.id as string,
        {
          full_name: s.full_name as string,
          employee_code: (s.employee_code as string | null) ?? null,
          job_title: (s.job_title as string | null) ?? null,
          is_head_office: Boolean(
            headOfficeLocationId && (s.location_id as string | null) === headOfficeLocationId,
          ),
        },
      ]),
    );

    const mapped = (slots ?? []).map((s) =>
      mapSlot(s as Record<string, unknown>, staffById.get(s.staff_id as string)),
    );

    const { data: att } = await context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, staff_id, work_date, status, actual_in, actual_out, late_minutes, worked_minutes, overtime_minutes, missed_punch, event_id",
      )
      .eq("event_id", data.eventId)
      .order("work_date", { ascending: true });

    const { data: closedRows } = await context.supabase
      .from("event_staff_assignments")
      .select("id")
      .eq("event_id", data.eventId)
      .eq("status", "closed")
      .limit(1);

    let deviceIds: string[] = [];
    {
      const devicesRes = await context.supabase
        .from("event_attendance_devices")
        .select("device_id")
        .eq("event_id", data.eventId);
      if (!devicesRes.error) {
        deviceIds = (devicesRes.data ?? []).map((d) => d.device_id as string);
      }
    }

    return {
      slots: mapped,
      attendance: (att ?? []).map((a) => ({
        id: a.id as string,
        staff_id: a.staff_id as string,
        staff_name: (() => {
          const s = staffById.get(a.staff_id as string);
          if (!s) return null;
          const code = s.employee_code?.trim();
          const name = s.full_name?.trim();
          return code && name ? `${code} · ${name}` : name ?? null;
        })(),
        work_date: String(a.work_date).slice(0, 10),
        status: String(a.status ?? ""),
        actual_in: (a.actual_in as string | null) ?? null,
        actual_out: (a.actual_out as string | null) ?? null,
        late_minutes: Number(a.late_minutes ?? 0),
        worked_minutes: Number(a.worked_minutes ?? 0),
        overtime_minutes: Number(a.overtime_minutes ?? 0),
        missed_punch: Boolean(a.missed_punch),
      })),
      locationId: (event.location_id as string) ?? null,
      headOfficeLocationId,
      crewClosed: (closedRows ?? []).length > 0,
      deviceIds,
    };
  },
  { auth: { capability: "events.view" } },
);

export const upsertEventScheduleSlot = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    eventId: z.string().uuid(),
    staff_id: z.string().uuid(),
    assignment_id: z.string().uuid().optional().nullable(),
    work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scheduled_in: z.string().min(4).max(8),
    scheduled_out: z.string().min(4).max(8),
    role_label: z.string().max(120).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    await assertEventCrewOpenForSchedule(context, data.eventId);
    const timeErr = validateScheduleSlotTimes(data.scheduled_in, data.scheduled_out);
    if (timeErr) throw new Error(timeErr);
    const payload = {
      event_id: data.eventId,
      staff_id: data.staff_id,
      assignment_id: data.assignment_id ?? null,
      work_date: data.work_date,
      scheduled_in: normalizeTimeHHMM(data.scheduled_in) + ":00",
      scheduled_out: normalizeTimeHHMM(data.scheduled_out) + ":00",
      location_id: event.location_id as string,
      role_label: data.role_label?.trim() || null,
      notes: data.notes?.trim() || null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    let id = data.id ?? null;
    if (data.id) {
      const { error } = await context.supabase
        .from("event_schedule_slots")
        .update(payload)
        .eq("id", data.id)
        .eq("event_id", data.eventId);
      if (error) throw error;
    } else {
      const { data: created, error } = await context.supabase
        .from("event_schedule_slots")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) throw error;
      id = created.id as string;
    }
    await writeEventAudit(context, {
      action: data.id ? "schedule_update" : "schedule_add",
      entityType: "event_schedule_slot",
      entityId: id,
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: payload,
    });
    return { id };
  },
  { auth: { capability: "events.edit" } },
);

export const deleteEventScheduleSlot = createAuthenticatedAction(IdSchema, async (data, context) => {
  const { data: row } = await context.supabase
    .from("event_schedule_slots")
    .select("id, event_id")
    .eq("id", data.id)
    .maybeSingle();
  if (!row) throw new Error("Schedule slot not found");
  const event = await loadEventOrThrow(context, row.event_id as string);
  const { error } = await context.supabase.from("event_schedule_slots").delete().eq("id", data.id);
  if (error) throw error;
  await writeEventAudit(context, {
    action: "schedule_remove",
    entityType: "event_schedule_slot",
    entityId: data.id,
    eventId: event.id as string,
    locationId: event.location_id as string,
  });
  return { ok: true };
}, { auth: { capability: "events.edit" } });

/**
 * Labour day assignment: one staff + inclusive date range.
 * Not a traditional shift module — start/end default to the 10h labour day window
 * so process-attendance can still pair punches. Skips duplicate staff+date+in rows.
 */
export const upsertEventScheduleSlotRange = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    staff_id: z.string().uuid(),
    assignment_id: z.string().uuid().optional().nullable(),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scheduled_in: z.string().min(4).max(8).optional().nullable(),
    scheduled_out: z.string().min(4).max(8).optional().nullable(),
    role_label: z.string().max(120).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    await assertEventCrewOpenForSchedule(context, data.eventId);
    const inRaw = data.scheduled_in?.trim() || LABOUR_DAY_DEFAULT_SCHEDULED_IN;
    const outRaw = data.scheduled_out?.trim() || LABOUR_DAY_DEFAULT_SCHEDULED_OUT;
    const timeErr = validateScheduleSlotTimes(inRaw, outRaw);
    if (timeErr) throw new Error(timeErr);
    if (data.date_to < data.date_from) throw new Error("End date must be on or after start");
    const dates = enumerateDatesInclusive(data.date_from, data.date_to);
    if (!dates.length) throw new Error("Invalid date range");

    const scheduledIn = normalizeTimeHHMM(inRaw);
    const scheduledOut = normalizeTimeHHMM(outRaw);
    const roleLabel = data.role_label?.trim() || null;
    const notes = data.notes?.trim() || null;
    let inserted = 0;

    for (const work_date of dates) {
      const { error: insErr } = await context.supabase.from("event_schedule_slots").insert({
        event_id: data.eventId,
        staff_id: data.staff_id,
        assignment_id: data.assignment_id ?? null,
        work_date,
        scheduled_in: scheduledIn + ":00",
        scheduled_out: scheduledOut + ":00",
        location_id: event.location_id as string,
        role_label: roleLabel,
        notes,
        created_by: context.userId,
        updated_by: context.userId,
      });
      if (insErr) {
        if (/duplicate|unique/i.test(insErr.message)) continue;
        throw insErr;
      }
      inserted += 1;
    }

    await writeEventAudit(context, {
      action: "schedule_add_range",
      entityType: "event_schedule_slot",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: {
        staff_id: data.staff_id,
        date_from: data.date_from,
        date_to: data.date_to,
        scheduled_in: scheduledIn,
        scheduled_out: scheduledOut,
        role_label: roleLabel,
        inserted,
        attempted: dates.length,
      },
    });
    return { inserted, attempted: dates.length };
  },
  { auth: { capability: "events.edit" } },
);

/**
 * Resolve staff for a role-only schedule add.
 * Prefer open Staffing assignments matching the category; else People fallback ids.
 */
async function resolveRoleScheduleTargets(
  context: AuthContext,
  input: {
    eventId: string;
    category: EventCrewScheduleCategory;
    staffId?: string | null;
    fallbackStaffIds?: string[];
  },
): Promise<EventCrewScheduleRoleCandidate[]> {
  const headOfficeLocationId = await resolveHeadOfficeLocationId(context);
  const allowPeopleFallback = eventCrewScheduleAllowsPeopleFallback(input.category);
  const { data: assignments, error } = await context.supabase
    .from("event_staff_assignments")
    .select("id, staff_id, role_label, status")
    .eq("event_id", input.eventId);
  if (error) throw error;

  const open = (assignments ?? []).filter((a) => !isEventAssignmentClosed(a));
  const assignmentStaffIds = [...new Set(open.map((a) => a.staff_id as string))];
  // People fallback is Management (Head Office) only — never the full company roster for other roles.
  const fallbackIds = allowPeopleFallback
    ? [...new Set((input.fallbackStaffIds ?? []).filter(Boolean))]
    : [];
  const lookupIds = [...new Set([...assignmentStaffIds, ...fallbackIds, input.staffId].filter(Boolean))] as string[];

  const { data: staffRows } = lookupIds.length
    ? await context.supabase
        .from("staff")
        .select("id, job_title, location_id, status")
        .in("id", lookupIds)
        .is("deleted_at", null)
    : {
        data: [] as Array<{
          id: string;
          job_title: string | null;
          location_id: string | null;
          status: string | null;
        }>,
      };

  const staffById = new Map(
    (staffRows ?? []).map((s) => [
      s.id as string,
      {
        job_title: (s.job_title as string | null) ?? null,
        status: (s.status as string | null) ?? null,
        is_head_office: Boolean(
          headOfficeLocationId && (s.location_id as string | null) === headOfficeLocationId,
        ),
      },
    ]),
  );

  const fromAssignments = selectCrewForScheduleCategory(
    open.map((a) => {
      const person = staffById.get(a.staff_id as string);
      return {
        staff_id: a.staff_id as string,
        assignment_id: a.id as string,
        role_label: (a.role_label as string | null) ?? null,
        job_title: person?.job_title ?? null,
        is_head_office: person?.is_head_office ?? false,
        status: person?.status ?? null,
      };
    }),
    input.category,
  );

  let targets = fromAssignments;
  if (!targets.length && fallbackIds.length) {
    targets = selectCrewForScheduleCategory(
      fallbackIds
        .map((staff_id): EventCrewScheduleRoleCandidate | null => {
          const person = staffById.get(staff_id);
          if (!person?.is_head_office) return null;
          return {
            staff_id,
            assignment_id: null,
            role_label: eventCrewScheduleCategoryRoleLabel(input.category),
            job_title: person.job_title,
            is_head_office: true,
            status: person.status,
          };
        })
        .filter((row): row is EventCrewScheduleRoleCandidate => row != null),
      input.category,
    );
  }

  if (input.staffId) {
    const one = targets.find((t) => t.staff_id === input.staffId);
    if (one) return [one];
    const person = staffById.get(input.staffId);
    if (!person) throw new Error("Staff not found");
    if (!isEventCrewScheduleActiveStaffStatus(person.status)) {
      throw new Error("That person is not active — terminated or inactive staff cannot be scheduled.");
    }
    const assignment = open.find((a) => (a.staff_id as string) === input.staffId);
    if (!assignment && !(allowPeopleFallback && person.is_head_office)) {
      throw new Error(
        "That person is not on Staffing for this event. Add them on the Staffing tab first.",
      );
    }
    return [
      {
        staff_id: input.staffId,
        assignment_id: (assignment?.id as string | undefined) ?? null,
        role_label:
          (assignment?.role_label as string | null | undefined) ??
          eventCrewScheduleCategoryRoleLabel(input.category),
        job_title: person.job_title,
        is_head_office: person.is_head_office,
        status: person.status,
      },
    ];
  }

  return targets;
}

/**
 * Role-only schedule add: one slot (or labour day range) per staff in the role.
 * Prefer event_role_id (event master roles). Legacy category still supported.
 * People/Head Office fallback is Management-style shift roles only.
 * Optional staff_id limits the add to one person.
 */
async function resolveEventRoleScheduleTargets(
  context: AuthContext,
  input: {
    eventId: string;
    role: { id: string; code: string; name: string; kind: string };
    staffId?: string | null;
    fallbackStaffIds?: string[];
  },
): Promise<EventCrewScheduleRoleCandidate[]> {
  const headOfficeLocationId = await resolveHeadOfficeLocationId(context);
  const allowPeopleFallback = eventRoleAllowsPeopleFallback(input.role);
  const { data: assignments, error } = await context.supabase
    .from('event_staff_assignments')
    .select('id, staff_id, role_label, event_role_id, status')
    .eq('event_id', input.eventId);
  if (error && !/event_role_id|schema cache/i.test(error.message)) throw error;

  const open = ((assignments ?? []) as Array<Record<string, unknown>>).filter(
    (a) => !isEventAssignmentClosed(a),
  );
  const staffIds = [...new Set(open.map((a) => String(a.staff_id)))];
  const { data: staffRows } = staffIds.length
    ? await context.supabase
        .from('staff')
        .select('id, job_title, location_id, status')
        .in('id', staffIds)
    : { data: [] as Array<Record<string, unknown>> };
  const staffMap = new Map((staffRows ?? []).map((s) => [String(s.id), s]));

  const candidates: EventCrewScheduleRoleCandidate[] = [];
  for (const a of open) {
    const staff = staffMap.get(String(a.staff_id));
    const person = {
      event_role_id: (a.event_role_id as string | null | undefined) ?? null,
      role_label: (a.role_label as string | null | undefined) ?? null,
      job_title: (staff?.job_title as string | null | undefined) ?? null,
      is_head_office: Boolean(
        headOfficeLocationId && staff?.location_id === headOfficeLocationId,
      ),
    };
    const matched = matchEventRole([input.role], person);
    if (!matched) continue;
    if (!isEventCrewScheduleActiveStaffStatus((staff?.status as string | null) ?? null)) continue;
    candidates.push({
      staff_id: String(a.staff_id),
      assignment_id: String(a.id),
      role_label: person.role_label,
      job_title: person.job_title,
      is_head_office: person.is_head_office,
      status: (staff?.status as string | null) ?? null,
    });
  }

  if (input.staffId) {
    const hit = candidates.find((c) => c.staff_id === input.staffId);
    if (hit) return [hit];
    if (allowPeopleFallback && input.fallbackStaffIds?.includes(input.staffId)) {
      return [
        {
          staff_id: input.staffId,
          assignment_id: null,
          role_label: input.role.name,
          is_head_office: true,
        },
      ];
    }
    throw new Error(
      'That person is not on Staffing for this event. Add them on the Staffing tab first.',
    );
  }

  if (candidates.length) return candidates;

  if (allowPeopleFallback && input.fallbackStaffIds?.length) {
    return input.fallbackStaffIds.map((id) => ({
      staff_id: id,
      assignment_id: null,
      role_label: input.role.name,
      is_head_office: true,
    }));
  }
  return [];
}

export const addEventScheduleForRole = createAuthenticatedAction(
  z
    .object({
      eventId: z.string().uuid(),
      event_role_id: z.string().uuid().optional().nullable(),
      category: z.enum(EVENT_CREW_SCHEDULE_CATEGORIES).optional(),
      staff_id: z.string().uuid().optional().nullable(),
      fallback_staff_ids: z.array(z.string().uuid()).max(200).optional(),
      work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      scheduled_in: z.string().min(4).max(8).optional().nullable(),
      scheduled_out: z.string().min(4).max(8).optional().nullable(),
      hours_per_day: z.number().min(1).max(24).optional().nullable(),
      day_rate_qar: z.number().min(0).optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
    })
    .superRefine((val, ctx) => {
      if (!val.event_role_id && !val.category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'event_role_id or category is required',
        });
      }
    }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    await assertEventCrewOpenForSchedule(context, data.eventId);

    const eventRoles = await ensureEventRoles(context, data.eventId);
    const selectedRole = data.event_role_id
      ? eventRoles.find((r) => r.id === data.event_role_id && r.is_active !== false) ?? null
      : null;
    const category =
      (data.category as EventCrewScheduleCategory | undefined) ??
      (selectedRole && isKnownCrewScheduleCategoryCode(selectedRole.code)
        ? selectedRole.code
        : 'crew');
    const mode = selectedRole
      ? eventRoleScheduleMode(selectedRole.kind)
      : eventCrewScheduleAddShiftMode(category);
    const roleLabel = selectedRole?.name ?? eventCrewScheduleCategoryRoleLabel(category);
    const eventRoleId = selectedRole?.id ?? null;
    const hoursPerDay =
      mode === 'labour_days'
        ? resolveLabourHoursPerDay({
            hours_per_day: data.hours_per_day,
            role_default_hours_per_day: selectedRole?.default_hours_per_day,
          })
        : null;
    const dayRateQar =
      mode === 'labour_days'
        ? data.day_rate_qar ?? selectedRole?.default_day_rate_qar ?? null
        : null;
    const notes = data.notes?.trim() || null;

    if (mode === 'labour_days') {
      if (!data.date_from || !data.date_to) {
        throw new Error('Labour roles require date_from and date_to');
      }
    } else if (!data.work_date) {
      throw new Error('Shift roles require work_date');
    }

    const targets = selectedRole
      ? await resolveEventRoleScheduleTargets(context, {
          eventId: data.eventId,
          role: selectedRole,
          staffId: data.staff_id,
          fallbackStaffIds: data.fallback_staff_ids,
        })
      : await resolveRoleScheduleTargets(context, {
          eventId: data.eventId,
          category,
          staffId: data.staff_id,
          fallbackStaffIds: data.fallback_staff_ids,
        });
    if (!targets.length) {
      const allowPeople = selectedRole
        ? eventRoleAllowsPeopleFallback(selectedRole)
        : eventCrewScheduleAllowsPeopleFallback(category);
      throw new Error(
        allowPeople
          ? 'No Head Office or Staffing staff in this role. Add them on Staffing, or ensure Head Office people exist.'
          : 'No Staffing crew in this role for the event. Add them on the Staffing tab first.',
      );
    }

    let inserted = 0;
    let attempted = 0;

    async function insertSlot(row: Record<string, unknown>) {
      attempted += 1;
      const { error: insErr } = await context.supabase.from('event_schedule_slots').insert(row);
      if (insErr) {
        if (/event_role_id|hours_per_day|day_rate_qar|schema cache/i.test(insErr.message)) {
          const {
            event_role_id: _er,
            hours_per_day: _h,
            day_rate_qar: _d,
            ...legacy
          } = row;
          const retry = await context.supabase.from('event_schedule_slots').insert(legacy);
          if (retry.error) {
            if (/duplicate|unique/i.test(retry.error.message)) return;
            throw retry.error;
          }
          inserted += 1;
          return;
        }
        if (/duplicate|unique/i.test(insErr.message)) return;
        throw insErr;
      }
      inserted += 1;
    }

    if (mode === 'labour_days') {
      const dateFrom = data.date_from!;
      const dateTo = data.date_to!;
      if (dateTo < dateFrom) throw new Error('End date must be on or after start');
      const dates = enumerateDatesInclusive(dateFrom, dateTo);
      if (!dates.length) throw new Error('Invalid date range');
      const scheduledIn = normalizeTimeHHMM(
        data.scheduled_in?.trim() || LABOUR_DAY_DEFAULT_SCHEDULED_IN,
      );
      const scheduledOut = normalizeTimeHHMM(
        data.scheduled_out?.trim() || LABOUR_DAY_DEFAULT_SCHEDULED_OUT,
      );
      const timeErr = validateScheduleSlotTimes(scheduledIn, scheduledOut);
      if (timeErr) throw new Error(timeErr);

      for (const target of targets) {
        for (const work_date of dates) {
          await insertSlot({
            event_id: data.eventId,
            staff_id: target.staff_id,
            assignment_id: target.assignment_id ?? null,
            work_date,
            scheduled_in: scheduledIn + ':00',
            scheduled_out: scheduledOut + ':00',
            location_id: event.location_id as string,
            role_label: roleLabel,
            event_role_id: eventRoleId,
            hours_per_day: hoursPerDay,
            day_rate_qar: dayRateQar,
            notes,
            created_by: context.userId,
            updated_by: context.userId,
          });
        }
      }
    } else {
      const workDate = data.work_date!;
      const scheduledIn = normalizeTimeHHMM(data.scheduled_in?.trim() || '09:00');
      const scheduledOut = normalizeTimeHHMM(data.scheduled_out?.trim() || '18:00');
      const timeErr = validateScheduleSlotTimes(scheduledIn, scheduledOut);
      if (timeErr) throw new Error(timeErr);

      for (const target of targets) {
        await insertSlot({
          event_id: data.eventId,
          staff_id: target.staff_id,
          assignment_id: target.assignment_id ?? null,
          work_date: workDate,
          scheduled_in: scheduledIn + ':00',
          scheduled_out: scheduledOut + ':00',
          location_id: event.location_id as string,
          role_label: roleLabel,
          event_role_id: eventRoleId,
          hours_per_day: null,
          day_rate_qar: null,
          notes,
          created_by: context.userId,
          updated_by: context.userId,
        });
      }
    }

    await writeEventAudit(context, {
      action: 'schedule_add_role',
      entityType: 'event_schedule_slot',
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: {
        category,
        event_role_id: eventRoleId,
        mode,
        staff_count: targets.length,
        staff_ids: targets.map((t) => t.staff_id),
        inserted,
        attempted,
        work_date: data.work_date ?? null,
        date_from: data.date_from ?? null,
        date_to: data.date_to ?? null,
        single_staff: data.staff_id ?? null,
        hours_per_day: hoursPerDay,
        day_rate_qar: dayRateQar,
      },
    });
    return {
      inserted,
      attempted,
      staffCount: targets.length,
      mode,
      category,
      event_role_id: eventRoleId,
    };
  },
  { auth: { capability: 'events.edit' } },
);

/** Seed one default shift per crew assignment day (skips existing staff+date+in). */
export const seedEventScheduleFromCrew = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    scheduled_in: z.string().optional(),
    scheduled_out: z.string().optional(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    await assertEventCrewOpenForSchedule(context, data.eventId);
    const { data: assignments, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, staff_id, date_from, date_to, role_label, status")
      .eq("event_id", data.eventId);
    if (error) throw error;
    if (!assignments?.length) throw new Error("Add event crew on the Staffing tab first.");
    const open = (assignments ?? []).filter((a) => !isEventAssignmentClosed(a));
    if (!open.length) throw new Error("All crew assignments are closed — cannot seed schedule.");

    const seeds = seedSlotsFromAssignments(
      data.eventId,
      open.map((a) => ({
        id: a.id as string,
        staff_id: a.staff_id as string,
        date_from: String(a.date_from).slice(0, 10),
        date_to: String(a.date_to).slice(0, 10),
        role_label: (a.role_label as string | null) ?? null,
      })),
      { scheduledIn: data.scheduled_in, scheduledOut: data.scheduled_out },
    );

    let inserted = 0;
    for (const seed of seeds) {
      const { error: insErr } = await context.supabase.from("event_schedule_slots").insert({
        ...seed,
        scheduled_in: seed.scheduled_in + ":00",
        scheduled_out: seed.scheduled_out + ":00",
        location_id: event.location_id as string,
        created_by: context.userId,
        updated_by: context.userId,
      });
      if (insErr) {
        if (/duplicate|unique/i.test(insErr.message)) continue;
        throw insErr;
      }
      inserted += 1;
    }
    await writeEventAudit(context, {
      action: "schedule_seed",
      entityType: "event_schedule_slot",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { inserted, attempted: seeds.length },
    });
    return { inserted, attempted: seeds.length };
  },
  { auth: { capability: "events.edit" } },
);

/**
 * Process punches at the event venue into attendance_daily_summary tagged with event_id.
 * Reuses host-site biometric logs (location_id = event.location_id) for scheduled crew days.
 * Optional dateFrom/dateTo limit which schedule slots are processed (bulk range).
 */
export const processEventAttendance = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;
    if (!locationId) throw new Error("Event has no location — set venue location first.");

    let slotQ = context.supabase
      .from("event_schedule_slots")
      .select("id, staff_id, work_date, scheduled_in, scheduled_out")
      .eq("event_id", data.eventId);
    if (data.dateFrom) slotQ = slotQ.gte("work_date", data.dateFrom);
    if (data.dateTo) slotQ = slotQ.lte("work_date", data.dateTo);
    const { data: slots, error: slotErr } = await slotQ;
    if (slotErr) throw slotErr;
    if (!slots?.length) {
      throw new Error(
        data.dateFrom || data.dateTo
          ? "No schedule slots in that date range — widen the range or seed from crew."
          : "No schedule slots — seed from crew or add shifts first.",
      );
    }

    const dates = [...new Set(slots.map((s) => String(s.work_date).slice(0, 10)))].sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];
    const staffIds = [...new Set(slots.map((s) => s.staff_id as string))];
    const graceMinutes = await loadEventGraceMinutes(context, locationId);

    let deviceIds: string[] = [];
    {
      const linkedRes = await context.supabase
        .from("event_attendance_devices")
        .select("device_id")
        .eq("event_id", data.eventId);
      if (!linkedRes.error) {
        deviceIds = (linkedRes.data ?? []).map((d) => d.device_id as string);
      }
    }

    let punchQ = supabaseAdmin
      .from("attendance_logs")
      .select("id, staff_id, punch_at, attendance_date, location_id, device_id")
      .in("staff_id", staffIds)
      .gte("attendance_date", dateFrom)
      .lte("attendance_date", dateTo)
      .order("punch_at", { ascending: true });
    if (deviceIds.length) {
      // Prefer dedicated event devices when linked; do not require host location_id.
      punchQ = punchQ.in("device_id", deviceIds);
    } else {
      punchQ = punchQ.eq("location_id", locationId);
    }
    const { data: punches, error: punchErr } = await punchQ;
    if (punchErr) throw punchErr;

    // Tag matching punches with event_id + keep location_id (venue attribution).
    const punchIds = (punches ?? []).map((p) => p.id as string);
    if (punchIds.length) {
      for (let i = 0; i < punchIds.length; i += 200) {
        const chunk = punchIds.slice(i, i + 200);
        await supabaseAdmin
          .from("attendance_logs")
          .update({ event_id: data.eventId })
          .in("id", chunk);
      }
    }

    const punchesByStaffDate = new Map<string, string[]>();
    for (const p of punches ?? []) {
      const staffId = p.staff_id as string;
      const day = String(p.attendance_date ?? "").slice(0, 10);
      if (!staffId || !day) continue;
      const key = `${staffId}|${day}`;
      const list = punchesByStaffDate.get(key) ?? [];
      list.push(String(p.punch_at));
      punchesByStaffDate.set(key, list);
    }

    let upserted = 0;
    for (const slot of slots) {
      const staffId = slot.staff_id as string;
      const workDate = String(slot.work_date).slice(0, 10);
      const scheduledIn = normalizeTimeHHMM(String(slot.scheduled_in).slice(0, 8));
      const scheduledOut = normalizeTimeHHMM(String(slot.scheduled_out).slice(0, 8));
      const punchTimes = punchesByStaffDate.get(`${staffId}|${workDate}`) ?? [];
      const { actualIn, actualOut } = pairPunchTimes(punchTimes);
      const derived = deriveEventDayStatus({
        actualIn,
        actualOut,
        workDate,
        scheduledIn,
        scheduledOut,
        graceMinutes,
      });

      // Same subject as site recalc so we don't violate staff+location+date uniqueness.
      const subjectKey = `staff:${staffId}`;

      const row = {
        location_id: locationId,
        staff_id: staffId,
        work_date: workDate,
        subject_key: subjectKey,
        event_id: data.eventId,
        status: derived.status,
        scheduled_in: derived.scheduledInIso,
        scheduled_out: derived.scheduledOutIso,
        actual_in: actualIn,
        actual_out: actualOut,
        late_minutes: derived.lateMinutes,
        worked_minutes: derived.workedMinutes,
        overtime_minutes: derived.overtimeMinutes,
        missed_punch: derived.missedPunch,
        punch_count: punchTimes.length,
        updated_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabaseAdmin
        .from("attendance_daily_summary")
        .upsert(row, { onConflict: "location_id,subject_key,work_date" });
      if (upErr) {
        const { error: updErr } = await supabaseAdmin
          .from("attendance_daily_summary")
          .update(row)
          .eq("location_id", locationId)
          .eq("subject_key", subjectKey)
          .eq("work_date", workDate);
        if (updErr) {
          const { error: insErr } = await supabaseAdmin.from("attendance_daily_summary").insert(row);
          if (insErr && !/duplicate|unique/i.test(insErr.message)) throw insErr;
          if (!insErr) upserted += 1;
          continue;
        }
      }
      upserted += 1;
    }

    await writeEventAudit(context, {
      action: "attendance_process",
      entityType: "event_attendance",
      eventId: data.eventId,
      locationId,
      after: {
        slots: slots.length,
        upserted,
        punches: punches?.length ?? 0,
        deviceIds: deviceIds.length ? deviceIds : null,
      },
    });

    return { slots: slots.length, upserted, punches: punches?.length ?? 0, deviceIds };
  },
  { auth: { capability: "events.edit" } },
);

/**
 * Devices eligible to dedicate to an event:
 * - unassigned (location_id IS NULL), plus
 * - any already saved on this event (so site-linked selections stay visible).
 */
export const listEventLinkableDevices = createAuthenticatedAction(
  EventIdSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = (event.location_id as string | null) ?? null;
    const linkedRes = await context.supabase
      .from("event_attendance_devices")
      .select("device_id")
      .eq("event_id", data.eventId);
    const linkedIds = [
      ...new Set(
        linkedRes.error ? [] : (linkedRes.data ?? []).map((r) => r.device_id as string),
      ),
    ];

    // Admin read: unassigned devices are company-scoped and may be invisible under
    // location RLS for event editors who are not HR.
    let deviceQ = supabaseAdmin
      .from("attendance_devices")
      .select("id, device_code, device_name, location_id, serial_number")
      .order("device_name");
    if (linkedIds.length) {
      deviceQ = deviceQ.or(`location_id.is.null,id.in.(${linkedIds.join(",")})`);
    } else {
      deviceQ = deviceQ.is("location_id", null);
    }
    const { data: devices, error } = await deviceQ;
    if (error) throw error;

    const linkedSet = new Set(linkedIds);
    return {
      locationId,
      devices: (devices ?? []).map((d) => ({
        id: d.id as string,
        deviceCode: String(d.device_code ?? ""),
        deviceName: String(d.device_name ?? ""),
        locationId: (d.location_id as string | null) ?? null,
        serialNumber: (d.serial_number as string | null) ?? null,
        linked: linkedSet.has(d.id as string),
        hostSite: locationId != null && d.location_id === locationId,
      })),
    };
  },
  { auth: { capability: "events.view" } },
);

/** Replace the dedicated event device set (empty = fall back to host site). */
export const setEventAttendanceDevices = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    deviceIds: z.array(z.string().uuid()).max(40),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const unique = [...new Set(data.deviceIds)];
    const { error: delErr } = await context.supabase
      .from("event_attendance_devices")
      .delete()
      .eq("event_id", data.eventId);
    if (delErr) {
      if (/event_attendance_devices|schema cache/i.test(delErr.message)) {
        throw new Error("Event device linking is not applied yet — run migrations.");
      }
      throw delErr;
    }
    if (unique.length) {
      const { error: insErr } = await context.supabase.from("event_attendance_devices").insert(
        unique.map((device_id) => ({
          event_id: data.eventId,
          device_id,
          created_by: context.userId,
        })),
      );
      if (insErr) throw insErr;
    }
    await writeEventAudit(context, {
      action: "event_devices_set",
      entityType: "event_attendance_devices",
      eventId: data.eventId,
      locationId: event.location_id as string,
      after: { deviceIds: unique },
    });
    return { deviceIds: unique };
  },
  { auth: { capability: "events.edit" } },
);
