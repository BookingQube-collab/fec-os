"use server";

import { z } from "zod";

import {
  getMaintenanceTeamEmails,
  notifyMaintenanceTeamInApp,
  resolveUserEmails,
  sendWorkOrderAcknowledgment,
  sendWorkOrderCompletedEmail,
} from "@/lib/maintenance/email";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const WoStatusEnum = z.enum(["planned", "in_progress", "on_hold", "completed", "cancelled"]);
const AssetCriticalityEnum = z.enum(["low", "medium", "high", "critical"]);
const WoKindEnum = z.enum(["corrective", "preventive", "inspection", "installation"]);
const PriorityEnum = z.enum(["normal", "medium", "urgent"]);

async function generateJobOrderNumber(
  supabase: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>["supabase"],
): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Qatar" }).replace(/-/g, "");
  const { count } = await supabase
    .from("work_orders")
    .select("id", { count: "exact", head: true })
    .like("job_order_number", `WO-${today}-%`)
    .is("deleted_at", null);
  const seq = (count ?? 0) + 1;
  return `WO-${today}-${String(seq).padStart(4, "0")}`;
}

const WoFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    status: WoStatusEnum.nullable().optional(),
    mine: z.boolean().optional(),
  })
  .default({});

export const listWorkOrders = createAuthenticatedAction(
  WoFilter,
  async (data, context) => {
    let q = context.supabase
      .from("work_orders")
      .select(
        "id, location_id, title, kind, status, planned_end, assigned_to, created_at, priority, job_order_number, sla_due_at, sla_breached",
      )
      .is("deleted_at", null)
      .order("planned_end", { ascending: true, nullsFirst: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    if (data.mine) q = q.eq("assigned_to", context.userId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "maintenance.view" } },
);

export const updateWorkOrderStatus = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: WoStatusEnum }),
  async (data, context) => {
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      ...(data.status === "in_progress" ? { actual_start: now } : {}),
      ...(data.status === "completed" ? { actual_end: now } : {}),
    };
    const { data: before } = await context.supabase
      .from("work_orders")
      .select("id, title, job_order_number, reporter_name, request_id")
      .eq("id", data.id)
      .single();

    const { error } = await context.supabase.from("work_orders").update(patch).eq("id", data.id);
    if (error) throw error;

    if (data.status === "completed" && before) {
      let recipientId: string | null = null;
      if (before.request_id) {
        const { data: req } = await context.supabase
          .from("maintenance_requests")
          .select("created_by")
          .eq("id", before.request_id)
          .maybeSingle();
        recipientId = req?.created_by ?? null;
      }
      if (recipientId) {
        const emailMap = await resolveUserEmails(context.supabase, [recipientId]);
        const toEmail = emailMap.get(recipientId) ?? null;
        await sendWorkOrderCompletedEmail(context.supabase, {
          toEmail,
          workOrderId: before.id,
          jobOrderNumber: before.job_order_number,
          title: before.title,
          completedAt: now,
        });
      }
    }

    return { ok: true };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

export const listAssets = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    let q = context.supabase
      .from("assets")
      .select(
        "id, location_id, tag, name, category, criticality, warranty_expires_on, last_heartbeat_at, heartbeat_interval_minutes",
      )
      .is("deleted_at", null)
      .order("tag");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "maintenance.view" } },
);

export const createWorkOrder = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    title: z.string().min(3).max(200),
    kind: z.string().min(2).max(40).default("corrective"),
    description: z.string().max(4000).optional(),
    asset_id: z.string().uuid().nullable().optional(),
    planned_end: z.string().datetime().nullable().optional(),
    priority: PriorityEnum.default("normal"),
    reporter_name: z.string().max(200).nullable().optional(),
  }),
  async (data, context) => {
    const jobOrderNumber = await generateJobOrderNumber(context.supabase);
    const { data: row, error } = await context.supabase
      .from("work_orders")
      .insert({
        location_id: data.location_id,
        title: data.title,
        kind: data.kind,
        description: data.description ?? null,
        asset_id: data.asset_id ?? null,
        planned_end: data.planned_end ?? null,
        status: "planned",
        assigned_to: context.userId,
        priority: data.priority,
        job_order_number: jobOrderNumber,
        reporter_name: data.reporter_name ?? null,
      })
      .select("id, sla_due_at")
      .single();
    if (error) throw error;

    const [{ data: loc }, emailMap] = await Promise.all([
      context.supabase.from("locations").select("code").eq("id", data.location_id).single(),
      resolveUserEmails(context.supabase, [context.userId]),
    ]);

    await notifyMaintenanceTeamInApp(context.supabase, {
      locationId: data.location_id,
      title: `Work order ${jobOrderNumber}`,
      body: data.title,
      actionUrl: "/maintenance",
      sourceType: "work_orders",
      sourceId: row.id,
    });

    const creatorEmail = emailMap.get(context.userId) ?? null;
    await sendWorkOrderAcknowledgment(context.supabase, {
      toEmail: creatorEmail,
      workOrderId: row.id,
      jobOrderNumber,
      title: data.title,
      priority: data.priority,
      locationCode: loc?.code ?? "—",
      slaDueAt: row.sla_due_at,
    });

    const teamEmails = await getMaintenanceTeamEmails(context.supabase, data.location_id);
    if (teamEmails.length && creatorEmail) {
      const others = teamEmails.filter((e) => e !== creatorEmail);
      for (const to of others) {
        await sendWorkOrderAcknowledgment(context.supabase, {
          toEmail: to,
          workOrderId: row.id,
          jobOrderNumber,
          title: data.title,
          priority: data.priority,
          locationCode: loc?.code ?? "—",
          slaDueAt: row.sla_due_at,
        });
      }
    }

    await context.supabase.rpc("log_audit", {
      _action: "work_order.created",
      _table_name: "work_orders",
      _row_id: row.id,
      _location_id: data.location_id,
      _after: { title: data.title, kind: data.kind, job_order_number: jobOrderNumber },
      _metadata: {},
    });
    return { id: row.id, job_order_number: jobOrderNumber };
  },
  { auth: { capability: "maintenance.schedule_pm" } },
);

