"use server";

import { z } from "zod";

import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

export type KpiRating = "excellent" | "good" | "needs_attention" | "poor";

export interface KpiTemplateRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  target_role: string | null;
  department: string | null;
  active: boolean;
  item_count?: number;
}

export interface KpiScoreRow {
  id: string;
  total_score: number;
  rating: string | null;
  period_label: string;
  staff_name: string | null;
  location_name: string | null;
  template_name: string;
}

function ratingForScore(score: number): KpiRating {
  if (score >= 90) return "excellent";
  if (score >= 80) return "good";
  if (score >= 70) return "needs_attention";
  return "poor";
}

const LocFilter = z
  .object({
    locationId: z.string().uuid().nullable().optional(),
    periodId: z.string().uuid().nullable().optional(),
    templateId: z.string().uuid().nullable().optional(),
  })
  .default({});

export const listKpiTemplates = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("kpi_templates")
      .select("id, code, name, description, target_role, department, active")
      .eq("active", true)
      .order("name");
    if (error) throw error;

    const ids = (data ?? []).map((t) => t.id);
    const { data: itemCounts } = ids.length
      ? await context.supabase.from("kpi_template_items").select("template_id").in("template_id", ids)
      : { data: [] };

    const countMap = new Map<string, number>();
    for (const item of itemCounts ?? []) {
      countMap.set(item.template_id, (countMap.get(item.template_id) ?? 0) + 1);
    }

    return (data ?? []).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      target_role: t.target_role,
      department: t.department,
      active: t.active,
      item_count: countMap.get(t.id) ?? 0,
    })) satisfies KpiTemplateRow[];
  },
  { auth: { capability: "kpi.view" } },
);

export const getKpiTemplate = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: template, error } = await context.supabase
      .from("kpi_templates")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("kpi_template_items")
      .select("*")
      .eq("template_id", data.id)
      .order("sort_order");
    return { ...template, items: items ?? [] };
  },
  { auth: { capability: "kpi.view" } },
);

export const listKpiPeriods = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("kpi_periods")
      .select("id, period_kind, period_start, period_end, label, status")
      .order("period_start", { ascending: false })
      .limit(12);
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "kpi.view" } },
);

export const listKpiScores = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("kpi_scores")
      .select("id, total_score, rating, location_id, staff_id, assignment_id, period_id")
      .order("total_score", { ascending: false });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.periodId) q = q.eq("period_id", data.periodId);
    const { data: rows, error } = await q.limit(100);
    if (error) throw error;
    if (!rows?.length) return [];

    const periodIds = [...new Set(rows.map((r) => r.period_id))];
    const assignmentIds = [...new Set(rows.map((r) => r.assignment_id))];
    const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[];
    const locIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean))] as string[];

    const [{ data: periods }, { data: assignments }, { data: staff }, { data: locs }] = await Promise.all([
      context.supabase.from("kpi_periods").select("id, label").in("id", periodIds),
      context.supabase.from("kpi_assignments").select("id, template_id").in("id", assignmentIds),
      staffIds.length
        ? context.supabase.from("staff").select("id, full_name").in("id", staffIds)
        : Promise.resolve({ data: [] }),
      locIds.length
        ? context.supabase.from("locations").select("id, name").in("id", locIds)
        : Promise.resolve({ data: [] }),
    ]);

    const templateIds = [...new Set((assignments ?? []).map((a) => a.template_id))];
    const { data: templates } = templateIds.length
      ? await context.supabase.from("kpi_templates").select("id, name").in("id", templateIds)
      : { data: [] };

    const periodMap = new Map((periods ?? []).map((p) => [p.id, p.label]));
    const templateMap = new Map((templates ?? []).map((t) => [t.id, t.name]));
    const assignTemplateMap = new Map(
      (assignments ?? []).map((a) => [a.id, templateMap.get(a.template_id) ?? "—"]),
    );
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
    const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));

    return rows.map((r) => ({
      id: r.id,
      total_score: Number(r.total_score),
      rating: r.rating,
      period_label: periodMap.get(r.period_id) ?? "—",
      staff_name: r.staff_id ? staffMap.get(r.staff_id) ?? null : null,
      location_name: r.location_id ? locMap.get(r.location_id) ?? null : null,
      template_name: assignTemplateMap.get(r.assignment_id) ?? "—",
    })) satisfies KpiScoreRow[];
  },
  { defaultInput: {}, auth: { capability: "kpi.view" } },
);

