"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  deriveEventDayStatus,
  normalizeTimeHHMM,
  pairPunchTimes,
  seedSlotsFromAssignments,
  validateScheduleSlotTimes,
} from "@/lib/events/event-schedule";
import type { EventScheduleSlotRow, EventSchedulePayload } from "@/lib/events/types";
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

function mapSlot(row: Record<string, unknown>, staffName?: string | null): EventScheduleSlotRow {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    staff_id: String(row.staff_id),
    staff_name: staffName ?? null,
    assignment_id: (row.assignment_id as string | null) ?? null,
    work_date: String(row.work_date).slice(0, 10),
    scheduled_in: normalizeTimeHHMM(String(row.scheduled_in).slice(0, 8)),
    scheduled_out: normalizeTimeHHMM(String(row.scheduled_out).slice(0, 8)),
    location_id: (row.location_id as string | null) ?? null,
    role_label: (row.role_label as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
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
        return { slots: [], attendance: [], locationId: event.location_id as string };
      }
      throw error;
    }

    const staffIds = [...new Set((slots ?? []).map((s) => s.staff_id as string))];
    const { data: staff } = staffIds.length
      ? await context.supabase.from("staff").select("id, full_name").in("id", staffIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const nameById = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));

    const mapped = (slots ?? []).map((s) => mapSlot(s as Record<string, unknown>, nameById.get(s.staff_id as string)));

    const { data: att } = await context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, staff_id, work_date, status, actual_in, actual_out, late_minutes, worked_minutes, missed_punch, event_id",
      )
      .eq("event_id", data.eventId)
      .order("work_date", { ascending: true });

    return {
      slots: mapped,
      attendance: (att ?? []).map((a) => ({
        id: a.id as string,
        staff_id: a.staff_id as string,
        staff_name: nameById.get(a.staff_id as string) ?? null,
        work_date: String(a.work_date).slice(0, 10),
        status: String(a.status ?? ""),
        actual_in: (a.actual_in as string | null) ?? null,
        actual_out: (a.actual_out as string | null) ?? null,
        late_minutes: Number(a.late_minutes ?? 0),
        worked_minutes: Number(a.worked_minutes ?? 0),
        missed_punch: Boolean(a.missed_punch),
      })),
      locationId: (event.location_id as string) ?? null,
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

/** Seed one default shift per crew assignment day (skips existing staff+date+in). */
export const seedEventScheduleFromCrew = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    scheduled_in: z.string().optional(),
    scheduled_out: z.string().optional(),
  }),
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const { data: assignments, error } = await context.supabase
      .from("event_staff_assignments")
      .select("id, staff_id, date_from, date_to, role_label")
      .eq("event_id", data.eventId);
    if (error) throw error;
    if (!assignments?.length) throw new Error("Add event crew on the Staffing tab first.");

    const seeds = seedSlotsFromAssignments(
      data.eventId,
      assignments.map((a) => ({
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
 */
export const processEventAttendance = createAuthenticatedAction(
  EventIdSchema,
  async (data, context) => {
    const event = await loadEventOrThrow(context, data.eventId);
    const locationId = event.location_id as string;
    if (!locationId) throw new Error("Event has no location — set venue location first.");

    const { data: slots, error: slotErr } = await context.supabase
      .from("event_schedule_slots")
      .select("id, staff_id, work_date, scheduled_in, scheduled_out")
      .eq("event_id", data.eventId);
    if (slotErr) throw slotErr;
    if (!slots?.length) throw new Error("No schedule slots — seed from crew or add shifts first.");

    const dates = [...new Set(slots.map((s) => String(s.work_date).slice(0, 10)))].sort();
    const dateFrom = dates[0];
    const dateTo = dates[dates.length - 1];
    const staffIds = [...new Set(slots.map((s) => s.staff_id as string))];

    const { data: punches, error: punchErr } = await supabaseAdmin
      .from("attendance_logs")
      .select("id, staff_id, punch_at, attendance_date, location_id")
      .in("staff_id", staffIds)
      .eq("location_id", locationId)
      .gte("attendance_date", dateFrom)
      .lte("attendance_date", dateTo)
      .order("punch_at", { ascending: true });
    if (punchErr) throw punchErr;

    // Tag matching punches with event_id (nullable bridge).
    const punchIds = (punches ?? []).map((p) => p.id as string);
    if (punchIds.length) {
      for (let i = 0; i < punchIds.length; i += 200) {
        const chunk = punchIds.slice(i, i + 200);
        await supabaseAdmin.from("attendance_logs").update({ event_id: data.eventId }).in("id", chunk);
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
      });

      // Same subject as site recalc so we don't violate staff+location+date uniqueness.
      const subjectKey = `staff:${staffId}`;
      const scheduledInTs = `${workDate}T${scheduledIn}:00`;
      const scheduledOutTs = `${workDate}T${scheduledOut}:00`;

      const row = {
        location_id: locationId,
        staff_id: staffId,
        work_date: workDate,
        subject_key: subjectKey,
        event_id: data.eventId,
        status: derived.status,
        scheduled_in: scheduledInTs,
        scheduled_out: scheduledOutTs,
        actual_in: actualIn,
        actual_out: actualOut,
        late_minutes: derived.lateMinutes,
        worked_minutes: derived.workedMinutes,
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
      after: { slots: slots.length, upserted, punches: punches?.length ?? 0 },
    });

    return { slots: slots.length, upserted, punches: punches?.length ?? 0 };
  },
  { auth: { capability: "events.edit" } },
);