export const updateWorkOrder = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    title: z.string().min(3).max(200).optional(),
    kind: WoKindEnum.optional(),
    description: z.string().max(4000).nullable().optional(),
    asset_id: z.string().uuid().nullable().optional(),
    planned_end: z.string().datetime().nullable().optional(),
    status: WoStatusEnum.optional(),
  }),
  async (data, context) => {
    const now = new Date().toISOString();
    const patch = {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.asset_id !== undefined ? { asset_id: data.asset_id } : {}),
      ...(data.planned_end !== undefined ? { planned_end: data.planned_end } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.status === "in_progress" ? { actual_start: now } : {}),
      ...(data.status === "completed" ? { actual_end: now } : {}),
    };
    const { error } = await context.supabase.from("work_orders").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.schedule_pm" } },
);

export const deleteWorkOrder = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("work_orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const createAsset = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    tag: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    category: z.string().max(100).optional(),
    criticality: AssetCriticalityEnum.default("medium"),
    manufacturer: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    warranty_expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(2000).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("assets")
      .insert({
        location_id: data.location_id,
        tag: data.tag,
        name: data.name,
        category: data.category ?? null,
        criticality: data.criticality,
        manufacturer: data.manufacturer ?? null,
        model: data.model ?? null,
        warranty_expires_on: data.warranty_expires_on ?? null,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "maintenance.schedule_pm" } },
);

export const updateAsset = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    tag: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    category: z.string().max(100).nullable().optional(),
    criticality: AssetCriticalityEnum.optional(),
    manufacturer: z.string().max(200).nullable().optional(),
    model: z.string().max(200).nullable().optional(),
    warranty_expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    const patch = {
      ...(data.tag !== undefined ? { tag: data.tag } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.criticality !== undefined ? { criticality: data.criticality } : {}),
      ...(data.manufacturer !== undefined ? { manufacturer: data.manufacturer } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.warranty_expires_on !== undefined ? { warranty_expires_on: data.warranty_expires_on } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };
    const { error } = await context.supabase.from("assets").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.schedule_pm" } },
);

export const deleteAsset = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase
      .from("assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const deletePmSchedule = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("pm_schedules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.manage" } },
);

export const listPmSchedules = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    let q = context.supabase
      .from("pm_schedules")
      .select("id, location_id, asset_id, title, kind, interval_days, next_due_at, last_generated_at, active")
      .order("next_due_at");
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "maintenance.view" } },
);

export const upsertPmSchedule = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    location_id: z.string().uuid(),
    asset_id: z.string().uuid().nullable().optional(),
    title: z.string().min(3).max(200),
    kind: z.string().max(40).default("preventive"),
    interval_days: z.number().int().min(1).max(3650),
    next_due_at: z.string().datetime(),
    active: z.boolean().default(true),
  }),
  async (data, context) => {
    const row = {
      location_id: data.location_id,
      asset_id: data.asset_id ?? null,
      title: data.title,
      kind: data.kind,
      interval_days: data.interval_days,
      next_due_at: data.next_due_at,
      active: data.active,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("pm_schedules").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("pm_schedules")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "maintenance.schedule_pm" } },
);

export const runPmSweep = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase.rpc("generate_due_pm_work_orders");
  if (error) throw error;
  return { generated: typeof data === "number" ? data : 0 };
}, { auth: { capability: "maintenance.schedule_pm" } });

export const listDowntime = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid().nullable().optional(),
    openOnly: z.boolean().optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("downtime_events")
      .select("id, location_id, asset_id, reason, source, started_at, ended_at, duration_minutes")
      .order("started_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.openOnly) q = q.is("ended_at", null);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "maintenance.view" } },
);

export const startDowntime = createAuthenticatedAction(
  z.object({
    location_id: z.string().uuid(),
    asset_id: z.string().uuid().nullable().optional(),
    reason: z.string().min(3).max(500),
    ticket_id: z.string().uuid().optional(),
  }),
  async (data, context) => {
    if (data.asset_id) {
      const { data: id, error } = await context.supabase.rpc("start_downtime", {
        _location_id: data.location_id,
        _asset_id: data.asset_id,
        _reason: data.reason,
        _ticket_id: data.ticket_id ?? undefined,
      });
      if (error) throw error;
      return { id: id as string };
    }
    const { data: row, error } = await context.supabase
      .from("downtime_events")
      .insert({
        location_id: data.location_id,
        reason: data.reason,
        source: "manual",
        opened_by: context.userId,
        ticket_id: data.ticket_id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

export const endDowntime = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), notes: z.string().max(2000).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("end_downtime", {
      _id: data.id,
      _notes: data.notes ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);

export const recordHeartbeat = createAuthenticatedAction(
  z.object({ asset_id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("record_asset_heartbeat", {
      _asset_id: data.asset_id,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "maintenance.execute_wo" } },
);
