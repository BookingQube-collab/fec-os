"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const RISK_CATEGORIES = [
  "fire_safety", "operational", "customer_safety", "financial", "compliance",
  "reputational", "hr", "it", "vendor", "other",
] as const;

const Filter = z.object({
  locationId: z.string().uuid().nullable().optional(),
  minScore: z.number().int().min(1).max(25).optional(),
  status: z.string().nullable().optional(),
}).default({});

export const listRiskRegister = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    let q = context.supabase.from("risk_register").select("*").order("risk_score", { ascending: false });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.minScore) q = q.gte("risk_score", data.minScore);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    return (rows ?? []).map((r) => ({
      ...r,
      risk_score: Number(r.risk_score),
      location_code: locMap.get(r.location_id)?.code ?? "—",
      location_name: locMap.get(r.location_id)?.name ?? "—",
    }));
  },
  { defaultInput: {}, auth: { capability: "risk.view" } },
);

export const upsertRiskItem = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    locationId: z.string().uuid(),
    riskCategory: z.enum(RISK_CATEGORIES),
    description: z.string().min(5).max(2000),
    impact: z.number().int().min(1).max(5),
    likelihood: z.number().int().min(1).max(5),
    mitigationAction: z.string().max(2000).optional(),
    ownerId: z.string().uuid().optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(["open", "in_progress", "mitigated", "accepted", "closed"]).default("open"),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const row = {
      location_id: data.locationId,
      risk_category: data.riskCategory,
      description: data.description,
      impact: data.impact,
      likelihood: data.likelihood,
      mitigation_action: data.mitigationAction ?? null,
      owner_id: data.ownerId ?? null,
      target_date: data.targetDate ?? null,
      status: data.status,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("risk_register").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase.from("risk_register").insert(row).select("id").single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "risk.manage" } },
);

export const getRiskSummary = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    const rows = await listRiskRegister(data);
    return {
      total: rows.length,
      high_risk: rows.filter((r) => r.risk_score >= 15).length,
      medium_risk: rows.filter((r) => r.risk_score >= 8 && r.risk_score < 15).length,
      open: rows.filter((r) => r.status === "open").length,
    };
  },
  { defaultInput: {}, auth: { capability: "risk.view" } },
);
