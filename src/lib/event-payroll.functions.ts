"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { eventPeriodMonthAnchor } from "@/lib/events/event-payroll";
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
    return {
      period: {
        id: String(row.id),
        month: String(row.month),
        displayName: (row.display_name as string | null) ?? null,
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
        displayName: (existing.display_name as string | null) ?? null,
        dateFrom: String(existing.date_from).slice(0, 10),
        dateTo: String(existing.date_to).slice(0, 10),
        status: String(existing.status),
        periodKind: "event" as const,
        eventId: data.eventId,
        reused: true,
      };
    }

    const label =
      (event.name as string) ||
      (event.event_name as string) ||
      (event.event_number as string) ||
      "Event payroll";
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
      displayName: (row.display_name as string | null) ?? label,
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

/** Phase 5 light: note closed assignments when event payroll is locked/paid. */
export const noteEventAssignmentsClosed = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid(), periodId: z.string().uuid() }),
  async (data, context) => {
    requireCap(context, "payroll.generate");
    const event = await loadEventOrThrow(context, data.eventId);
    const stamp = `Closed via event payroll ${data.periodId.slice(0, 8)} on ${new Date().toISOString().slice(0, 10)}`;
    const { data: rows } = await context.supabase
      .from("event_staff_assignments")
      .select("id, notes")
      .eq("event_id", data.eventId);
    let updated = 0;
    for (const row of rows ?? []) {
      const notes = String(row.notes ?? "");
      if (notes.includes("Closed via event payroll")) continue;
      const next = notes ? `${notes}\n${stamp}` : stamp;
      await context.supabase
        .from("event_staff_assignments")
        .update({ notes: next, updated_by: context.userId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      updated += 1;
    }
    await context.supabase.from("event_audit_logs").insert({
      actor_id: context.userId,
      action: "assignments_close_note",
      entity_type: "event_staff_assignment",
      event_id: data.eventId,
      location_id: event.location_id as string,
      before: null,
      after: { updated, periodId: data.periodId } as Json,
      metadata: {} as Json,
    });
    return { updated };
  },
  { auth: { capability: "payroll.generate" } },
);
