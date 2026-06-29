"use server";

import { z } from "zod";

import { assertLocationAccess } from "@/lib/server/authorize";
import { createAuthenticatedAction } from "@/lib/server/create-action";

const UTILITY_TYPES = ["electricity", "water", "internet", "gas", "generator_fuel", "other"] as const;

const Filter = z.object({ locationId: z.string().uuid().nullable().optional() }).default({});

export const listUtilityConsumption = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    let q = context.supabase
      .from("utility_consumption")
      .select("*")
      .order("period_month", { ascending: false })
      .limit(200);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;

    const locIds = [...new Set((rows ?? []).map((r) => r.location_id))];
    const { data: locs } = locIds.length
      ? await context.supabase.from("locations").select("id, code, name, region").in("id", locIds)
      : { data: [] };
    const locMap = new Map((locs ?? []).map((l) => [l.id, l]));

    return (rows ?? []).map((r) => ({
      ...r,
      bill_amount: Number(r.bill_amount),
      consumption: r.consumption != null ? Number(r.consumption) : null,
      location_code: locMap.get(r.location_id)?.code ?? "—",
      location_name: locMap.get(r.location_id)?.name ?? "—",
    }));
  },
  { defaultInput: {}, auth: { capability: "utilities.view" } },
);

export const getUtilityDashboard = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    const rows = await listUtilityConsumption(data);
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = rows.filter((r) => r.period_month.startsWith(month));
    const totalCost = thisMonth.reduce((a, r) => a + r.bill_amount, 0);

    const bySite = new Map<string, { code: string; cost: number; kwh: number }>();
    for (const r of thisMonth) {
      const b = bySite.get(r.location_id) ?? { code: r.location_code, cost: 0, kwh: 0 };
      b.cost += r.bill_amount;
      if (r.utility_type === "electricity" && r.consumption) b.kwh += r.consumption;
      bySite.set(r.location_id, b);
    }

    const avgKwh = [...bySite.values()].reduce((a, s) => a + s.kwh, 0) / Math.max(bySite.size, 1);
    const alerts = [...bySite.entries()]
      .filter(([, s]) => s.kwh > avgKwh * 1.25 && s.kwh > 0)
      .map(([id, s]) => ({ location_id: id, code: s.code, kwh: s.kwh }));

    const monthlyTrend = rows
      .filter((r) => r.utility_type === "electricity")
      .reduce((acc, r) => {
        const key = r.period_month.slice(0, 7);
        acc.set(key, (acc.get(key) ?? 0) + (r.consumption ?? 0));
        return acc;
      }, new Map<string, number>());

    return {
      total_cost_this_month: totalCost,
      record_count: rows.length,
      site_comparison: [...bySite.values()].sort((a, b) => b.cost - a.cost),
      high_consumption_alerts: alerts,
      monthly_trend: [...monthlyTrend.entries()].map(([month, kwh]) => ({ month, kwh })).sort((a, b) => a.month.localeCompare(b.month)),
    };
  },
  { defaultInput: {}, auth: { capability: "utilities.view" } },
);

export const upsertUtilityReading = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    locationId: z.string().uuid(),
    utilityType: z.enum(UTILITY_TYPES),
    meterAccountNumber: z.string().max(100).optional(),
    periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    openingReading: z.number().nullable().optional(),
    closingReading: z.number().nullable().optional(),
    billAmount: z.number().min(0),
    remarks: z.string().max(500).optional(),
  }),
  async (data, context) => {
    await assertLocationAccess(context, data.locationId);
    const row = {
      location_id: data.locationId,
      utility_type: data.utilityType,
      meter_account_number: data.meterAccountNumber ?? null,
      period_month: data.periodMonth,
      opening_reading: data.openingReading ?? null,
      closing_reading: data.closingReading ?? null,
      bill_amount: data.billAmount,
      remarks: data.remarks ?? null,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("utility_consumption").update(row).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("utility_consumption")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return { id: inserted.id };
  },
  { auth: { capability: "utilities.manage" } },
);

export const exportUtilitiesCsv = createAuthenticatedAction(
  Filter,
  async (data, context) => {
    const rows = await listUtilityConsumption(data);
    const header = "site,utility,month,opening,closing,consumption,bill_qar,remarks";
    const lines = rows.map((r) =>
      [r.location_code, r.utility_type, r.period_month, r.opening_reading, r.closing_reading, r.consumption, r.bill_amount, r.remarks]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    return { filename: `utilities-${new Date().toISOString().slice(0, 10)}.csv`, csv: [header, ...lines].join("\n") };
  },
  { defaultInput: {}, auth: { capability: "utilities.view" } },
);
