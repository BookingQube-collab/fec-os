"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  eventPayrollBatchLabel,
  eventPeriodMonthAnchor,
  normalizeEventPayDateSpan,
  resolveEventPayPeriodWindow,
  type EventPayDateSpan,
} from "@/lib/events/event-payroll";
import {
  closeAssignmentStampNote,
  eventHireParkStatus,
  isEventAssignmentClosed,
  isEventHireParkedStatus,
  reopenAssignmentStampNote,
} from "@/lib/events/staff-assignments";
import { assertCanDeletePayrollPeriod } from "@/lib/hr-payroll";
import { CONTRACT_FINISHED_STAFF_STATUS } from "@/lib/staff-status";
import { assertLocationAccess, ForbiddenError } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";
import { canUserDo } from "@/lib/rbac";

function requireCap(context: AuthContext, cap: Parameters<typeof canUserDo>[1]) {
  if (!canUserDo(context.roles ?? [], cap)) {
    throw new ForbiddenError(`Missing capability: ${cap}`);
  }
}

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select("id, location_id, name, event_name, event_number, event_start, event_end, venue_access, setup_start, dismantle_end")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

function eventDatesForPayWindow(event: Record<string, unknown>) {
  return {
    event_start: (event.event_start as string | null | undefined) ?? null,
    event_end: (event.event_end as string | null | undefined) ?? null,
    venue_access: (event.venue_access as string | null | undefined) ?? null,
    setup_start: (event.setup_start as string | null | undefined) ?? null,
    dismantle_end: (event.dismantle_end as string | null | undefined) ?? null,
  };
}

/** Min–max pay-on-event assignment dates and event-tagged attendance for period fallback. */
async function loadEventWorkforceDateSpans(
  eventId: string,
): Promise<{ assignmentSpan: EventPayDateSpan | null; attendanceSpan: EventPayDateSpan | null }> {
  const { data: assigns, error: asgErr } = await supabaseAdmin
    .from("event_staff_assignments")
    .select("date_from, date_to")
    .eq("event_id", eventId)
    .eq("pay_on_event_run", true);
  if (asgErr && !/event_staff_assignments|schema cache|does not exist/i.test(asgErr.message)) {
    throw asgErr;
  }

  let assignmentSpan: EventPayDateSpan | null = null;
  for (const row of assigns ?? []) {
    const span = normalizeEventPayDateSpan(
      row.date_from as string | null,
      row.date_to as string | null,
    );
    if (!span) continue;
    if (!assignmentSpan) {
      assignmentSpan = span;
      continue;
    }
    if (span.dateFrom < assignmentSpan.dateFrom) assignmentSpan.dateFrom = span.dateFrom;
    if (span.dateTo > assignmentSpan.dateTo) assignmentSpan.dateTo = span.dateTo;
  }

  let attendanceSpan: EventPayDateSpan | null = null;
  const { data: attMin, error: attMinErr } = await supabaseAdmin
    .from("attendance_daily_summary")
    .select("work_date")
    .eq("event_id", eventId)
    .order("work_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (attMinErr && !/event_id|schema cache|does not exist/i.test(attMinErr.message)) {
    throw attMinErr;
  }
  if (attMin?.work_date) {
    const { data: attMax, error: attMaxErr } = await supabaseAdmin
      .from("attendance_daily_summary")
      .select("work_date")
      .eq("event_id", eventId)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (attMaxErr && !/event_id|schema cache|does not exist/i.test(attMaxErr.message)) {
      throw attMaxErr;
    }
    attendanceSpan = normalizeEventPayDateSpan(
      attMin.work_date as string,
      (attMax?.work_date as string | null) ?? (attMin.work_date as string),
    );
  }

  return { assignmentSpan, attendanceSpan };
}

async function resolveEventPeriodWindowForEvent(
  event: Record<string, unknown>,
  eventId: string,
): Promise<ReturnType<typeof resolveEventPayPeriodWindow>> {
  const spans = await loadEventWorkforceDateSpans(eventId);
  return resolveEventPayPeriodWindow({
    event: eventDatesForPayWindow(event),
    assignmentSpan: spans.assignmentSpan,
    attendanceSpan: spans.attendanceSpan,
  });
}

