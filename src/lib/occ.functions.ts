"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

export type RagStatus = "green" | "amber" | "red";

export interface LocationRollup {
  location_id: string;
  code: string;
  name: string;
  city: string;
  status: string;
  surge_mode: boolean;
  open_tickets: number;
  urgent_tickets: number;
  high_tickets: number;
  open_incidents: number;
  incidents_24h: number;
  overdue_work_orders: number;
  open_complaints: number;
  rag: RagStatus;
}

function ragFor(
  r: Omit<LocationRollup, "rag" | "location_id" | "code" | "name" | "city" | "status" | "surge_mode">,
): RagStatus {
  if (r.urgent_tickets > 0 || r.incidents_24h > 0 || r.overdue_work_orders > 2) return "red";
  if (r.high_tickets > 0 || r.open_incidents > 0 || r.overdue_work_orders > 0 || r.open_complaints > 3)
    return "amber";
  return "green";
}

async function buildLocationRollups(context: {
  supabase: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>["supabase"];
}): Promise<LocationRollup[]> {
  const since24h = new Date(Date.now() - 86400_000).toISOString();
  const now = new Date().toISOString();

  const { data: locations, error } = await context.supabase
    .from("locations")
    .select("id, code, name, city, status, surge_mode")
    .eq("status", "active")
    .order("code");
  if (error) throw error;

  const ids = (locations ?? []).map((l) => l.id);
  if (ids.length === 0) return [];

  const [tickets, incidents, incidents24, workOrders, complaints] = await Promise.all([
    context.supabase
      .from("tickets")
      .select("location_id, priority, status")
      .in("location_id", ids)
      .is("deleted_at", null)
      .not("status", "in", "(resolved,closed,cancelled)"),
    context.supabase
      .from("incidents")
      .select("location_id, status")
      .in("location_id", ids)
      .neq("status", "closed"),
    context.supabase
      .from("incidents")
      .select("location_id")
      .in("location_id", ids)
      .gte("occurred_at", since24h),
    context.supabase
      .from("work_orders")
      .select("location_id, planned_end, status")
      .in("location_id", ids)
      .not("status", "in", "(completed,cancelled)"),
    context.supabase
      .from("complaints")
      .select("location_id, status")
      .in("location_id", ids)
      .not("status", "in", "(resolved,dismissed)"),
  ]);

  const openTickets = tickets.data ?? [];
  const openIncidents = incidents.data ?? [];
  const inc24 = incidents24.data ?? [];
  const openWos = workOrders.data ?? [];
  const openComplaints = complaints.data ?? [];

  return (locations ?? []).map((loc) => {
    const locTickets = openTickets.filter((t) => t.location_id === loc.id);
    const overdue = openWos.filter(
      (w) => w.location_id === loc.id && w.planned_end && w.planned_end < now,
    ).length;
    const partial = {
      open_tickets: locTickets.length,
      urgent_tickets: locTickets.filter((t) => t.priority === "urgent").length,
      high_tickets: locTickets.filter((t) => t.priority === "high").length,
      open_incidents: openIncidents.filter((i) => i.location_id === loc.id).length,
      incidents_24h: inc24.filter((i) => i.location_id === loc.id).length,
      overdue_work_orders: overdue,
      open_complaints: openComplaints.filter((c) => c.location_id === loc.id).length,
    };
    return {
      location_id: loc.id,
      code: loc.code,
      name: loc.name,
      city: loc.city,
      status: loc.status,
      surge_mode: loc.surge_mode,
      ...partial,
      rag: ragFor(partial),
    };
  });
}

export const getEstateRollup = createAuthenticatedActionNoInput(async (context) => {
  const rollups = await buildLocationRollups(context);
  return rollups.sort((a, b) => {
    const order = { red: 0, amber: 1, green: 2 };
    return order[a.rag] - order[b.rag] || b.urgent_tickets - a.urgent_tickets;
  });
}, { auth: { capability: "occ.view_estate" } });

