"use server";

import { z } from "zod";

import { createAuthenticatedAction } from "@/lib/server/create-action";

const LocFilter = z
  .object({ locationId: z.string().uuid().nullable().optional() })
  .default({});

const FindingStatusEnum = z.enum(["open", "in_remediation", "closed", "accepted_risk"]);

export const listIncidents = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("incidents")
      .select("id, location_id, category, severity, summary, status, occurred_at, closed_at")
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const closeIncident = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    root_cause: z.string().min(3).max(4000),
    actions: z.string().min(3).max(4000),
    reason: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("close_incident", {
      _id: data.id,
      _root_cause: data.root_cause,
      _actions: data.actions,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.close_incident" } },
);

export const listAuditsWithFindings = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let auditQ = context.supabase
      .from("audits")
      .select("id, location_id, audit_type, conducted_on, score, summary")
      .order("conducted_on", { ascending: false })
      .limit(50);
    if (data.locationId) auditQ = auditQ.eq("location_id", data.locationId);
    const { data: audits, error: aErr } = await auditQ;
    if (aErr) throw aErr;
    const auditIds = (audits ?? []).map((a) => a.id);
    if (auditIds.length === 0) return { audits: [], findings: [] };

    const { data: findings, error: fErr } = await context.supabase
      .from("findings")
      .select("id, audit_id, title, detail, severity, status")
      .in("audit_id", auditIds)
      .order("severity");
    if (fErr) throw fErr;
    return { audits: audits ?? [], findings: findings ?? [] };
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const updateFindingStatus = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: FindingStatusEnum, reason: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_finding_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.run_audit" } },
);

export const listObligations = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("obligations")
      .select("id, location_id, title, authority, due_on, status, detail")
      .order("due_on", { ascending: true })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const updateObligationStatus = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: z.string().min(1).max(40), reason: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("update_obligation_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.run_audit" } },
);

export const listMallRequests = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("mall_requests")
      .select("id, location_id, subject, category, status, response_due_at, created_at")
      .order("response_due_at", { ascending: true })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "compliance.view" } },
);

export const respondMallRequest = createAuthenticatedAction(
  z.object({ id: z.string().uuid(), status: z.string().min(1).max(40), reason: z.string().max(500).optional() }),
  async (data, context) => {
    const { error } = await context.supabase.rpc("respond_mall_request", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason ?? undefined,
    });
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "compliance.run_audit" } },
);