async function runCloseEventCrew(
  context: AuthContext,
  data: { eventId: string; periodId?: string | null; parkEventHires?: boolean },
) {
  const event = await loadEventOrThrow(context, data.eventId);
  const closedOn = new Date().toISOString().slice(0, 10);
  const stamp = closeAssignmentStampNote(closedOn, data.periodId ?? null);
  const nowIso = new Date().toISOString();
  const parkHires = data.parkEventHires !== false;

  const { data: rows, error } = await context.supabase
    .from("event_staff_assignments")
    .select("id, staff_id, assignment_type, date_to, notes, status")
    .eq("event_id", data.eventId);
  if (error) throw error;

  let closedAssignments = 0;
  let parkedHires = 0;
  const hireStaffIds: string[] = [];

  for (const row of rows ?? []) {
    if (isEventAssignmentClosed(row)) continue;
    const notes = String(row.notes ?? "");
    const nextNotes = notes.includes("Closed via event")
      ? notes
      : notes
        ? `${notes}\n${stamp}`
        : stamp;
    const { error: updErr } = await context.supabase
      .from("event_staff_assignments")
      .update({
        status: "closed",
        closed_at: nowIso,
        closed_by: context.userId,
        notes: nextNotes,
        updated_by: context.userId,
        updated_at: nowIso,
      })
      .eq("id", row.id);
    if (updErr) {
      if (/status|closed_at|schema cache/i.test(updErr.message)) {
        await context.supabase
          .from("event_staff_assignments")
          .update({ notes: nextNotes, updated_by: context.userId, updated_at: nowIso })
          .eq("id", row.id);
      } else {
        throw updErr;
      }
    }
    closedAssignments += 1;
    if (String(row.assignment_type) === "event_hire") {
      hireStaffIds.push(row.staff_id as string);
    }
  }

  if (parkHires && hireStaffIds.length) {
    for (const staffId of hireStaffIds) {
      const assignment = (rows ?? []).find((r) => r.staff_id === staffId);
      const endDate = String(assignment?.date_to ?? closedOn).slice(0, 10);
      const { data: staffRow } = await supabaseAdmin
        .from("staff")
        .select("id, status, employment_type, job_title")
        .eq("id", staffId)
        .maybeSingle();
      if (!staffRow) continue;
      const emp = String(staffRow.employment_type ?? "").toLowerCase();
      const status = String(staffRow.status ?? "").toLowerCase();
      const title = String(staffRow.job_title ?? "").toLowerCase();
      if (emp !== "temporary" && !title.includes("event")) continue;
      if (
        status === CONTRACT_FINISHED_STAFF_STATUS ||
        status === "terminated" ||
        status === "resigned"
      ) {
        continue;
      }
      await supabaseAdmin
        .from("staff")
        .update({ status: eventHireParkStatus(), updated_at: nowIso })
        .eq("id", staffId);
      await supabaseAdmin.from("staff_profile_ext").upsert(
        {
          staff_id: staffId,
          contract_end: endDate,
          updated_by: context.userId,
        },
        { onConflict: "staff_id" },
      );
      parkedHires += 1;
    }
  }

  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: "crew_close",
    entity_type: "event_staff_assignment",
    event_id: data.eventId,
    location_id: event.location_id as string,
    before: null,
    after: {
      closedAssignments,
      parkedHires,
      periodId: data.periodId ?? null,
    } as Json,
    metadata: {} as Json,
  });

  return { closedAssignments, parkedHires };
}

export const getEventPayrollPeriod = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context) => {
    requireCap(context, "payroll.view");
    await loadEventOrThrow(context, data.eventId);
    const { data: row, error } = await context.supabase
      .from("hr_payroll_periods")
      .select("*")
      .eq("period_kind", "event")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (error) {
      if (/period_kind|event_id|schema cache/i.test(error.message)) return { period: null };
      throw error;
    }
    if (!row) return { period: null };
    const displayName = eventPayrollBatchLabel(
      (row.display_name as string | null) ?? null,
      String(row.month),
    );
    return {
      period: {
        id: String(row.id),
        month: String(row.month),
        displayName,
        dateFrom: String(row.date_from).slice(0, 10),
        dateTo: String(row.date_to).slice(0, 10),
        status: String(row.status),
        periodKind: "event" as const,
        eventId: data.eventId,
        source: String(row.source ?? "event_generated"),
        notes: (row.notes as string | null) ?? null,
      },
    };
  },
  { auth: { capability: "payroll.view" } },
);

