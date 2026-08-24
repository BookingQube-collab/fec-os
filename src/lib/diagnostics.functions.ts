"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
  createSafeAuthenticatedAction,
  type AuthContext,
} from "@/lib/server/create-action";
import { DIAGNOSTICS_TABLES } from "@/lib/diagnostics/constants";
import { clearServerSessionCache } from "@/lib/server/auth";
import { clearRouteCache } from "@/lib/server/route-cache";

const EXEC_ROLE_LEVEL = 80;
const DB_LATENCY_OPTIMAL_MS = 85;
const DEDUP_WINDOW_MS = 5 * 60_000;

export type CrashSeverity = "info" | "warning" | "critical";
export type CrashStatus = "open" | "resolved";
export type CrashSource = "client" | "server" | "test" | "heal" | "scan";

export interface CrashIncident {
  id: string;
  created_at: string;
  updated_at: string;
  message: string;
  stack: string | null;
  route: string | null;
  user_id: string | null;
  severity: CrashSeverity;
  status: CrashStatus;
  source: CrashSource;
  resolved_at: string | null;
  resolved_by: string | null;
  metadata: Record<string, unknown>;
}

export interface SchemaCheck {
  table: string;
  exists: boolean;
}

export interface HeapSnapshot {
  available: boolean;
  heapUsedMb: number | null;
  heapTotalMb: number | null;
  rssMb: number | null;
  externalMb: number | null;
  status: "normal" | "elevated" | "unknown";
  note: string;
}

export interface HealthSnapshot {
  scannedAt: string;
  dbLatencyMs: number | null;
  dbStatus: "optimal" | "degraded" | "critical" | "unknown";
  dbNote: string;
  openIncidents: number;
  incidentStatus: "all_clear" | "attention";
  heap: HeapSnapshot;
  pipeline: {
    status: "armed" | "degraded" | "down";
    recipientCount: number;
    tableReady: boolean;
    note: string;
  };
}

export interface DiagnosticsAuditRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface DiagnosticsHub {
  health: HealthSnapshot;
  incidents: CrashIncident[];
  schema: SchemaCheck[];
  audit: DiagnosticsAuditRow[];
  openCount: number;
  auditCount: number;
}

function bytesToMb(n: number): number {
  return Math.round((n / 1024 / 1024) * 10) / 10;
}

function readHeap(): HeapSnapshot {
  const note =
    "Node process.memoryUsage() for this server isolate. On Vercel/serverless this is not the full fleet, and it is not the browser heap.";
  try {
    if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
      return {
        available: false,
        heapUsedMb: null,
        heapTotalMb: null,
        rssMb: null,
        externalMb: null,
        status: "unknown",
        note,
      };
    }
    const mem = process.memoryUsage();
    const ratio = mem.heapTotal > 0 ? mem.heapUsed / mem.heapTotal : 0;
    return {
      available: true,
      heapUsedMb: bytesToMb(mem.heapUsed),
      heapTotalMb: bytesToMb(mem.heapTotal),
      rssMb: bytesToMb(mem.rss),
      externalMb: bytesToMb(mem.external),
      status: ratio >= 0.9 ? "elevated" : "normal",
      note,
    };
  } catch {
    return {
      available: false,
      heapUsedMb: null,
      heapTotalMb: null,
      rssMb: null,
      externalMb: null,
      status: "unknown",
      note,
    };
  }
}

function mapIncident(row: Record<string, unknown>): CrashIncident {
  const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
    string,
    unknown
  >;
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    message: String(row.message),
    stack: typeof row.stack === "string" ? row.stack : null,
    route: typeof row.route === "string" ? row.route : null,
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    severity: (row.severity as CrashSeverity) || "critical",
    status: (row.status as CrashStatus) || "open",
    source: (row.source as CrashSource) || "client",
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
    resolved_by: typeof row.resolved_by === "string" ? row.resolved_by : null,
    metadata,
  };
}

async function logDiagnosticsAudit(
  context: AuthContext,
  action: string,
  rowId?: string | null,
  after?: Record<string, unknown>,
  reason?: string,
) {
  await context.supabase.rpc("log_audit", {
    _action: action,
    _table_name: "sys_crash_incidents",
    _row_id: rowId ?? undefined,
    _after: (after ?? {}) as Json,
    _reason: reason,
    _metadata: { hub: "diagnostics" } as Json,
  });
}

async function listExecRecipientIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role_level")
    .gte("role_level", EXEC_ROLE_LEVEL);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))];
}

