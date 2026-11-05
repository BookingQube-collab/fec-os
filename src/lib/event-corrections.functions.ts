"use server";

import { z } from "zod";

import type { EventCorrectionRow, EventMissedPunchDayRow } from "@/lib/events/types";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

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

async function eventCrewStaffIds(context: AuthContext, eventId: string): Promise<string[]> {
  const { data, error } = await context.supabase
    .from("event_staff_assignments")
    .select("staff_id, date_from, date_to")
    .eq("event_id", eventId);
  if (error) {
    if (/event_staff_assignments|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return [...new Set((data ?? []).map((r) => r.staff_id as string))];
}

function eventDateWindow(event: Record<string, unknown>): { dateFrom: string; dateTo: string } {
  const dateFrom =
    String(event.venue_access ?? event.setup_start ?? event.event_start ?? "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const dateTo =
    String(event.dismantle_end ?? event.event_end ?? dateFrom).slice(0, 10) || dateFrom;
  return { dateFrom, dateTo: dateTo < dateFrom ? dateFrom : dateTo };
}

/**
 * Missed-punch / incomplete days for event crew (attendance_daily_summary.event_id).
 * Deep-link target from Events → Crew schedule.
 */
export const listEventMissedPunchDays = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context): Promise<{ days: EventMissedPunchDayRow[]; locationId: string | null }> => {
    const event = await loadEventOrThrow(context, data.eventId);
    const staffIds = await eventCrewStaffIds(context, data.eventId);
    if (!staffIds.length) return { days: [], locationId: event.location_id as string };

    const { data: summaries, error } = await context.supabase
      .from("attendance_daily_summary")
      .select(
        "id, staff_id, work_date, status, actual_in, actual_out, late_minutes, missed_punch, event_id",
      )
      .eq("event_id", data.eventId)
      .in("staff_id", staffIds)
      .order("work_date", { ascending: true });
    if (error) throw error;

    const missed = (summaries ?? []).filter(
      (s) =>
        Boolean(s.missed_punch) ||
        String(s.status ?? "") === "missed_punch" ||
        (Boolean(s.actual_in) !== Boolean(s.actual_out)),
    );
    if (!missed.length) return { days: [], locationId: event.location_id as string };

    const summaryIds = missed.map((s) => s.id as string);
    const { data: openCorr } = await context.supabase
      .from("attendance_corrections")
      .select("id, summary_id, status, staff_id, work_date")
      .in("summary_id", summaryIds)
      .in("status", ["pending", "change_required"]);

    const openBySummary = new Map<string, { id: string; status: string }>();
    for (const c of openCorr ?? []) {
      if (!c.summary_id) continue;
      openBySummary.set(c.summary_id as string, {
        id: c.id as string,
        status: String(c.status),
      });
    }

    const nameIds = [...new Set(missed.map((s) => s.staff_id as string))];
    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, full_name")
      .in("id", nameIds);
    const nameById = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));

    return {
      locationId: event.location_id as string,
      days: missed.map((s) => {
        const open = openBySummary.get(s.id as string) ?? null;
        return {
          summaryId: s.id as string,
          staff_id: s.staff_id as string,
          staff_name: nameById.get(s.staff_id as string) ?? null,
          work_date: String(s.work_date).slice(0, 10),
          status: String(s.status ?? ""),
          actual_in: (s.actual_in as string | null) ?? null,
          actual_out: (s.actual_out as string | null) ?? null,
          late_minutes: Number(s.late_minutes ?? 0),
          missed_punch: Boolean(s.missed_punch),
          openCorrectionId: open?.id ?? null,
          openCorrectionStatus: open?.status ?? null,
        };
      }),
    };
  },
  { auth: { capability: "events.view" } },
);

/**
 * Corrections for event crew within the event date window (reuses attendance_corrections).
 * Approval still goes through the existing My Day / MP chain.
 */
export const listEventCorrections = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context): Promise<{ corrections: EventCorrectionRow[]; locationId: string | null }> => {
    const event = await loadEventOrThrow(context, data.eventId);
    const staffIds = await eventCrewStaffIds(context, data.eventId);
    if (!staffIds.length) return { corrections: [], locationId: event.location_id as string };

    const window = eventDateWindow(event as Record<string, unknown>);
    const { data: rows, error } = await context.supabase
      .from("attendance_corrections")
      .select("id, staff_id, work_date, status, reason, request_number, requested_at, kind")
      .in("staff_id", staffIds)
      .gte("work_date", window.dateFrom)
      .lte("work_date", window.dateTo)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const nameIds = [...new Set((rows ?? []).map((r) => r.staff_id as string).filter(Boolean))];
    const { data: staff } = nameIds.length
      ? await context.supabase.from("staff").select("id, full_name").in("id", nameIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const nameById = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));

    return {
      locationId: event.location_id as string,
      corrections: (rows ?? []).map((r) => ({
        id: r.id as string,
        staff_id: (r.staff_id as string | null) ?? null,
        staff_name: r.staff_id ? nameById.get(r.staff_id as string) ?? null : null,
        work_date: r.work_date ? String(r.work_date).slice(0, 10) : null,
        status: String(r.status),
        reason: String(r.reason ?? ""),
        request_number: (r.request_number as string | null) ?? null,
        requested_at: String(r.requested_at),
        kind: String(r.kind ?? ""),
      })),
    };
  },
  { auth: { capability: "events.view" } },
);
