"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

const ForecastStatusEnum = z.enum(["draft", "published", "archived"]);

export const listForecasts = createAuthenticatedActionNoInput(async (context) => {
  const { data, error } = await context.supabase
    .from("forecasts")
    .select(
      "id, title, description, status, horizon_months, base_revenue_growth_pct, base_margin_pct, footfall_uplift_pct, opex_change_pct, capex_plan_aed, ai_commentary, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}, { auth: { capability: "forecast.view" } });

export const createForecast = createAuthenticatedAction(
  z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(4000).optional(),
    horizon_months: z.number().int().min(1).max(60).default(12),
    base_revenue_growth_pct: z.number().default(0),
    base_margin_pct: z.number().default(20),
    footfall_uplift_pct: z.number().default(0),
    opex_change_pct: z.number().default(0),
    capex_plan_aed: z.number().default(0),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("forecasts")
      .insert({ ...data, description: data.description ?? null, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    await context.supabase.rpc("update_forecast_results", { _forecast_id: row.id });
    return { id: row.id };
  },
  { auth: { capability: "forecast.create" } },
);

export const getForecast = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: forecast, error } = await context.supabase
      .from("forecasts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: results, error: rErr } = await context.supabase
      .from("forecast_results")
      .select(
        "id, location_id, projected_revenue, projected_ebitda, projected_margin_pct, projected_footfall, assumptions, locations(name, code)",
      )
      .eq("forecast_id", data.id)
      .order("projected_revenue", { ascending: false });
    if (rErr) throw rErr;
    return { forecast, results: results ?? [] };
  },
  { auth: { capability: "forecast.view" } },
);

export const updateForecast = createAuthenticatedAction(
  z.object({
    id: z.string().uuid(),
    base_revenue_growth_pct: z.number().optional(),
    base_margin_pct: z.number().optional(),
    footfall_uplift_pct: z.number().optional(),
    opex_change_pct: z.number().optional(),
    capex_plan_aed: z.number().optional(),
    status: ForecastStatusEnum.optional(),
  }),
  async (data, context) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("forecasts").update(patch).eq("id", id);
    if (error) throw error;
    await context.supabase.rpc("update_forecast_results", { _forecast_id: id });
    return { ok: true };
  },
  { auth: { capability: "forecast.create" } },
);

export const deleteForecast = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { error } = await context.supabase.from("forecasts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  },
  { auth: { capability: "forecast.create" } },
);

export const generateForecastCommentary = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: forecast, error } = await context.supabase
      .from("forecasts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const { data: results } = await context.supabase
      .from("forecast_results")
      .select("location_id, projected_revenue, projected_ebitda, projected_footfall")
      .eq("forecast_id", data.id);

    const apiKey = process.env.LOVABLE_API_KEY;
    let commentary = "AI commentary unavailable (no LOVABLE_API_KEY).";
    if (apiKey) {
      const prompt = `You are a CFO analyst. Write a 150-word scenario commentary for this forecast assumptions and per-branch projections. Use QAR.\n\nForecast:\n${JSON.stringify(forecast, null, 2)}\n\nResults sample:\n${JSON.stringify((results ?? []).slice(0, 8), null, 2)}`;
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (resp.ok) {
          const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
          commentary = json.choices?.[0]?.message?.content?.trim() ?? commentary;
        } else {
          commentary = `AI gateway error ${resp.status}.`;
        }
      } catch (e) {
        commentary = `AI call failed: ${(e as Error).message}`;
      }
    }

    await context.supabase.from("forecasts").update({ ai_commentary: commentary }).eq("id", data.id);
    await context.supabase.from("ai_artifacts").insert({
      kind: "forecast",
      title: `Forecast commentary: ${forecast.title}`,
      content: { forecast_id: data.id, commentary },
      model: "google/gemini-2.5-flash",
      created_by: context.userId,
    });
    return { commentary };
  },
  { auth: { capability: "forecast.view" } },
);