export const getKpiScoreDetail = createAuthenticatedAction(
  z.object({ scoreId: z.string().uuid() }),
  async (data, context) => {
    const { data: score, error } = await context.supabase
      .from("kpi_scores")
      .select("*")
      .eq("id", data.scoreId)
      .single();
    if (error) throw error;
    const { data: details } = await context.supabase
      .from("kpi_score_details")
      .select("*")
      .eq("score_id", data.scoreId);
    return { ...score, details: details ?? [] };
  },
  { auth: { capability: "kpi.view" } },
);

export const upsertKpiScoreDetail = createAuthenticatedAction(
  z.object({
    scoreId: z.string().uuid(),
    itemId: z.string().uuid(),
    normalizedScore: z.number().min(0).max(100),
    notes: z.string().max(500).optional(),
  }),
  async (data, context) => {
    const { data: item, error: itemErr } = await context.supabase
      .from("kpi_template_items")
      .select("weight")
      .eq("id", data.itemId)
      .single();
    if (itemErr) throw itemErr;

    const weight = Number(item.weight);
    const weighted = (data.normalizedScore * weight) / 100;

    const { error } = await context.supabase.from("kpi_score_details").upsert(
      {
        score_id: data.scoreId,
        item_id: data.itemId,
        normalized_score: data.normalizedScore,
        weighted_score: weighted,
        source: "manual",
        notes: data.notes ?? null,
        entered_by: context.userId,
      },
      { onConflict: "score_id,item_id" },
    );
    if (error) throw error;

    await recalculateKpiScore(context.supabase, data.scoreId);
    return { ok: true };
  },
  { auth: { capability: "kpi.score_entry" } },
);

async function recalculateKpiScore(
  supabase: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>["supabase"],
  scoreId: string,
) {
  const { data: details } = await supabase
    .from("kpi_score_details")
    .select("weighted_score, item_id")
    .eq("score_id", scoreId);

  const itemIds = [...new Set((details ?? []).map((d) => d.item_id))];
  const { data: items } = itemIds.length
    ? await supabase.from("kpi_template_items").select("id, weight").in("id", itemIds)
    : { data: [] };
  const weightMap = new Map((items ?? []).map((i) => [i.id, Number(i.weight)]));

  const totalWeight = (details ?? []).reduce((a, d) => a + (weightMap.get(d.item_id) ?? 0), 0);
  const totalScore = (details ?? []).reduce((a, d) => a + Number(d.weighted_score), 0);
  const normalized = totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0;
  const rating = ratingForScore(normalized);

  await supabase
    .from("kpi_scores")
    .update({
      total_score: Math.round(normalized * 100) / 100,
      rating,
      calculated_at: new Date().toISOString(),
    })
    .eq("id", scoreId);
}