async function notifyExecutives(input: {
  title: string;
  body: string;
  actionUrl?: string;
  severity?: "info" | "warning" | "critical";
  sourceId?: string;
}): Promise<number> {
  const userIds = await listExecRecipientIds();
  if (userIds.length === 0) return 0;
  const rows = userIds.map((user_id) => ({
    user_id,
    category: "general",
    title: input.title,
    body: input.body,
    severity: input.severity ?? "critical",
    action_url: input.actionUrl ?? "/admin/diagnostics",
    source_type: "diagnostics",
    source_id: input.sourceId ?? null,
  }));
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) throw error;
  return rows.length;
}

async function measureDbLatency(context: AuthContext): Promise<{
  ms: number | null;
  status: HealthSnapshot["dbStatus"];
  note: string;
}> {
  const note = "Round-trip to Supabase/PostgREST via sys_health_ping().";
  const started = performance.now();
  const { error } = await context.supabase.rpc("sys_health_ping");
  const ms = Math.round((performance.now() - started) * 10) / 10;
  if (error) {
    return { ms, status: "critical", note: `${note} ${error.message}` };
  }
  const status = ms < DB_LATENCY_OPTIMAL_MS ? "optimal" : ms < 200 ? "degraded" : "critical";
  return { ms, status, note };
}

async function inspectSchema(context: AuthContext): Promise<SchemaCheck[]> {
  const { data, error } = await context.supabase.rpc("sys_schema_inspect", {
    _tables: [...DIAGNOSTICS_TABLES],
  });
  if (!error && Array.isArray(data)) {
    return data.map((row) => ({
      table: String((row as { table_name?: string }).table_name ?? ""),
      exists: Boolean((row as { exists?: boolean }).exists),
    }));
  }

  const fallback: SchemaCheck[] = [];
  for (const table of DIAGNOSTICS_TABLES) {
    const probe = await context.supabase
      .from(table as "locations")
      .select("*", { count: "exact", head: true });
    fallback.push({
      table,
      exists: !probe.error || !/does not exist|schema cache/i.test(probe.error.message),
    });
  }
  return fallback;
}

async function loadIncidents(context: AuthContext): Promise<CrashIncident[]> {
  const { data, error } = await context.supabase
    .from("sys_crash_incidents")
    .select(
      "id, created_at, updated_at, message, stack, route, user_id, severity, status, source, resolved_at, resolved_by, metadata",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((row) => mapIncident(row as Record<string, unknown>));
}

async function loadAudit(context: AuthContext): Promise<DiagnosticsAuditRow[]> {
  const { data, error } = await context.supabase
    .from("audit_log")
    .select("id, created_at, actor_id, actor_email, action, table_name, row_id, reason, metadata")
    .or("action.like.diagnostics.%,table_name.eq.sys_crash_incidents")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    actor_id: row.actor_id,
    actor_email: row.actor_email,
    action: row.action,
    table_name: row.table_name,
    row_id: row.row_id,
    reason: row.reason,
    metadata: (row.metadata && typeof row.metadata === "object"
      ? row.metadata
      : {}) as Record<string, unknown>,
  }));
}

async function buildHealth(
  context: AuthContext,
  incidents: CrashIncident[],
  schema: SchemaCheck[],
): Promise<HealthSnapshot> {
  const db = await measureDbLatency(context);
  const openIncidents = incidents.filter((i) => i.status === "open").length;
  const tableReady = schema.find((s) => s.table === "sys_crash_incidents")?.exists ?? false;
  let recipientCount = 0;
  try {
    recipientCount = (await listExecRecipientIds()).length;
  } catch {
    recipientCount = 0;
  }
  const pipelineStatus: HealthSnapshot["pipeline"]["status"] = !tableReady
    ? "down"
    : recipientCount === 0
      ? "degraded"
      : "armed";
  return {
    scannedAt: new Date().toISOString(),
    dbLatencyMs: db.ms,
    dbStatus: db.status,
    dbNote: db.note,
    openIncidents,
    incidentStatus: openIncidents === 0 ? "all_clear" : "attention",
    heap: readHeap(),
    pipeline: {
      status: pipelineStatus,
      recipientCount,
      tableReady,
      note:
        pipelineStatus === "armed"
          ? "Render crashes POST into sys_crash_incidents and notify executives (role level ≥ 80)."
          : pipelineStatus === "degraded"
            ? "Incident table is reachable but no executive recipients were found."
            : "Incident table is missing — apply the sys_crash_incidents migration.",
    },
  };
}

async function buildHub(context: AuthContext): Promise<DiagnosticsHub> {
  const [incidents, schema, audit] = await Promise.all([
    loadIncidents(context),
    inspectSchema(context),
    loadAudit(context),
  ]);
  const health = await buildHealth(context, incidents, schema);
  return {
    health,
    incidents,
    schema,
    audit,
    openCount: health.openIncidents,
    auditCount: audit.length,
  };
}