export interface BranchPack {
  location: {
    id: string;
    name: string;
    code: string;
    city: string;
    status: string;
    surge_mode: boolean;
    surge_reason: string | null;
  };
  rollup: LocationRollup;
  recent_tickets: Array<{ id: string; title: string; priority: string; status: string; created_at: string }>;
  recent_incidents: Array<{ id: string; summary: string; severity: string; status: string; occurred_at: string }>;
  open_work_orders: Array<{ id: string; title: string; kind: string; status: string; planned_end: string | null }>;
  attractions: Array<{ id: string; name: string; status: string }>;
}

export const getBranchPack = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const { data: location, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code, name, city, status, surge_mode, surge_reason")
      .eq("id", data.locationId)
      .single();
    if (locErr) throw locErr;

    const rollups = await buildLocationRollups(context);
    const rollup = rollups.find((r) => r.location_id === data.locationId);
    if (!rollup) throw new Error("Branch not found or not accessible");

    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [{ data: recent_tickets }, { data: recent_incidents }, { data: open_work_orders }, { data: attractions }] =
      await Promise.all([
        context.supabase
          .from("tickets")
          .select("id, title, priority, status, created_at")
          .eq("location_id", data.locationId)
          .is("deleted_at", null)
          .gte("created_at", since7d)
          .order("created_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("incidents")
          .select("id, summary, severity, status, occurred_at")
          .eq("location_id", data.locationId)
          .order("occurred_at", { ascending: false })
          .limit(10),
        context.supabase
          .from("work_orders")
          .select("id, title, kind, status, planned_end")
          .eq("location_id", data.locationId)
          .not("status", "in", "(completed,cancelled)")
          .order("planned_end", { ascending: true })
          .limit(20),
        context.supabase
          .from("attractions")
          .select("id, name, status")
          .eq("location_id", data.locationId)
          .order("name"),
      ]);

    return {
      location,
      rollup,
      recent_tickets: recent_tickets ?? [],
      recent_incidents: recent_incidents ?? [],
      open_work_orders: open_work_orders ?? [],
      attractions: attractions ?? [],
    } satisfies BranchPack;
  },
  { auth: { capability: "occ.view_branch" } },
);

export const toggleSurgeMode = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    enable: z.boolean(),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("toggle_surge_mode", {
      _location_id: data.locationId,
      _enable: data.enable,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "occ.toggle_surge" } },
);

export interface HandoverDigest {
  location: { id: string; name: string; code: string; city: string };
  generated_at: string;
  window_start: string;
  tickets_opened: number;
  tickets_closed: number;
  incidents: number;
  work_orders_completed: number;
  open_urgent: Array<{ id: string; title: string; priority: string }>;
  open_high: Array<{ id: string; title: string; priority: string }>;
}

export const getHandoverDigest = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const windowStart = new Date(Date.now() - 8 * 3600_000).toISOString();
    const { data: location, error: locErr } = await context.supabase
      .from("locations")
      .select("id, code, name, city")
      .eq("id", data.locationId)
      .single();
    if (locErr) throw locErr;

    const [
      { count: ticketsOpened },
      { count: ticketsClosed },
      { count: incidentsCount },
      { count: wosDoneCount },
      { data: openTickets },
    ] = await Promise.all([
      context.supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("location_id", data.locationId)
        .gte("created_at", windowStart),
      context.supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("location_id", data.locationId)
        .gte("resolved_at", windowStart),
      context.supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("location_id", data.locationId)
        .gte("occurred_at", windowStart),
      context.supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("location_id", data.locationId)
        .eq("status", "completed")
        .gte("actual_end", windowStart),
      context.supabase
        .from("tickets")
        .select("id, title, priority")
        .eq("location_id", data.locationId)
        .is("deleted_at", null)
        .not("status", "in", "(resolved,closed,cancelled)")
        .in("priority", ["urgent", "high"]),
    ]);

    const open_urgent = (openTickets ?? []).filter((t) => t.priority === "urgent");
    const open_high = (openTickets ?? []).filter((t) => t.priority === "high");

    return {
      location,
      generated_at: new Date().toISOString(),
      window_start: windowStart,
      tickets_opened: ticketsOpened ?? 0,
      tickets_closed: ticketsClosed ?? 0,
      incidents: incidentsCount ?? 0,
      work_orders_completed: wosDoneCount ?? 0,
      open_urgent,
      open_high,
    } satisfies HandoverDigest;
  },
  { auth: { capability: "occ.run_handover" } },
);