export const createKpiAssignment = createAuthenticatedAction(
  z.object({
    templateId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    staffId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    department: z.string().max(100).optional(),
  }),
  async (data, context) => {
    const { data: row, error } = await context.supabase
      .from("kpi_assignments")
      .insert({
        template_id: data.templateId,
        location_id: data.locationId ?? null,
        staff_id: data.staffId ?? null,
        user_id: data.userId ?? null,
        department: data.department ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  },
  { auth: { capability: "kpi.manage_templates" } },
);

/** Resolve auto-scored KPI item value (0–100) from operational data. */
async function resolveAutoQueryScore(
  supabase: Awaited<ReturnType<typeof import("@/lib/server/auth").getAuthenticatedContext>>["supabase"],
  key: string,
  ctx: { locationId?: string | null; staffId?: string | null; userId?: string | null; periodStart: string; periodEnd: string },
): Promise<number | null> {
  const loc = ctx.locationId ?? undefined;

  switch (key) {
    case "attendance_punctuality": {
      let q = supabase
        .from("attendance_daily_summary")
        .select("status, late_minutes")
        .gte("work_date", ctx.periodStart)
        .lte("work_date", ctx.periodEnd);
      if (loc) q = q.eq("location_id", loc);
      if (ctx.staffId) q = q.eq("staff_id", ctx.staffId);
      const { data } = await q;
      const rows = data ?? [];
      if (!rows.length) return null;
      const onTime = rows.filter((r) => r.status === "present" && Number(r.late_minutes ?? 0) === 0).length;
      return Math.round((onTime / rows.length) * 100);
    }
    case "complaint_count":
    case "customer_complaints": {
      let q = supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .gte("created_at", ctx.periodStart)
        .lte("created_at", `${ctx.periodEnd}T23:59:59`);
      if (loc) q = q.eq("location_id", loc);
      const { count } = await q;
      const n = count ?? 0;
      return Math.max(0, 100 - n * 5);
    }
    case "checklist_completion":
    case "opening_checklist":
    case "closing_checklist": {
      let q = supabase
        .from("task_instances")
        .select("status")
        .gte("scheduled_for", ctx.periodStart)
        .lte("scheduled_for", ctx.periodEnd);
      if (loc) q = q.eq("location_id", loc);
      const { data } = await q;
      const total = data?.length ?? 0;
      if (!total) return null;
      const done = (data ?? []).filter((t) => t.status === "completed").length;
      return Math.round((done / total) * 100);
    }
    case "staff_attendance": {
      let q = supabase
        .from("attendance_daily_summary")
        .select("status")
        .gte("work_date", ctx.periodStart)
        .lte("work_date", ctx.periodEnd);
      if (loc) q = q.eq("location_id", loc);
      const { data } = await q;
      const total = data?.length ?? 0;
      if (!total) return null;
      const present = (data ?? []).filter((r) => r.status === "present").length;
      return Math.round((present / total) * 100);
    }
    case "issue_closure": {
      let q = supabase.from("tickets").select("status").gte("created_at", ctx.periodStart);
      if (loc) q = q.eq("location_id", loc);
      const { data } = await q;
      const total = data?.length ?? 0;
      if (!total) return null;
      const closed = (data ?? []).filter((i) => ["resolved", "closed"].includes(i.status)).length;
      return Math.round((closed / total) * 100);
    }
    case "pm_completion": {
      let q = supabase
        .from("work_orders")
        .select("status, kind")
        .eq("kind", "preventive")
        .gte("planned_start", ctx.periodStart)
        .lte("planned_start", `${ctx.periodEnd}T23:59:59`);
      if (loc) q = q.eq("location_id", loc);
      const { data } = await q;
      const total = data?.length ?? 0;
      if (!total) return null;
      const done = (data ?? []).filter((w) => w.status === "completed").length;
      return Math.round((done / total) * 100);
    }
    case "escalated_complaints": {
      let q = supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .eq("severity", "urgent")
        .gte("created_at", ctx.periodStart);
      if (loc) q = q.eq("location_id", loc);
      const { count } = await q;
      return Math.max(0, 100 - (count ?? 0) * 10);
    }
    default:
      return null;
  }
}

export const runKpiAutoScoring = createAuthenticatedAction(
  z.object({
    periodId: z.string().uuid(),
    locationId: z.string().uuid().nullable().optional(),
  }),
  async (data, context) => {
    const { data: period, error: pErr } = await context.supabase
      .from("kpi_periods")
      .select("period_start, period_end")
      .eq("id", data.periodId)
      .single();
    if (pErr) throw pErr;

    let assignQ = context.supabase.from("kpi_assignments").select("id, template_id, location_id, staff_id, user_id").eq("active", true);
    if (data.locationId) assignQ = assignQ.eq("location_id", data.locationId);
    const { data: assignments, error: aErr } = await assignQ;
    if (aErr) throw aErr;

    let updated = 0;
    for (const assignment of assignments ?? []) {
      const { data: items } = await context.supabase
        .from("kpi_template_items")
        .select("id, weight, auto_query_key, data_source")
        .eq("template_id", assignment.template_id)
        .eq("data_source", "auto")
        .not("auto_query_key", "is", null);

      if (!items?.length) continue;

      const { data: scoreRow } = await context.supabase
        .from("kpi_scores")
        .upsert(
          {
            assignment_id: assignment.id,
            period_id: data.periodId,
            location_id: assignment.location_id,
            staff_id: assignment.staff_id,
            user_id: assignment.user_id,
          },
          { onConflict: "assignment_id,period_id" },
        )
        .select("id")
        .single();

      if (!scoreRow) continue;

      for (const item of items) {
        const normalized = await resolveAutoQueryScore(context.supabase, item.auto_query_key!, {
          locationId: assignment.location_id,
          staffId: assignment.staff_id,
          userId: assignment.user_id,
          periodStart: period.period_start,
          periodEnd: period.period_end,
        });
        if (normalized == null) continue;

        const weight = Number(item.weight);
        await context.supabase.from("kpi_score_details").upsert(
          {
            score_id: scoreRow.id,
            item_id: item.id,
            normalized_score: normalized,
            weighted_score: (normalized * weight) / 100,
            source: "auto",
            entered_by: context.userId,
          },
          { onConflict: "score_id,item_id" },
        );
        updated += 1;
      }

      await recalculateKpiScore(context.supabase, scoreRow.id);
    }

    return { itemsUpdated: updated };
  },
  { auth: { capability: "kpi.manage_templates" } },
);

export const exportKpiScoresCsv = createAuthenticatedAction(
  LocFilter,
  async (data, context) => {
    let q = context.supabase
      .from("kpi_scores")
      .select("id, total_score, rating, location_id, staff_id, assignment_id, period_id")
      .order("total_score", { ascending: false });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.periodId) q = q.eq("period_id", data.periodId);
    const { data: rows, error } = await q.limit(500);
    if (error) throw error;

    const scores = rows ?? [];
    if (!scores.length) {
      return { filename: `kpi-scores-${new Date().toISOString().slice(0, 10)}.csv`, csv: "template,period,staff,location,score,rating" };
    }

    const periodIds = [...new Set(scores.map((r) => r.period_id))];
    const assignmentIds = [...new Set(scores.map((r) => r.assignment_id))];
    const [{ data: periods }, { data: assignments }] = await Promise.all([
      context.supabase.from("kpi_periods").select("id, label").in("id", periodIds),
      context.supabase.from("kpi_assignments").select("id, template_id, staff_id, location_id").in("id", assignmentIds),
    ]);
    const templateIds = [...new Set((assignments ?? []).map((a) => a.template_id))];
    const staffIds = [...new Set(scores.map((r) => r.staff_id).filter(Boolean))] as string[];
    const locIds = [...new Set(scores.map((r) => r.location_id).filter(Boolean))] as string[];
    const [{ data: templates }, { data: staff }, { data: locs }] = await Promise.all([
      templateIds.length
        ? context.supabase.from("kpi_templates").select("id, name").in("id", templateIds)
        : Promise.resolve({ data: [] }),
      staffIds.length
        ? context.supabase.from("staff").select("id, full_name").in("id", staffIds)
        : Promise.resolve({ data: [] }),
      locIds.length
        ? context.supabase.from("locations").select("id, name").in("id", locIds)
        : Promise.resolve({ data: [] }),
    ]);

    const periodMap = new Map((periods ?? []).map((p) => [p.id, p.label]));
    const templateMap = new Map((templates ?? []).map((t) => [t.id, t.name]));
    const assignMap = new Map((assignments ?? []).map((a) => [a.id, a]));
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
    const locMap = new Map((locs ?? []).map((l) => [l.id, l.name]));

    const header = "template,period,staff,location,score,rating";
    const lines = scores.map((r) => {
      const assign = assignMap.get(r.assignment_id);
      const template = assign ? templateMap.get(assign.template_id) ?? "—" : "—";
      return `"${template}","${periodMap.get(r.period_id) ?? "—"}","${r.staff_id ? staffMap.get(r.staff_id) ?? "" : ""}","${r.location_id ? locMap.get(r.location_id) ?? "" : ""}",${r.total_score},"${r.rating ?? ""}"`;
    });

    return { filename: `kpi-scores-${new Date().toISOString().slice(0, 10)}.csv`, csv: [header, ...lines].join("\n") };
  },
  { defaultInput: {}, auth: { capability: "kpi.view" } },
);
