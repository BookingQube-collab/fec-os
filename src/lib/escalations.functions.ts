"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const RoleEnum = z.enum([
  "ceo",
  "coo",
  "cfo",
  "regional_ops",
  "branch_gm",
  "duty_manager",
  "tech_supervisor",
  "technician",
  "cashier_host",
  "auditor",
]);

export const listEscalationRules = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("escalation_rules")
    .select(
      "id, location_id, name, scope_priority, scope_category, minutes_after_sla, target_role, bump_priority, level, enabled, created_at",
    )
    .order("level")
    .order("minutes_after_sla");
  if (error) throw error;
  return data ?? [];
}, { auth: { capability: "issues.view" } });

export const listActiveEscalations = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("escalations")
    .select(
      "id, location_id, source, title, detail, severity, status, due_at, level, ticket_id, created_at",
    )
    .eq("status", "open")
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}, { auth: { capability: "issues.view" } });

export const runEscalationSweep = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase.rpc("run_escalation_sweep");
  if (error) throw error;
  const rows = data ?? [];
  return { created: rows.length, rows };
}, { auth: { capability: "issues.assign" } });

export const upsertEscalationRule = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(2).max(200),
    location_id: z.string().uuid().nullable().optional(),
    scope_priority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
    scope_category: z.string().max(100).nullable().optional(),
    minutes_after_sla: z.number().int().min(0).max(10_080),
    target_role: RoleEnum,
    bump_priority: z.boolean().default(true),
    level: z.number().int().min(1).max(10).default(1),
    enabled: z.boolean().default(true),
  }),
  async (data, context) => {
    const row = {
      name: data.name,
      location_id: data.location_id ?? null,
      scope_priority: data.scope_priority ?? null,
      scope_category: data.scope_category ?? null,
      minutes_after_sla: data.minutes_after_sla,
      target_role: data.target_role,
      bump_priority: data.bump_priority,
      level: data.level,
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await context.supabase.from("escalation_rules").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("escalation_rules")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "issues.assign" } },
);

export const deleteEscalationRule = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("escalation_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.assign" } },
);

export const acknowledgeEscalation = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("escalations")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "issues.assign" } },
);
