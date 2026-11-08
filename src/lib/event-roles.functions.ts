"use server";

import { z } from "zod";

import {
  DEFAULT_EVENT_ROLE_CATALOG,
  normalizeEventRoleDrafts,
  slugifyEventRoleCode,
  type EventRoleDraft,
  type EventRoleRow,
} from "@/lib/events/event-roles";
import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction, type AuthContext } from "@/lib/server/create-action";

async function loadEventOrThrow(context: AuthContext, eventId: string) {
  const { data, error } = await context.supabase
    .from("events")
    .select("id, location_id, name, event_name")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Event not found");
  await assertLocationAccess(context, data.location_id as string);
  return data;
}

function mapRoleRow(row: Record<string, unknown>): EventRoleRow {
  return {
    id: String(row.id),
    event_id: String(row.event_id),
    code: String(row.code),
    name: String(row.name),
    kind: row.kind === "labour" ? "labour" : "shift",
    default_hours_per_day: Number(row.default_hours_per_day) || 10,
    default_day_rate_qar:
      row.default_day_rate_qar == null ? null : Number(row.default_day_rate_qar),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function seedEventRolesForEvent(
  context: AuthContext,
  eventId: string,
  drafts?: EventRoleDraft[] | null,
  userId?: string | null,
): Promise<EventRoleRow[]> {
  const roles = normalizeEventRoleDrafts(drafts);
  const rows = roles.map((r) => ({
    event_id: eventId,
    code: r.code,
    name: r.name,
    kind: r.kind,
    default_hours_per_day: r.default_hours_per_day,
    default_day_rate_qar: r.default_day_rate_qar,
    sort_order: r.sort_order,
    is_active: r.is_active !== false,
    created_by: userId ?? context.userId,
    updated_by: userId ?? context.userId,
  }));
  const { data, error } = await context.supabase
    .from("event_roles")
    .insert(rows)
    .select(
      "id, event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active, created_at, updated_at",
    );
  if (error) {
    // Table may not exist yet in older environments — surface clearly.
    if (/event_roles|schema cache|does not exist/i.test(error.message)) {
      throw new Error(
        "Event roles table is not available yet. Apply the latest Supabase migration (event_roles).",
      );
    }
    throw error;
  }
  return (data ?? []).map((r) => mapRoleRow(r as Record<string, unknown>));
}

/** Ensure an event has at least the default catalog (idempotent for legacy events). */
export async function ensureEventRoles(
  context: AuthContext,
  eventId: string,
): Promise<EventRoleRow[]> {
  const { data, error } = await context.supabase
    .from("event_roles")
    .select(
      "id, event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active, created_at, updated_at",
    )
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    if (/event_roles|schema cache|does not exist/i.test(error.message)) {
      return DEFAULT_EVENT_ROLE_CATALOG.map((r, i) => ({
        ...r,
        id: `local-${r.code}`,
        event_id: eventId,
        is_active: true,
        sort_order: r.sort_order ?? i,
      }));
    }
    throw error;
  }
  if ((data ?? []).length > 0) {
    return (data ?? []).map((r) => mapRoleRow(r as Record<string, unknown>));
  }
  return seedEventRolesForEvent(context, eventId, null);
}

export const getEventRoles = createAuthenticatedAction(
  z.object({ eventId: z.string().uuid() }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const roles = await ensureEventRoles(context, data.eventId);
    return { roles };
  },
  { auth: { capability: "events.view" } },
);

const RoleDraftSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120),
  kind: z.enum(["shift", "labour"]).default("shift"),
  default_hours_per_day: z.number().min(1).max(24).optional().nullable(),
  default_day_rate_qar: z.number().min(0).optional().nullable(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

export const replaceEventRoles = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    roles: z.array(RoleDraftSchema).min(1).max(40),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const normalized = normalizeEventRoleDrafts(data.roles);

    // Soft-deactivate removed codes; upsert active set (preserves FKs on assignments).
    const { data: existing, error: exErr } = await context.supabase
      .from("event_roles")
      .select("id, code")
      .eq("event_id", data.eventId);
    if (exErr) throw exErr;

    const existingByCode = new Map(
      (existing ?? []).map((r) => [String(r.code).toLowerCase(), r.id as string]),
    );
    const keepCodes = new Set(normalized.map((r) => r.code.toLowerCase()));
    const now = new Date().toISOString();

    for (const row of existing ?? []) {
      const code = String(row.code).toLowerCase();
      if (!keepCodes.has(code)) {
        const { error } = await context.supabase
          .from("event_roles")
          .update({ is_active: false, updated_by: context.userId, updated_at: now })
          .eq("id", row.id);
        if (error) throw error;
      }
    }

    for (const role of normalized) {
      const existingId = existingByCode.get(role.code.toLowerCase());
      const payload = {
        event_id: data.eventId,
        code: role.code,
        name: role.name,
        kind: role.kind,
        default_hours_per_day: role.default_hours_per_day,
        default_day_rate_qar: role.default_day_rate_qar,
        sort_order: role.sort_order,
        is_active: true,
        updated_by: context.userId,
        updated_at: now,
      };
      if (existingId) {
        const { error } = await context.supabase
          .from("event_roles")
          .update(payload)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await context.supabase.from("event_roles").insert({
          ...payload,
          created_by: context.userId,
        });
        if (error) throw error;
      }
    }

    const roles = await ensureEventRoles(context, data.eventId);
    return { roles: roles.filter((r) => r.is_active) };
  },
  { auth: { capability: "events.edit" } },
);

