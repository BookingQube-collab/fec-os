"use server";

import { z } from "zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { eventPayrollBatchLabel, eventPeriodMonthAnchor } from "@/lib/events/event-payroll";
import {
  closeAssignmentStampNote,
  eventHireParkStatus,
  isEventAssignmentClosed,
} from "@/lib/events/staff-assignments";
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

function eventPayWindow(event: Record<string, unknown>): { dateFrom: string; dateTo: string } {
  const dateFrom =
    String(event.venue_access ?? event.setup_start ?? event.event_start ?? "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const dateTo =
    String(event.dismantle_end ?? event.event_end ?? dateFrom).slice(0, 10) || dateFrom;
  return { dateFrom, dateTo: dateTo < dateFrom ? dateFrom : dateTo };
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
    const window = eventPayWindow(event as Record<string, unknown>);

    const { data: existing } = await context.supabase
      .from("hr_payroll_periods")
      .select("*")
      .eq("period_kind", "event")
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (existing) {
      return {
        id: String(existing.id),
        month: String(existing.month),
        displayName: eventPayrollBatchLabel(
          (existing.display_name as string | null) ?? null,
          String(existing.month),
        ),
        dateFrom: String(existing.date_from).slice(0, 10),
        dateTo: String(existing.date_to).slice(0, 10),
        status: String(existing.status),
        periodKind: "event" as const,
        eventId: data.eventId,
        reused: true,
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
      after: { period_id: row.id, date_from: window.dateFrom, date_to: window.dateTo } as Json,
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