export const submitHandover = createAuthenticatedAction(
  z.object({
    locationId: z.string().uuid(),
    windowStart: z.string().datetime(),
    notes: z.string().max(4000).optional(),
    digest: z.record(z.unknown()),
  }),
  async (data, context) => {
    const { data: id, error } = await context.supabase.rpc("submit_handover", {
      _location_id: data.locationId,
      _to_user: context.userId,
      _window_start: data.windowStart,
      _digest: data.digest as never,
      _notes: data.notes ?? "",
    });
    if (error) throw error;
    return { id: id as string };
  },
  { auth: { capability: "occ.run_handover" } },
);

export const listHandovers = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid() }),
  async (data, context) => {
    const { data: rows, error } = await context.supabase
      .from("handovers")
      .select("id, signed_at, notes, from_user")
      .eq("location_id", data.locationId)
      .order("signed_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return rows ?? [];
  },
  { auth: { capability: "occ.view_branch" } },
);

export interface ExceptionItem {
  id: string;
  kind: "ticket" | "incident" | "work_order" | "complaint";
  location_id: string;
  title: string;
  severity: string;
  created_at: string;
}

export const getExceptionsFeed = createAuthenticatedActionNoInput(async (context) => {
  const now = new Date().toISOString();
  const items: ExceptionItem[] = [];

  const [urgentTickets, openIncidents, overdueWos, openComplaints] = await Promise.all([
    context.supabase
      .from("tickets")
      .select("id, location_id, title, priority, created_at")
      .is("deleted_at", null)
      .in("priority", ["urgent", "high"])
      .not("status", "in", "(resolved,closed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(40),
    context.supabase
      .from("incidents")
      .select("id, location_id, summary, severity, occurred_at")
      .neq("status", "closed")
      .order("occurred_at", { ascending: false })
      .limit(30),
    context.supabase
      .from("work_orders")
      .select("id, location_id, title, planned_end, created_at")
      .not("status", "in", "(completed,cancelled)")
      .lt("planned_end", now)
      .order("planned_end")
      .limit(30),
    context.supabase
      .from("complaints")
      .select("id, location_id, summary, severity, created_at")
      .not("status", "in", "(resolved,dismissed)")
      .in("severity", ["high", "critical"])
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  for (const t of urgentTickets.data ?? []) {
    items.push({
      id: t.id,
      kind: "ticket",
      location_id: t.location_id,
      title: t.title,
      severity: t.priority,
      created_at: t.created_at,
    });
  }
  for (const i of openIncidents.data ?? []) {
    items.push({
      id: i.id,
      kind: "incident",
      location_id: i.location_id,
      title: i.summary,
      severity: i.severity,
      created_at: i.occurred_at,
    });
  }
  for (const w of overdueWos.data ?? []) {
    items.push({
      id: w.id,
      kind: "work_order",
      location_id: w.location_id,
      title: w.title,
      severity: "overdue",
      created_at: w.planned_end ?? w.created_at,
    });
  }
  for (const c of openComplaints.data ?? []) {
    items.push({
      id: c.id,
      kind: "complaint",
      location_id: c.location_id,
      title: c.summary,
      severity: c.severity,
      created_at: c.created_at,
    });
  }

  const severityOrder: Record<string, number> = {
    urgent: 0,
    critical: 1,
    high: 2,
    overdue: 3,
    medium: 4,
    normal: 5,
    low: 6,
  };

  return items.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}, { auth: { capability: "occ.view_estate" } });