export const getDiagnosticsHub = createAuthenticatedActionNoInput(
  async (context) => buildHub(context),
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

export const runHealthScan = createAuthenticatedActionNoInput(
  async (context) => {
    const hub = await buildHub(context);
    await logDiagnosticsAudit(
      context,
      "diagnostics.health_scan",
      null,
      {
        dbLatencyMs: hub.health.dbLatencyMs,
        openIncidents: hub.health.openIncidents,
        heapUsedMb: hub.health.heap.heapUsedMb,
        pipeline: hub.health.pipeline.status,
      },
      "Health scan",
    );
    return hub;
  },
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

export const purgeAndHealCache = createAuthenticatedActionNoInput(
  async (context) => {
    const route = clearRouteCache();
    const session = clearServerSessionCache();
    await logDiagnosticsAudit(
      context,
      "diagnostics.purge_cache",
      null,
      { route, session, rateLimitBuckets: 0, locks: 0 },
      "Purged in-memory route and session caches",
    );
    return {
      route,
      session,
      rateLimitBuckets: 0,
      locks: 0,
      note: "No rate-limit buckets or lock table exist in this app. Cleared in-memory API route cache and auth session cache on this Node isolate.",
    };
  },
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

export const dispatchCrashAlert = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("sys_crash_incidents")
      .insert({
        message: "Test crash alert dispatched from Diagnostics Hub",
        stack: null,
        route: "/admin/diagnostics",
        user_id: context.userId,
        severity: "warning",
        status: "open",
        source: "test",
        metadata: { test: true, dispatched_by: context.userId },
      })
      .select(
        "id, created_at, updated_at, message, stack, route, user_id, severity, status, source, resolved_at, resolved_by, metadata",
      )
      .single();
    if (error) throw error;
    const incident = mapIncident(data as Record<string, unknown>);
    const notified = await notifyExecutives({
      title: "FEC-OS crash alert (test)",
      body: "Diagnostics Hub dispatched a test crash alert. Open System Diagnostics to review the live incident queue.",
      severity: "warning",
      sourceId: incident.id,
    });
    await logDiagnosticsAudit(
      context,
      "diagnostics.dispatch_alert",
      incident.id,
      { notified },
      "Test crash alert",
    );
    return { incident, notified };
  },
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

export const resolveAllIncidents = createAuthenticatedActionNoInput(
  async (context) => {
    const now = new Date().toISOString();
    const { data, error } = await context.supabase
      .from("sys_crash_incidents")
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: context.userId,
      })
      .eq("status", "open")
      .select("id");
    if (error) throw error;
    const resolved = data?.length ?? 0;
    await logDiagnosticsAudit(
      context,
      "diagnostics.resolve_all",
      null,
      { resolved },
      "Resolved all open crash incidents",
    );
    return { resolved };
  },
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

export const resolveIncident = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("sys_crash_incidents")
      .update({
        status: "resolved",
        resolved_at: now,
        resolved_by: context.userId,
      })
      .eq("id", data.id)
      .eq("status", "open");
    if (error) throw error;
    await logDiagnosticsAudit(context, "diagnostics.resolve_incident", data.id, {}, "Resolved incident");
    return { ok: true };
  },
  { auth: { capability: "admin.diagnostics", minRoleLevel: EXEC_ROLE_LEVEL } },
);

const reportCrashSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(16000).optional(),
  route: z.string().max(500).optional(),
  severity: z.enum(["info", "warning", "critical"]).default("critical"),
  componentStack: z.string().max(16000).optional(),
  digest: z.string().max(200).optional(),
});

export const reportClientCrash = createSafeAuthenticatedAction(
  reportCrashSchema,
  async (data, context) => {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: existing } = await context.supabase
      .from("sys_crash_incidents")
      .select("id")
      .eq("status", "open")
      .eq("message", data.message)
      .eq("route", data.route ?? "")
      .gte("created_at", since)
      .limit(1);

    if (existing?.[0]?.id) {
      return { id: existing[0].id, duplicate: true, notified: 0 };
    }

    const { data: row, error } = await context.supabase
      .from("sys_crash_incidents")
      .insert({
        message: data.message,
        stack: data.stack ?? null,
        route: data.route ?? null,
        user_id: context.userId,
        severity: data.severity,
        status: "open",
        source: "client",
        metadata: {
          componentStack: data.componentStack ?? null,
          digest: data.digest ?? null,
          reported_by: context.userId,
        },
      })
      .select("id")
      .single();
    if (error) throw error;

    let notified = 0;
    try {
      notified = await notifyExecutives({
        title: "FEC-OS render crash",
        body: `${data.message.slice(0, 180)}${data.route ? ` · ${data.route}` : ""}`,
        severity: data.severity === "info" ? "warning" : data.severity,
        sourceId: row.id,
      });
    } catch {
      notified = 0;
    }

    return { id: row.id, duplicate: false, notified };
  },
  { auth: { requireRole: false } },
);