export const upsertEventRole = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    id: z.string().uuid().optional(),
    code: z.string().min(1).max(40).optional(),
    name: z.string().min(1).max(120),
    kind: z.enum(["shift", "labour"]).default("shift"),
    default_hours_per_day: z.number().min(1).max(24).optional().nullable(),
    default_day_rate_qar: z.number().min(0).optional().nullable(),
    sort_order: z.number().int().optional(),
    is_active: z.boolean().optional(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const now = new Date().toISOString();

    if (data.id) {
      const { data: existing, error: existingErr } = await context.supabase
        .from("event_roles")
        .select("id, code")
        .eq("id", data.id)
        .eq("event_id", data.eventId)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (!existing) throw new Error("Event role not found");

      // Preserve stable code on rename unless caller explicitly overrides it.
      const code = (data.code?.trim() || String(existing.code)).slice(0, 40);
      const payload = {
        code,
        name: data.name.trim(),
        kind: data.kind,
        default_hours_per_day: data.default_hours_per_day ?? 10,
        default_day_rate_qar: data.default_day_rate_qar ?? null,
        sort_order: data.sort_order ?? 0,
        is_active: data.is_active !== false,
        updated_by: context.userId,
        updated_at: now,
      };
      const { data: updated, error } = await context.supabase
        .from("event_roles")
        .update(payload)
        .eq("id", data.id)
        .eq("event_id", data.eventId)
        .select(
          "id, event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active, created_at, updated_at",
        )
        .single();
      if (error) throw error;
      return { role: mapRoleRow(updated as Record<string, unknown>) };
    }

    const code = (data.code?.trim() || slugifyEventRoleCode(data.name)).slice(0, 40);
    const payload = {
      event_id: data.eventId,
      code,
      name: data.name.trim(),
      kind: data.kind,
      default_hours_per_day: data.default_hours_per_day ?? 10,
      default_day_rate_qar: data.default_day_rate_qar ?? null,
      sort_order: data.sort_order ?? 0,
      is_active: data.is_active !== false,
      updated_by: context.userId,
      updated_at: now,
    };

    // Revive soft-deactivated role with the same code instead of unique-constraint failure.
    const { data: prior, error: priorErr } = await context.supabase
      .from("event_roles")
      .select("id")
      .eq("event_id", data.eventId)
      .eq("code", code)
      .maybeSingle();
    if (priorErr) throw priorErr;
    if (prior?.id) {
      const { data: revived, error } = await context.supabase
        .from("event_roles")
        .update(payload)
        .eq("id", prior.id)
        .eq("event_id", data.eventId)
        .select(
          "id, event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active, created_at, updated_at",
        )
        .single();
      if (error) throw error;
      return { role: mapRoleRow(revived as Record<string, unknown>) };
    }

    const { data: created, error } = await context.supabase
      .from("event_roles")
      .insert({ ...payload, created_by: context.userId })
      .select(
        "id, event_id, code, name, kind, default_hours_per_day, default_day_rate_qar, sort_order, is_active, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return { role: mapRoleRow(created as Record<string, unknown>) };
  },
  { auth: { capability: "events.edit" } },
);

export const deactivateEventRole = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);
    const { error } = await context.supabase
      .from("event_roles")
      .update({
        is_active: false,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "events.edit" } },
);

/**
 * Hard-delete when unused; soft-deactivate when referenced by assignments/slots
 * (FK is ON DELETE SET NULL, but keeping history is safer for payroll/schedule).
 */
export const deleteEventRole = createAuthenticatedAction(
  z.object({
    eventId: z.string().uuid(),
    id: z.string().uuid(),
  }),
  async (data, context) => {
    await loadEventOrThrow(context, data.eventId);

    const { data: existing, error: existingErr } = await context.supabase
      .from("event_roles")
      .select("id, name, is_active")
      .eq("id", data.id)
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (!existing) throw new Error("Event role not found");

    const [{ count: assignmentCount, error: aErr }, { count: slotCount, error: sErr }] =
      await Promise.all([
        context.supabase
          .from("event_staff_assignments")
          .select("id", { count: "exact", head: true })
          .eq("event_id", data.eventId)
          .eq("event_role_id", data.id),
        context.supabase
          .from("event_schedule_slots")
          .select("id", { count: "exact", head: true })
          .eq("event_id", data.eventId)
          .eq("event_role_id", data.id),
      ]);
    if (aErr && !/event_role_id|schema cache|does not exist/i.test(aErr.message)) throw aErr;
    if (sErr && !/event_role_id|schema cache|does not exist/i.test(sErr.message)) throw sErr;

    const assignments = assignmentCount ?? 0;
    const slots = slotCount ?? 0;
    const inUse = assignments > 0 || slots > 0;

    if (inUse) {
      const { error } = await context.supabase
        .from("event_roles")
        .update({
          is_active: false,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("event_id", data.eventId);
      if (error) throw error;
      return {
        mode: "deactivated" as const,
        inUse: true,
        assignmentCount: assignments,
        slotCount: slots,
        name: String(existing.name),
      };
    }

    const { error } = await context.supabase
      .from("event_roles")
      .delete()
      .eq("id", data.id)
      .eq("event_id", data.eventId);
    if (error) throw error;
    return {
      mode: "deleted" as const,
      inUse: false,
      assignmentCount: 0,
      slotCount: 0,
      name: String(existing.name),
    };
  },
  { auth: { capability: "events.edit" } },
);