/**
 * Create (or return existing) event payroll period for the event date window.
 * Requires payroll.generate — not granted to Sr Site HR by default.
 */
export const createEventPayrollPeriod = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    notes: z.string().trim().max(2000).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const event = await loadEventOrThrow(context, data.eventId);
    const window = await resolveEventPeriodWindowForEvent(
      event as Record<string, unknown>,
      data.eventId,
    );

    const { data: existing } = await context.supabase
      .from("hr_payroll_periods")
      .select("*")
      .eq("period_kind", "event")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (existing) {
      const prevFrom = String(existing.date_from).slice(0, 10);
      const prevTo = String(existing.date_to).slice(0, 10);
      const status = String(existing.status);
      let dateFrom = prevFrom;
      let dateTo = prevTo;
      let month = String(existing.month);
      let windowSynced = false;

      const needsWindowSync = prevFrom !== window.dateFrom || prevTo !== window.dateTo;
      if (needsWindowSync) {
        try {
          assertCanDeletePayrollPeriod(status);
          const nextMonth = eventPeriodMonthAnchor(window.dateFrom);
          const { error: syncErr } = await context.supabase
            .from("hr_payroll_periods")
            .update({
              date_from: window.dateFrom,
              date_to: window.dateTo,
              month: nextMonth,
              updated_at: new Date().toISOString(),
              updated_by: context.userId,
            })
            .eq("id", existing.id);
          if (syncErr) throw syncErr;
          dateFrom = window.dateFrom;
          dateTo = window.dateTo;
          month = nextMonth;
          windowSynced = true;
          await context.supabase.from("event_audit_logs").insert({
            actor_id: context.userId,
            action: "payroll_period_window_sync",
            entity_type: "hr_payroll_period",
            entity_id: existing.id as string,
            event_id: data.eventId,
            location_id: event.location_id as string,
            before: { date_from: prevFrom, date_to: prevTo, source: null } as Json,
            after: {
              date_from: dateFrom,
              date_to: dateTo,
              source: window.source,
              open_from: window.open.dateFrom,
              open_to: window.open.dateTo,
            } as Json,
            metadata: {} as Json,
          });
        } catch {
          // Locked / advanced periods keep their stored window.
        }
      }

      return {
        id: String(existing.id),
        month,
        displayName: eventPayrollBatchLabel(
          (existing.display_name as string | null) ?? null,
          month,
        ),
        dateFrom,
        dateTo,
        status,
        periodKind: "event" as const,
        eventId: data.eventId,
        reused: true,
        windowSynced,
        windowSource: window.source,
      };
    }

    const rawLabel =
      (event.name as string) ||
      (event.event_name as string) ||
      (event.event_number as string) ||
      "Event payroll";
    const label = eventPayrollBatchLabel(rawLabel);
    const month = eventPeriodMonthAnchor(window.dateFrom);

    const { data: row, error } = await context.supabase
      .from("hr_payroll_periods")
      .insert({
        month,
        date_from: window.dateFrom,
        date_to: window.dateTo,
        status: "draft",
        currency: "QAR",
        notes: data.notes ?? `Event pay run for ${label}`,
        created_by: context.userId,
        period_kind: "event",
        event_id: data.eventId,
        display_name: label,
        source: "event_generated",
      })
      .select("*")
      .single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error("Event payroll period already exists for this event.");
      }
      throw error;
    }

    await context.supabase.from("event_audit_logs").insert({
      actor_id: context.userId,
      action: "payroll_period_create",
      entity_type: "hr_payroll_period",
      entity_id: row.id as string,
      event_id: data.eventId,
      location_id: event.location_id as string,
      before: null,
      after: {
        period_id: row.id,
        date_from: window.dateFrom,
        date_to: window.dateTo,
        source: window.source,
        open_from: window.open.dateFrom,
        open_to: window.open.dateTo,
      } as Json,
      metadata: {} as Json,
    });

    return {
      id: String(row.id),
      month: String(row.month),
      displayName: label,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      status: String(row.status),
      periodKind: "event" as const,
      eventId: data.eventId,
      reused: false,
      windowSynced: false,
      windowSource: window.source,
    };
  },
  { auth: { capability: "payroll.generate" } },
);

/**
 * End-of-event close: stamp assignments closed, optionally park event-only hires
 * as contract_finished with contract_end = assignment date_to. Loaned/joker home
 * employment is left unchanged. Blocks new schedule edits while closed.
 */
export const closeEventCrew = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    periodId: z.string().uuid().optional().nullable(),
    parkEventHires: z.boolean().optional().default(true),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    return runCloseEventCrew(context, data);
  },
  { auth: { capability: "payroll.generate" } },
);

/** Alias used by Event pay UI — same as closeEventCrew. */
export const noteEventAssignmentsClosed = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid(), periodId: z.string().uuid() }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const res = await runCloseEventCrew(context, {
      eventId: data.eventId,
      periodId: data.periodId,
      parkEventHires: true,
    });
    return { updated: res.closedAssignments, parkedHires: res.parkedHires };
  },
  { auth: { capability: "payroll.generate" } },
);

async function runReopenEventCrew(
  context: AuthContext,
  data: { eventId: string; unparkEventHires?: boolean; ids?: string[] | null },
) {
  const event = await loadEventOrThrow(context, data.eventId);
  const nowIso = new Date().toISOString();
  const stamp = reopenAssignmentStampNote(nowIso.slice(0, 10));
  const unpark = data.unparkEventHires !== false;

  let q = context.supabase
    .from("event_staff_assignments")
    .select("id, staff_id, assignment_type, notes, status")
    .eq("event_id", data.eventId)
    .eq("status", "closed");
  if (data.ids?.length) q = q.in("id", data.ids);
  const { data: rows, error } = await q;
  if (error) {
    if (/status|closed_at|schema cache/i.test(error.message)) {
      throw new Error("Crew close/reopen columns are not applied yet — run migrations.");
    }
    throw error;
  }

  let reopenedAssignments = 0;
  let unparkedHires = 0;
  const hireStaffIds: string[] = [];

  for (const row of rows ?? []) {
    const notes = String(row.notes ?? "");
    const nextNotes = notes.includes("Reopened via event")
      ? notes
      : notes
        ? `${notes}\n${stamp}`
        : stamp;
    const { error: updErr } = await context.supabase
      .from("event_staff_assignments")
      .update({
        status: "active",
        closed_at: null,
        closed_by: null,
        notes: nextNotes,
        updated_by: context.userId,
        updated_at: nowIso,
      })
      .eq("id", row.id);
    if (updErr) throw updErr;
    reopenedAssignments += 1;
    if (String(row.assignment_type) === "event_hire") {
      hireStaffIds.push(row.staff_id as string);
    }
  }

  if (unpark && hireStaffIds.length) {
    for (const staffId of hireStaffIds) {
      const { data: staffRow } = await supabaseAdmin
        .from("staff")
        .select("id, status, employment_type, job_title")
        .eq("id", staffId)
        .maybeSingle();
      if (!staffRow) continue;
      const emp = String(staffRow.employment_type ?? "").toLowerCase();
      const title = String(staffRow.job_title ?? "").toLowerCase();
      if (emp !== "temporary" && !title.includes("event")) continue;
      if (!isEventHireParkedStatus(staffRow.status as string)) continue;
      await supabaseAdmin
        .from("staff")
        .update({ status: "active", updated_at: nowIso })
        .eq("id", staffId);
      unparkedHires += 1;
    }
  }

  await context.supabase.from("event_audit_logs").insert({
    actor_id: context.userId,
    action: "crew_reopen",
    entity_type: "event_staff_assignment",
    event_id: data.eventId,
    location_id: event.location_id as string,
    before: null,
    after: {
      reopenedAssignments,
      unparkedHires,
      ids: data.ids ?? null,
    } as Json,
    metadata: {} as Json,
  });

  return { reopenedAssignments, unparkedHires };
}

/**
 * Reopen closed assignments so schedule edits unlock again.
 * Optionally restores parked event_hire staff still on contract_finished.
 */
export const reopenEventCrew = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    unparkEventHires: z.boolean().optional().default(true),
    ids: z.array(z.string().uuid()).max(200).optional().nullable(),
  }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    return runReopenEventCrew(context, data);
  },
  { auth: { capability: "payroll.generate" } },
);
