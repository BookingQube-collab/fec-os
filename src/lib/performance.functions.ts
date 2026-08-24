"use server";

import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import {
  attendancePctByStaffMonth,
  resolveAutoKpiActual,
  shouldWriteAutoActual,
} from "@/lib/performance/auto-actuals";
import {
  blendEvaluationScore,
  checkEomEligibility,
  normalizeScore,
  ratingBandForScore,
  sumWeightedScores,
  weightsSumTo100,
  weightedScore,
} from "@/lib/performance/score";
import type { AuthContext } from "@/lib/server/create-action";
import {
  createAuthenticatedAction,
  createAuthenticatedActionNoInput,
} from "@/lib/server/create-action";

async function writePerfAudit(
  context: AuthContext,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    staffId?: string | null;
    locationId?: string | null;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await context.supabase.from("performance_audit_logs").insert({
    actor_id: context.userId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    staff_id: entry.staffId ?? null,
    location_id: entry.locationId ?? null,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
    metadata: (entry.metadata ?? {}) as Json,
  });
}

const EVAL_TRANSITIONS: Record<string, string[]> = {
  draft: ["supervisor_review", "cancelled"],
  supervisor_review: ["manager_review", "draft", "cancelled"],
  manager_review: ["employee_ack", "supervisor_review", "cancelled"],
  employee_ack: ["finalized", "manager_review"],
  finalized: [],
  cancelled: ["draft"],
};

export const listPerformanceCycles = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("performance_cycles")
      .select("id, code, name, period_kind, period_start, period_end, status, kpi_period_id")
      .order("period_start", { ascending: false })
      .limit(24);
    if (error) throw error;
    return data ?? [];
  },
  { auth: { capability: "performance.view" } },
);

const EVAL_STATUS_ORDER = [
  "draft",
  "supervisor_review",
  "manager_review",
  "employee_ack",
  "finalized",
  "cancelled",
] as const;

const RATING_BAND_ORDER = ["excellent", "good", "needs_attention", "poor", "unscored"] as const;

function yearMonth(value: string | null | undefined): string | null {
  if (!value || value.length < 7) return null;
  return value.slice(0, 7);
}

function lastNYearMonths(n: number, from = new Date()): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function countInOrder<T extends string>(
  values: Array<string | null | undefined>,
  order: readonly T[],
  fallback?: T,
): Array<{ key: T; count: number }> {
  const map = new Map<string, number>();
  for (const raw of values) {
    const key = (raw && order.includes(raw as T) ? raw : fallback) as T | undefined;
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return order.filter((k) => (map.get(k) ?? 0) > 0).map((k) => ({ key: k, count: map.get(k) ?? 0 }));
}

type PerformanceDashboardCharts = {
  evaluationsByStatus: Array<{ status: string; count: number }>;
  evaluationsByRating: Array<{ band: string; count: number }>;
  scoreTrend: Array<{ cycle: string; periodStart: string; avgScore: number; scored: number }>;
  avgByDepartment: Array<{ department: string; avgScore: number; count: number }>;
  recognition: Array<{ month: string; achievements: number; nominations: number }>;
};

export const getPerformanceDashboard = createAuthenticatedActionNoInput(
  async (context) => {
    const [
      { data: cycleRows },
      { count: evalCount },
      { count: draftCount },
      { count: finalizedCount },
      { count: achievementCount },
      { count: nominationCount },
      { count: kraTemplateCount },
      { count: kpiTemplateCount },
      { data: evals },
      { data: achievements },
      { data: nominations },
    ] = await Promise.all([
      context.supabase
        .from("performance_cycles")
        .select("id, code, name, status, period_start, period_end")
        .order("period_start", { ascending: false })
        .limit(24),
      context.supabase.from("employee_evaluations").select("id", { count: "exact", head: true }),
      context.supabase
        .from("employee_evaluations")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      context.supabase
        .from("employee_evaluations")
        .select("id", { count: "exact", head: true })
        .eq("status", "finalized"),
      context.supabase.from("employee_achievements").select("id", { count: "exact", head: true }),
      context.supabase
        .from("employee_nominations")
        .select("id", { count: "exact", head: true })
        .eq("status", "shortlisted"),
      context.supabase
        .from("kra_templates")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      context.supabase
        .from("kpi_templates")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .not("job_role_key", "is", null),
      context.supabase
        .from("employee_evaluations")
        .select("status, rating_band, total_score, cycle_id, staff_id")
        .limit(2000),
      context.supabase.from("employee_achievements").select("achieved_on").limit(1000),
      context.supabase.from("employee_nominations").select("nomination_month").limit(500),
    ]);

    const openCycle = cycleRows?.find((c) => c.status === "open") ?? null;
    const evalRows = evals ?? [];
    const staffIds = [...new Set(evalRows.map((e) => e.staff_id).filter(Boolean))];
    const { data: staffRows } =
      staffIds.length > 0
        ? await context.supabase.from("staff").select("id, department").in("id", staffIds)
        : { data: [] as Array<{ id: string; department: string | null }> };
    const deptByStaff = new Map((staffRows ?? []).map((s) => [s.id, s.department]));

    const openScores = openCycle
      ? evalRows
          .filter((e) => e.cycle_id === openCycle.id && e.total_score != null)
          .map((e) => Number(e.total_score))
          .filter((n) => Number.isFinite(n))
      : [];
    const avgScore = openScores.length
      ? openScores.reduce((a, b) => a + b, 0) / openScores.length
      : null;

    const evaluationsByStatus = countInOrder(
      evalRows.map((e) => e.status),
      EVAL_STATUS_ORDER,
    ).map((row) => ({ status: row.key, count: row.count }));

    const evaluationsByRating = countInOrder(
      evalRows.map((e) => e.rating_band),
      RATING_BAND_ORDER,
      "unscored",
    ).map((row) => ({ band: row.key, count: row.count }));

    const cycleMap = new Map((cycleRows ?? []).map((c) => [c.id, c]));
    const scoresByCycle = new Map<string, number[]>();
    for (const row of evalRows) {
      const score = row.total_score != null ? Number(row.total_score) : NaN;
      if (!Number.isFinite(score)) continue;
      const list = scoresByCycle.get(row.cycle_id) ?? [];
      list.push(score);
      scoresByCycle.set(row.cycle_id, list);
    }
    const scoreTrend = [...scoresByCycle.entries()]
      .map(([cycleId, scores]) => {
        const cycle = cycleMap.get(cycleId);
        return {
          cycle: cycle?.name ?? cycle?.code ?? cycleId.slice(0, 8),
          periodStart: cycle?.period_start ?? "",
          avgScore: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
          scored: scores.length,
        };
      })
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    const deptScores = new Map<string, number[]>();
    for (const row of evalRows) {
      const score = row.total_score != null ? Number(row.total_score) : NaN;
      if (!Number.isFinite(score)) continue;
      const dept = deptByStaff.get(row.staff_id)?.trim() || "";
      const list = deptScores.get(dept) ?? [];
      list.push(score);
      deptScores.set(dept, list);
    }
    const avgByDepartment = [...deptScores.entries()]
      .map(([department, scores]) => ({
        department,
        avgScore: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 12);

    const months = lastNYearMonths(8);
    const achByMonth = new Map<string, number>();
    for (const row of achievements ?? []) {
      const key = yearMonth(row.achieved_on);
      if (!key) continue;
      achByMonth.set(key, (achByMonth.get(key) ?? 0) + 1);
    }
    const nomByMonth = new Map<string, number>();
    for (const row of nominations ?? []) {
      const key = yearMonth(row.nomination_month);
      if (!key) continue;
      nomByMonth.set(key, (nomByMonth.get(key) ?? 0) + 1);
    }
    const recognition = months.map((month) => ({
      month,
      achievements: achByMonth.get(month) ?? 0,
      nominations: nomByMonth.get(month) ?? 0,
    }));
    const recognitionSeries = recognition.some((r) => r.achievements > 0 || r.nominations > 0)
      ? recognition
      : [];

    return {
      openCycle,
      evaluationsTotal: evalCount ?? 0,
      evaluationsDraft: draftCount ?? 0,
      evaluationsFinalized: finalizedCount ?? 0,
      achievements: achievementCount ?? 0,
      nominationsShortlisted: nominationCount ?? 0,
      kraTemplates: kraTemplateCount ?? 0,
      kpiTemplates: kpiTemplateCount ?? 0,
      avgScore,
      charts: {
        evaluationsByStatus,
        evaluationsByRating,
        scoreTrend,
        avgByDepartment,
        recognition: recognitionSeries,
      } satisfies PerformanceDashboardCharts,
    };
  },
  { auth: { capability: "performance.view" } },
);

export const listKraTemplates = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("kra_templates")
      .select("id, code, name, description, job_role_key, department, active")
      .order("name");
    if (error) throw error;
    const ids = (data ?? []).map((t) => t.id);
    const { data: items } = ids.length
      ? await context.supabase
          .from("kra_template_items")
          .select("id, template_id, code, title, description, weight_pct, sort_order")
          .in("template_id", ids)
          .order("sort_order")
      : { data: [] };
    const byTemplate = new Map<
      string,
      Array<{
        id: string;
        template_id: string;
        code: string;
        title: string;
        description: string | null;
        weight_pct: number;
        sort_order: number;
      }>
    >();
    for (const item of items ?? []) {
      const list = byTemplate.get(item.template_id) ?? [];
      list.push(item);
      byTemplate.set(item.template_id, list);
    }
    return (data ?? []).map((t) => ({
      ...t,
      items: byTemplate.get(t.id) ?? [],
      weightTotal: (byTemplate.get(t.id) ?? []).reduce((s, i) => s + Number(i.weight_pct), 0),
    }));
  },
  { auth: { capability: "performance.view" } },
);

export const upsertKraTemplate = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    code: z.string().min(2).max(80),
    name: z.string().min(2).max(160),
    description: z.string().max(500).nullable().optional(),
    jobRoleKey: z.string().max(80).nullable().optional(),
    department: z.string().max(80).nullable().optional(),
    active: z.boolean().optional(),
    items: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          code: z.string().min(1).max(80),
          title: z.string().min(1).max(200),
          description: z.string().max(500).nullable().optional(),
          weightPct: z.number().min(0).max(100),
          sortOrder: z.number().int().optional(),
        }),
      )
      .optional(),
  }),
  async (data, context) => {
    if (data.items && !weightsSumTo100(data.items.map((i) => i.weightPct))) {
      throw new Error("KRA item weights must total 100%");
    }

    let templateId = data.id;
    if (templateId) {
      const { error } = await context.supabase
        .from("kra_templates")
        .update({
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          job_role_key: data.jobRoleKey ?? null,
          department: data.department ?? null,
          active: data.active ?? true,
        })
        .eq("id", templateId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("kra_templates")
        .insert({
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          job_role_key: data.jobRoleKey ?? null,
          department: data.department ?? null,
          active: data.active ?? true,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      templateId = inserted.id;
    }

    if (data.items) {
      await context.supabase.from("kra_template_items").delete().eq("template_id", templateId);
      if (data.items.length) {
        const { error: itemErr } = await context.supabase.from("kra_template_items").insert(
          data.items.map((item, idx) => ({
            template_id: templateId,
            code: item.code,
            title: item.title,
            description: item.description ?? null,
            weight_pct: item.weightPct,
            sort_order: item.sortOrder ?? idx + 1,
          })),
        );
        if (itemErr) throw itemErr;
      }
    }

    await writePerfAudit(context, {
      action: data.id ? "kra_template.update" : "kra_template.create",
      entityType: "kra_templates",
      entityId: templateId,
      after: data,
    });

    return { id: templateId };
  },
  { auth: { capability: "performance.manage_templates" } },
);

export const listPerformanceKpiTemplates = createAuthenticatedActionNoInput(
  async (context) => {
    const { data, error } = await context.supabase
      .from("kpi_templates")
      .select("id, code, name, description, target_role, job_role_key, department, active, weight_total_pct")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    const ids = (data ?? []).map((t) => t.id);
    const { data: items } = ids.length
      ? await context.supabase
          .from("kpi_template_items")
          .select(
            "id, template_id, code, label, description, weight, higher_is_better, target_value, unit, max_cap_pct, data_source, auto_query_key, sort_order",
          )
          .in("template_id", ids)
          .order("sort_order")
      : { data: [] };
    const byTemplate = new Map<
      string,
      Array<{
        id: string;
        template_id: string;
        code: string;
        label: string;
        description: string | null;
        weight: number;
        higher_is_better: boolean;
        target_value: number | null;
        unit: string | null;
        max_cap_pct: number;
        data_source: string;
        auto_query_key: string | null;
        sort_order: number;
      }>
    >();
    for (const item of items ?? []) {
      const list = byTemplate.get(item.template_id) ?? [];
      list.push(item);
      byTemplate.set(item.template_id, list);
    }
    return (data ?? []).map((t) => {
      const tItems = byTemplate.get(t.id) ?? [];
      return {
        ...t,
        items: tItems,
        weightTotal: tItems.reduce((s, i) => s + Number(i.weight), 0),
        weightsValid: weightsSumTo100(tItems.map((i) => Number(i.weight))),
      };
    });
  },
  { auth: { capability: "performance.view" } },
);

export const upsertPerformanceKpiTemplate = createAuthenticatedAction(
  z.object({
    id: z.string().uuid().optional(),
    code: z.string().min(2).max(80),
    name: z.string().min(2).max(160),
    description: z.string().max(500).nullable().optional(),
    jobRoleKey: z.string().max(80).nullable().optional(),
    department: z.string().max(80).nullable().optional(),
    active: z.boolean().optional(),
    items: z
      .array(
        z.object({
          code: z.string().min(1).max(80),
          label: z.string().min(1).max(200),
          description: z.string().max(500).nullable().optional(),
          weight: z.number().min(0).max(100),
          higherIsBetter: z.boolean().optional(),
          targetValue: z.number().nullable().optional(),
          unit: z.string().max(40).nullable().optional(),
          maxCapPct: z.number().min(100).max(200).optional(),
          dataSource: z.enum(["manual", "auto"]).optional(),
          autoQueryKey: z.string().max(80).nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      )
      .optional(),
  }),
  async (data, context) => {
    if (data.items && !weightsSumTo100(data.items.map((i) => i.weight))) {
      throw new Error("KPI item weights must total 100%");
    }

    let templateId = data.id;
    if (templateId) {
      const { error } = await context.supabase
        .from("kpi_templates")
        .update({
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          job_role_key: data.jobRoleKey ?? null,
          department: data.department ?? null,
          active: data.active ?? true,
          weight_total_pct: 100,
        })
        .eq("id", templateId);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await context.supabase
        .from("kpi_templates")
        .insert({
          code: data.code,
          name: data.name,
          description: data.description ?? null,
          job_role_key: data.jobRoleKey ?? null,
          department: data.department ?? null,
          active: data.active ?? true,
          weight_total_pct: 100,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw error;
      templateId = inserted.id;
    }

    if (data.items) {
      await context.supabase.from("kpi_template_items").delete().eq("template_id", templateId);
      if (data.items.length) {
        const { error: itemErr } = await context.supabase.from("kpi_template_items").insert(
          data.items.map((item, idx) => ({
            template_id: templateId,
            code: item.code,
            label: item.label,
            description: item.description ?? null,
            weight: item.weight,
            higher_is_better: item.higherIsBetter ?? true,
            target_value: item.targetValue ?? null,
            unit: item.unit ?? null,
            max_cap_pct: item.maxCapPct ?? 120,
            data_source: item.dataSource ?? "manual",
            auto_query_key: item.autoQueryKey ?? null,
            sort_order: item.sortOrder ?? idx + 1,
          })),
        );
        if (itemErr) throw itemErr;
      }
    }

    await writePerfAudit(context, {
      action: data.id ? "kpi_template.update" : "kpi_template.create",
      entityType: "kpi_templates",
      entityId: templateId,
      after: data,
    });

    return { id: templateId };
  },
  { auth: { capability: "performance.manage_templates" } },
);

export const assignEmployeeScorecard = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    cycleId: z.string().uuid(),
    kraTemplateId: z.string().uuid().optional(),
    kpiTemplateId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, full_name, location_id, job_title")
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .single();
    if (staffErr) throw staffErr;

    let kraCount = 0;
    let kpiCount = 0;

    if (data.kraTemplateId) {
      const { data: kraItems, error } = await context.supabase
        .from("kra_template_items")
        .select("id, title, description, weight_pct")
        .eq("template_id", data.kraTemplateId)
        .order("sort_order");
      if (error) throw error;

      await context.supabase
        .from("employee_kras")
        .delete()
        .eq("staff_id", data.staffId)
        .eq("cycle_id", data.cycleId);

      if (kraItems?.length) {
        const { error: insErr } = await context.supabase.from("employee_kras").insert(
          kraItems.map((item) => ({
            staff_id: data.staffId,
            cycle_id: data.cycleId,
            kra_template_item_id: item.id,
            title: item.title,
            description: item.description,
            weight_pct: item.weight_pct,
            assigned_by: context.userId,
          })),
        );
        if (insErr) throw insErr;
        kraCount = kraItems.length;
      }
    }

    if (data.kpiTemplateId) {
      const { data: kpiItems, error } = await context.supabase
        .from("kpi_template_items")
        .select(
          "id, code, label, weight, target_value, unit, higher_is_better, max_cap_pct, data_source, auto_query_key",
        )
        .eq("template_id", data.kpiTemplateId)
        .order("sort_order");
      if (error) throw error;

      await context.supabase
        .from("employee_kpis")
        .delete()
        .eq("staff_id", data.staffId)
        .eq("cycle_id", data.cycleId);

      if (kpiItems?.length) {
        const { error: insErr } = await context.supabase.from("employee_kpis").insert(
          kpiItems.map((item) => ({
            staff_id: data.staffId,
            cycle_id: data.cycleId,
            kpi_template_item_id: item.id,
            code: item.code,
            label: item.label,
            weight_pct: item.weight,
            target_value: item.target_value,
            unit: item.unit,
            higher_is_better: item.higher_is_better,
            max_cap_pct: item.max_cap_pct ?? 120,
            data_source: item.data_source ?? "manual",
            auto_query_key: item.auto_query_key,
            assigned_by: context.userId,
          })),
        );
        if (insErr) throw insErr;
        kpiCount = kpiItems.length;

        // Ensure legacy kpi_assignments row exists for engine compatibility
        const { data: existingAssign } = await context.supabase
          .from("kpi_assignments")
          .select("id")
          .eq("template_id", data.kpiTemplateId)
          .eq("staff_id", data.staffId)
          .eq("active", true)
          .maybeSingle();
        if (!existingAssign) {
          await context.supabase.from("kpi_assignments").insert({
            template_id: data.kpiTemplateId,
            staff_id: data.staffId,
            location_id: staff.location_id,
            active: true,
          });
        }
      }
    }

    // Ensure evaluation shell exists
    const { data: existingEval } = await context.supabase
      .from("employee_evaluations")
      .select("id")
      .eq("staff_id", data.staffId)
      .eq("cycle_id", data.cycleId)
      .maybeSingle();
    let evaluationId = existingEval?.id ?? null;
    if (!evaluationId) {
      const { data: inserted, error: evalErr } = await context.supabase
        .from("employee_evaluations")
        .insert({
          staff_id: data.staffId,
          cycle_id: data.cycleId,
          location_id: staff.location_id,
          status: "draft",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (evalErr) throw evalErr;
      evaluationId = inserted.id;
    }

    if (evaluationId && kpiCount > 0) {
      await refreshAutoKpiActualsInternal(context, evaluationId);
      await recalculateEvaluationInternal(context, evaluationId);
    }

    await writePerfAudit(context, {
      action: "assignment.create",
      entityType: "employee_scorecard",
      staffId: data.staffId,
      locationId: staff.location_id,
      after: { ...data, kraCount, kpiCount },
    });

    return { kraCount, kpiCount, staffName: staff.full_name };
  },
  { auth: { capability: "performance.assign" } },
);

export const listAssignments = createAuthenticatedAction(
  z.object({ cycleId: z.string().uuid().optional() }),
  async (data, context) => {
    let cycleId = data.cycleId;
    if (!cycleId) {
      const { data: open } = await context.supabase
        .from("performance_cycles")
        .select("id")
        .eq("status", "open")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      cycleId = open?.id;
    }
    if (!cycleId) return [];

    const { data: kpis, error } = await context.supabase
      .from("employee_kpis")
      .select("id, staff_id, cycle_id, code, label, weight_pct, status")
      .eq("cycle_id", cycleId);
    if (error) throw error;

    const staffIds = [...new Set((kpis ?? []).map((k) => k.staff_id))];
    if (!staffIds.length) return [];

    const [{ data: staff }, { data: kras }, { data: evals }] = await Promise.all([
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code, job_title, location_id")
        .in("id", staffIds),
      context.supabase
        .from("employee_kras")
        .select("staff_id")
        .eq("cycle_id", cycleId)
        .in("staff_id", staffIds),
      context.supabase
        .from("employee_evaluations")
        .select("id, staff_id, status, total_score, rating_band")
        .eq("cycle_id", cycleId)
        .in("staff_id", staffIds),
    ]);

    const kraCount = new Map<string, number>();
    for (const row of kras ?? []) {
      kraCount.set(row.staff_id, (kraCount.get(row.staff_id) ?? 0) + 1);
    }
    const kpiCount = new Map<string, number>();
    for (const row of kpis ?? []) {
      kpiCount.set(row.staff_id, (kpiCount.get(row.staff_id) ?? 0) + 1);
    }
    const evalMap = new Map((evals ?? []).map((e) => [e.staff_id, e]));
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));

    return staffIds.map((id) => {
      const s = staffMap.get(id);
      const ev = evalMap.get(id);
      return {
        staffId: id,
        cycleId,
        fullName: s?.full_name ?? "—",
        employeeCode: s?.employee_code ?? "—",
        jobTitle: s?.job_title ?? null,
        locationId: s?.location_id ?? null,
        kraCount: kraCount.get(id) ?? 0,
        kpiCount: kpiCount.get(id) ?? 0,
        evaluationId: ev?.id ?? null,
        evaluationStatus: ev?.status ?? null,
        totalScore: ev?.total_score ?? null,
        ratingBand: ev?.rating_band ?? null,
      };
    });
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);

export const listEvaluations = createAuthenticatedAction(
  z.object({
    cycleId: z.string().uuid().optional(),
    status: z.string().optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("employee_evaluations")
      .select(
        "id, staff_id, cycle_id, location_id, status, kra_score, kpi_score, total_score, rating_band, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.cycleId) q = q.eq("cycle_id", data.cycleId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return [];

    const staffIds = [...new Set(rows.map((r) => r.staff_id))];
    const cycleIds = [...new Set(rows.map((r) => r.cycle_id))];
    const [{ data: staff }, { data: cycles }] = await Promise.all([
      context.supabase.from("staff").select("id, full_name, employee_code, job_title").in("id", staffIds),
      context.supabase.from("performance_cycles").select("id, name, code").in("id", cycleIds),
    ]);
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
    const cycleMap = new Map((cycles ?? []).map((c) => [c.id, c]));

    return rows.map((r) => ({
      ...r,
      staffName: staffMap.get(r.staff_id)?.full_name ?? "—",
      employeeCode: staffMap.get(r.staff_id)?.employee_code ?? "—",
      jobTitle: staffMap.get(r.staff_id)?.job_title ?? null,
      cycleName: cycleMap.get(r.cycle_id)?.name ?? "—",
    }));
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);

export const getEvaluation = createAuthenticatedAction(
  z.object({ id: z.string().uuid() }),
  async (data, context) => {
    const { data: evaluation, error } = await context.supabase
      .from("employee_evaluations")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const [{ data: staff }, { data: cycle }, { data: kras }, { data: kpis }, { data: reviews }] =
      await Promise.all([
        context.supabase
          .from("staff")
          .select("id, full_name, employee_code, job_title, department, location_id, status")
          .eq("id", evaluation.staff_id)
          .single(),
        context.supabase
          .from("performance_cycles")
          .select("id, code, name, period_start, period_end, status")
          .eq("id", evaluation.cycle_id)
          .single(),
        context.supabase
          .from("employee_kras")
          .select("id, title, description, weight_pct, status, target_text")
          .eq("staff_id", evaluation.staff_id)
          .eq("cycle_id", evaluation.cycle_id),
        context.supabase
          .from("employee_kpis")
          .select(
            "id, code, label, weight_pct, target_value, unit, higher_is_better, max_cap_pct, data_source, auto_query_key, status",
          )
          .eq("staff_id", evaluation.staff_id)
          .eq("cycle_id", evaluation.cycle_id),
        context.supabase
          .from("evaluation_reviews")
          .select("id, from_status, to_status, comments, created_at, reviewer_id")
          .eq("evaluation_id", data.id)
          .order("created_at", { ascending: false }),
      ]);

    const kpiIds = (kpis ?? []).map((k) => k.id);
    const { data: actuals } = kpiIds.length
      ? await context.supabase
          .from("kpi_actuals")
          .select("id, employee_kpi_id, actual_value, normalized_score, weighted_score, source, notes")
          .in("employee_kpi_id", kpiIds)
      : { data: [] };

    return {
      evaluation,
      staff,
      cycle,
      kras: kras ?? [],
      kpis: kpis ?? [],
      actuals: actuals ?? [],
      reviews: reviews ?? [],
      allowedNext: EVAL_TRANSITIONS[evaluation.status] ?? [],
    };
  },
  { auth: { capability: "performance.view" } },
);

export const saveKpiActual = createAuthenticatedAction(
  z.object({
    employeeKpiId: z.string().uuid(),
    actualValue: z.number(),
    periodStart: z.string(),
    periodEnd: z.string(),
    notes: z.string().max(500).nullable().optional(),
  }),
  async (data, context) => {
    const { data: kpi, error } = await context.supabase
      .from("employee_kpis")
      .select("id, target_value, higher_is_better, max_cap_pct, weight_pct, staff_id")
      .eq("id", data.employeeKpiId)
      .single();
    if (error) throw error;

    const target = Number(kpi.target_value ?? 0);
    const normalized = normalizeScore({
      actual: data.actualValue,
      target,
      higherIsBetter: kpi.higher_is_better ?? true,
      maxCapPct: Number(kpi.max_cap_pct ?? 120),
    });
    const weighted = weightedScore(normalized, Number(kpi.weight_pct));

    const { data: upserted, error: upErr } = await context.supabase
      .from("kpi_actuals")
      .upsert(
        {
          employee_kpi_id: data.employeeKpiId,
          period_start: data.periodStart,
          period_end: data.periodEnd,
          actual_value: data.actualValue,
          normalized_score: normalized,
          weighted_score: weighted,
          source: "manual",
          notes: data.notes ?? null,
          entered_by: context.userId,
        },
        { onConflict: "employee_kpi_id,period_start,period_end" },
      )
      .select("id")
      .single();
    if (upErr) throw upErr;

    await writePerfAudit(context, {
      action: "kpi_actual.save",
      entityType: "kpi_actuals",
      entityId: upserted.id,
      staffId: kpi.staff_id,
      after: { ...data, normalized, weighted },
    });

    return { id: upserted.id, normalized, weighted };
  },
  { auth: { capability: "performance.evaluate" } },
);

type AutoRefreshResult = {
  written: number;
  skipped: number;
  nulls: number;
};

async function refreshAutoKpiActualsInternal(
  context: AuthContext,
  evaluationId: string,
): Promise<AutoRefreshResult> {
  const { data: evaluation, error } = await context.supabase
    .from("employee_evaluations")
    .select("id, staff_id, cycle_id, location_id")
    .eq("id", evaluationId)
    .single();
  if (error) throw error;

  const [{ data: cycle }, { data: staff }, { data: kpis }] = await Promise.all([
    context.supabase
      .from("performance_cycles")
      .select("id, period_start, period_end")
      .eq("id", evaluation.cycle_id)
      .single(),
    context.supabase
      .from("staff")
      .select("id, location_id, user_id")
      .eq("id", evaluation.staff_id)
      .single(),
    context.supabase
      .from("employee_kpis")
      .select(
        "id, data_source, auto_query_key, target_value, higher_is_better, max_cap_pct, weight_pct",
      )
      .eq("staff_id", evaluation.staff_id)
      .eq("cycle_id", evaluation.cycle_id)
      .eq("status", "active"),
  ]);
  if (!cycle) throw new Error("Performance cycle not found");
  if (!staff) throw new Error("Staff not found");

  const autoKpis = (kpis ?? []).filter((k) => k.auto_query_key || k.data_source === "auto");
  const result: AutoRefreshResult = { written: 0, skipped: 0, nulls: 0 };
  if (!autoKpis.length) return result;

  const { data: existing } = await context.supabase
    .from("kpi_actuals")
    .select("id, employee_kpi_id, source")
    .in(
      "employee_kpi_id",
      autoKpis.map((k) => k.id),
    )
    .eq("period_start", cycle.period_start)
    .eq("period_end", cycle.period_end);
  const existingByKpi = new Map((existing ?? []).map((a) => [a.employee_kpi_id, a]));

  const scope = {
    staffId: staff.id,
    locationId: evaluation.location_id ?? staff.location_id,
    userId: staff.user_id,
    periodStart: cycle.period_start,
    periodEnd: cycle.period_end,
  };

  for (const kpi of autoKpis) {
    const prior = existingByKpi.get(kpi.id);
    if (!shouldWriteAutoActual(kpi, prior?.source)) {
      result.skipped += 1;
      continue;
    }
    if (!kpi.auto_query_key) {
      result.skipped += 1;
      continue;
    }

    const pulled = await resolveAutoKpiActual(context.supabase, kpi.auto_query_key, scope);
    const actual = pulled.actual;
    const target = Number(kpi.target_value ?? 0);
    const normalized =
      actual == null
        ? null
        : normalizeScore({
            actual,
            target,
            higherIsBetter: kpi.higher_is_better ?? true,
            maxCapPct: Number(kpi.max_cap_pct ?? 120),
          });
    const weighted =
      normalized == null ? null : weightedScore(normalized, Number(kpi.weight_pct));

    const { error: upErr } = await context.supabase.from("kpi_actuals").upsert(
      {
        employee_kpi_id: kpi.id,
        period_start: cycle.period_start,
        period_end: cycle.period_end,
        actual_value: actual,
        normalized_score: normalized == null ? null : Math.round(normalized * 100) / 100,
        weighted_score: weighted == null ? null : Math.round(weighted * 100) / 100,
        source: "auto",
        notes: pulled.note,
        entered_by: context.userId,
      },
      { onConflict: "employee_kpi_id,period_start,period_end" },
    );
    if (upErr) throw upErr;
    if (actual == null) result.nulls += 1;
    else result.written += 1;
  }

  await writePerfAudit(context, {
    action: "kpi_actual.auto_refresh",
    entityType: "employee_evaluations",
    entityId: evaluationId,
    staffId: staff.id,
    locationId: scope.locationId,
    after: result,
  });

  return result;
}

async function recalculateEvaluationInternal(context: AuthContext, evaluationId: string) {
  const { data: evaluation, error } = await context.supabase
    .from("employee_evaluations")
    .select("id, staff_id, cycle_id, kra_score")
    .eq("id", evaluationId)
    .single();
  if (error) throw error;

  const { data: kpis } = await context.supabase
    .from("employee_kpis")
    .select("id, weight_pct")
    .eq("staff_id", evaluation.staff_id)
    .eq("cycle_id", evaluation.cycle_id)
    .eq("status", "active");

  const kpiIds = (kpis ?? []).map((k) => k.id);
  const { data: actuals } = kpiIds.length
    ? await context.supabase
        .from("kpi_actuals")
        .select("employee_kpi_id, actual_value, normalized_score, weighted_score")
        .in("employee_kpi_id", kpiIds)
    : { data: [] };

  const latestByKpi = new Map<
    string,
    { actual_value: number | null; normalized_score: number | null; weighted_score: number | null }
  >();
  for (const a of actuals ?? []) {
    latestByKpi.set(a.employee_kpi_id, a);
  }

  // Null actuals are omitted so drafts do not look perfect (and do not look like a zeroed scorecard).
  const items = (kpis ?? [])
    .map((k) => {
      const row = latestByKpi.get(k.id);
      if (row?.actual_value == null || row.normalized_score == null) return null;
      return { normalizedScore: Number(row.normalized_score), weightPct: Number(k.weight_pct) };
    })
    .filter((item): item is { normalizedScore: number; weightPct: number } => item != null);
  const kpiScore = sumWeightedScores(items);

  // KRAs stay manual — keep an existing kra_score; do not invent 100%.
  const kraScore = evaluation.kra_score != null ? Number(evaluation.kra_score) : null;
  const total = kraScore != null ? blendEvaluationScore(kraScore, kpiScore) : kpiScore;
  const band = ratingBandForScore(total);

  const { error: updErr } = await context.supabase
    .from("employee_evaluations")
    .update({
      kra_score: kraScore == null ? null : Math.round(kraScore * 100) / 100,
      kpi_score: Math.round(kpiScore * 100) / 100,
      total_score: Math.round(total * 100) / 100,
      rating_band: band,
    })
    .eq("id", evaluationId);
  if (updErr) throw updErr;

  return { kraScore, kpiScore, total, ratingBand: band };
}

export const refreshAutoKpiActuals = createAuthenticatedAction(
  z.object({ evaluationId: z.string().uuid() }),
  async (data, context) => {
    const pull = await refreshAutoKpiActualsInternal(context, data.evaluationId);
    const scores = await recalculateEvaluationInternal(context, data.evaluationId);
    return { ...scores, autoFilled: pull.written, autoSkipped: pull.skipped, autoNull: pull.nulls };
  },
  { auth: { capability: "performance.evaluate" } },
);

export const recalculateEvaluation = createAuthenticatedAction(
  z.object({ evaluationId: z.string().uuid() }),
  async (data, context) => {
    const pull = await refreshAutoKpiActualsInternal(context, data.evaluationId);
    const scores = await recalculateEvaluationInternal(context, data.evaluationId);
    return { ...scores, autoFilled: pull.written, autoSkipped: pull.skipped, autoNull: pull.nulls };
  },
  { auth: { capability: "performance.evaluate" } },
);

export const transitionEvaluation = createAuthenticatedAction(
  z.object({
    evaluationId: z.string().uuid(),
    toStatus: z.enum([
      "draft",
      "supervisor_review",
      "manager_review",
      "employee_ack",
      "finalized",
      "cancelled",
    ]),
    comments: z.string().max(2000).nullable().optional(),
  }),
  async (data, context) => {
    const { data: evaluation, error } = await context.supabase
      .from("employee_evaluations")
      .select("id, status, staff_id, location_id")
      .eq("id", data.evaluationId)
      .single();
    if (error) throw error;

    const allowed = EVAL_TRANSITIONS[evaluation.status] ?? [];
    if (!allowed.includes(data.toStatus)) {
      throw new Error(`Cannot move evaluation from ${evaluation.status} to ${data.toStatus}`);
    }

    if (evaluation.status === "draft" || data.toStatus === "finalized") {
      await refreshAutoKpiActualsInternal(context, data.evaluationId);
      await recalculateEvaluationInternal(context, data.evaluationId);
    }

    const patch: {
      status: typeof data.toStatus;
      finalized_at?: string;
      supervisor_comments?: string;
      manager_comments?: string;
      employee_comments?: string;
    } = { status: data.toStatus };
    if (data.toStatus === "finalized") patch.finalized_at = new Date().toISOString();
    if (data.comments) {
      if (data.toStatus === "manager_review" || evaluation.status === "supervisor_review") {
        patch.supervisor_comments = data.comments;
      } else if (data.toStatus === "employee_ack" || evaluation.status === "manager_review") {
        patch.manager_comments = data.comments;
      } else if (data.toStatus === "finalized" || evaluation.status === "employee_ack") {
        patch.employee_comments = data.comments;
      }
    }

    const { error: updErr } = await context.supabase
      .from("employee_evaluations")
      .update(patch)
      .eq("id", data.evaluationId);
    if (updErr) throw updErr;

    await context.supabase.from("evaluation_reviews").insert({
      evaluation_id: data.evaluationId,
      from_status: evaluation.status,
      to_status: data.toStatus,
      reviewer_id: context.userId,
      comments: data.comments ?? null,
    });

    await writePerfAudit(context, {
      action: "evaluation.transition",
      entityType: "employee_evaluations",
      entityId: data.evaluationId,
      staffId: evaluation.staff_id,
      locationId: evaluation.location_id,
      before: { status: evaluation.status },
      after: { status: data.toStatus },
    });

    return { ok: true as const, status: data.toStatus };
  },
  { auth: { capability: "performance.evaluate" } },
);

export const getEmployeePerformanceProfile = createAuthenticatedAction(
  z.object({ staffId: z.string().uuid(), cycleId: z.string().uuid().optional() }),
  async (data, context) => {
    const { data: staff, error } = await context.supabase
      .from("staff")
      .select(
        "id, full_name, employee_code, job_title, department, location_id, status, hire_date, email, phone",
      )
      .eq("id", data.staffId)
      .is("deleted_at", null)
      .single();
    if (error) throw error;

    let cycleId = data.cycleId;
    if (!cycleId) {
      const { data: open } = await context.supabase
        .from("performance_cycles")
        .select("id")
        .eq("status", "open")
        .order("period_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      cycleId = open?.id;
    }

    const [{ data: kras }, { data: kpis }, { data: evaluation }, { data: achievements }, { data: awards }] =
      await Promise.all([
        cycleId
          ? context.supabase
              .from("employee_kras")
              .select("id, title, weight_pct, status, description")
              .eq("staff_id", data.staffId)
              .eq("cycle_id", cycleId)
          : Promise.resolve({ data: [] }),
        cycleId
          ? context.supabase
              .from("employee_kpis")
              .select("id, code, label, weight_pct, target_value, unit, status, data_source")
              .eq("staff_id", data.staffId)
              .eq("cycle_id", cycleId)
          : Promise.resolve({ data: [] }),
        cycleId
          ? context.supabase
              .from("employee_evaluations")
              .select("id, status, kra_score, kpi_score, total_score, rating_band")
              .eq("staff_id", data.staffId)
              .eq("cycle_id", cycleId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        context.supabase
          .from("employee_achievements")
          .select("id, title, description, achieved_on, category, points")
          .eq("staff_id", data.staffId)
          .order("achieved_on", { ascending: false })
          .limit(20),
        context.supabase
          .from("employee_awards")
          .select("id, title, award_type, award_month, citation")
          .eq("staff_id", data.staffId)
          .order("award_month", { ascending: false })
          .limit(10),
      ]);

    return {
      staff,
      cycleId: cycleId ?? null,
      kras: kras ?? [],
      kpis: kpis ?? [],
      evaluation: evaluation ?? null,
      achievements: achievements ?? [],
      awards: awards ?? [],
    };
  },
  { auth: { capability: "performance.view" } },
);

export const listAchievements = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    let q = context.supabase
      .from("employee_achievements")
      .select("id, staff_id, location_id, title, description, achieved_on, category, points, created_at")
      .order("achieved_on", { ascending: false })
      .limit(100);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return [];
    const staffIds = [...new Set(rows.map((r) => r.staff_id))];
    const { data: staff } = await context.supabase
      .from("staff")
      .select("id, full_name, employee_code")
      .in("id", staffIds);
    const map = new Map((staff ?? []).map((s) => [s.id, s]));
    return rows.map((r) => ({
      ...r,
      staffName: map.get(r.staff_id)?.full_name ?? "—",
      employeeCode: map.get(r.staff_id)?.employee_code ?? "—",
    }));
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);

export const createAchievement = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().max(1000).nullable().optional(),
    achievedOn: z.string(),
    category: z.string().max(80).optional(),
    points: z.number().min(0).max(1000).optional(),
  }),
  async (data, context) => {
    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, location_id")
      .eq("id", data.staffId)
      .single();
    if (staffErr) throw staffErr;

    const { data: row, error } = await context.supabase
      .from("employee_achievements")
      .insert({
        staff_id: data.staffId,
        location_id: staff.location_id,
        title: data.title,
        description: data.description ?? null,
        achieved_on: data.achievedOn,
        category: data.category ?? "general",
        points: data.points ?? 0,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await writePerfAudit(context, {
      action: "achievement.create",
      entityType: "employee_achievements",
      entityId: row.id,
      staffId: data.staffId,
      locationId: staff.location_id,
      after: data,
    });

    return { id: row.id };
  },
  { auth: { capability: "performance.evaluate" } },
);

export const listNominations = createAuthenticatedAction(
  z.object({
    month: z.string().optional(),
  }),
  async (data, context) => {
    let q = context.supabase
      .from("employee_nominations")
      .select(
        "id, staff_id, location_id, award_type, nomination_month, rationale, status, created_at, reviewed_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.month) q = q.eq("nomination_month", data.month);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows?.length) return [];

    const staffIds = [...new Set(rows.map((r) => r.staff_id))];
    const [{ data: staff }, { data: evals }, { data: pips }, { data: awards }] = await Promise.all([
      context.supabase.from("staff").select("id, full_name, employee_code, location_id").in("id", staffIds),
      context.supabase
        .from("employee_evaluations")
        .select("staff_id, total_score, status")
        .in("staff_id", staffIds)
        .eq("status", "finalized")
        .order("finalized_at", { ascending: false }),
      context.supabase
        .from("performance_improvement_plans")
        .select("staff_id")
        .in("staff_id", staffIds)
        .eq("status", "active"),
      context.supabase
        .from("employee_awards")
        .select("staff_id, award_month")
        .in("staff_id", staffIds)
        .eq("award_type", "employee_of_month")
        .order("award_month", { ascending: false }),
    ]);

    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
    const scoreMap = new Map<string, number>();
    for (const e of evals ?? []) {
      if (!scoreMap.has(e.staff_id) && e.total_score != null) scoreMap.set(e.staff_id, Number(e.total_score));
    }
    const openPip = new Set((pips ?? []).map((p) => p.staff_id));
    const winsByStaff = new Map<string, string[]>();
    for (const a of awards ?? []) {
      const list = winsByStaff.get(a.staff_id) ?? [];
      list.push(a.award_month);
      winsByStaff.set(a.staff_id, list);
    }

    const nominationDates = rows.map((r) => r.nomination_month).filter(Boolean).sort();
    const fromDate = nominationDates[0] ? `${nominationDates[0].slice(0, 7)}-01` : null;
    const lastNom = nominationDates[nominationDates.length - 1];
    const toDate = lastNom
      ? new Date(Date.UTC(Number(lastNom.slice(0, 4)), Number(lastNom.slice(5, 7)), 0))
          .toISOString()
          .slice(0, 10)
      : null;
    const attendanceByStaff =
      fromDate && toDate
        ? await attendancePctByStaffMonth(context.supabase, staffIds, fromDate, toDate)
        : new Map<string, Map<string, number>>();

    return rows.map((r) => {
      const month = yearMonth(r.nomination_month);
      const attendancePct = month ? (attendanceByStaff.get(r.staff_id)?.get(month) ?? null) : null;
      const eligibility = checkEomEligibility({
        attendancePct,
        evaluationScore: scoreMap.get(r.staff_id) ?? null,
        hasOpenPip: openPip.has(r.staff_id),
        consecutiveWins: (winsByStaff.get(r.staff_id) ?? []).length >= 2 ? 2 : (winsByStaff.get(r.staff_id) ?? []).length,
      });
      return {
        ...r,
        staffName: staffMap.get(r.staff_id)?.full_name ?? "—",
        employeeCode: staffMap.get(r.staff_id)?.employee_code ?? "—",
        evaluationScore: scoreMap.get(r.staff_id) ?? null,
        attendancePct,
        eligibility,
      };
    });
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);

export const createNomination = createAuthenticatedAction(
  z.object({
    staffId: z.string().uuid(),
    nominationMonth: z.string(),
    rationale: z.string().max(2000).nullable().optional(),
    cycleId: z.string().uuid().optional(),
  }),
  async (data, context) => {
    const { data: staff, error: staffErr } = await context.supabase
      .from("staff")
      .select("id, location_id")
      .eq("id", data.staffId)
      .single();
    if (staffErr) throw staffErr;

    const { data: row, error } = await context.supabase
      .from("employee_nominations")
      .insert({
        staff_id: data.staffId,
        location_id: staff.location_id,
        cycle_id: data.cycleId ?? null,
        award_type: "employee_of_month",
        nomination_month: data.nominationMonth,
        rationale: data.rationale ?? null,
        status: "shortlisted",
        nominated_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    await writePerfAudit(context, {
      action: "nomination.create",
      entityType: "employee_nominations",
      entityId: row.id,
      staffId: data.staffId,
      locationId: staff.location_id,
      after: data,
    });

    return { id: row.id };
  },
  { auth: { capability: "performance.evaluate" } },
);

export const approveNomination = createAuthenticatedAction(
  z.object({
    nominationId: z.string().uuid(),
    approve: z.boolean(),
  }),
  async (data, context) => {
    const { data: nom, error } = await context.supabase
      .from("employee_nominations")
      .select("*")
      .eq("id", data.nominationId)
      .single();
    if (error) throw error;

    const status = data.approve ? "approved" : "rejected";
    const { error: updErr } = await context.supabase
      .from("employee_nominations")
      .update({
        status,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.nominationId);
    if (updErr) throw updErr;

    if (data.approve) {
      await context.supabase.from("employee_awards").insert({
        nomination_id: nom.id,
        staff_id: nom.staff_id,
        location_id: nom.location_id,
        award_type: "employee_of_month",
        award_month: nom.nomination_month,
        title: "Employee of the Month",
        citation: nom.rationale,
        approved_by: context.userId,
      });
    }

    await writePerfAudit(context, {
      action: data.approve ? "nomination.approve" : "nomination.reject",
      entityType: "employee_nominations",
      entityId: data.nominationId,
      staffId: nom.staff_id,
      locationId: nom.location_id,
    });

    return { status };
  },
  { auth: { capability: "performance.approve_eom" } },
);

export const listStaffScoreboard = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    const { data: open } = await context.supabase
      .from("performance_cycles")
      .select("id, code, name, period_start, period_end, status")
      .eq("status", "open")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!open) return { cycle: null, rows: [] as const };

    const { data: previous } = await context.supabase
      .from("performance_cycles")
      .select("id, code, name, period_start")
      .lt("period_start", open.period_start)
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    let evalQ = context.supabase
      .from("employee_evaluations")
      .select("id, staff_id, location_id, status, total_score, rating_band")
      .eq("cycle_id", open.id);
    if (data.locationId) evalQ = evalQ.eq("location_id", data.locationId);
    const { data: evals, error } = await evalQ;
    if (error) throw error;
    if (!evals?.length) return { cycle: open, rows: [] };

    const staffIds = [...new Set(evals.map((e) => e.staff_id))];
    const [{ data: staff }, { data: prevEvals }] = await Promise.all([
      context.supabase
        .from("staff")
        .select("id, full_name, employee_code, job_title, department, location_id")
        .in("id", staffIds),
      previous
        ? context.supabase
            .from("employee_evaluations")
            .select("staff_id, total_score")
            .eq("cycle_id", previous.id)
            .in("staff_id", staffIds)
        : Promise.resolve({ data: [] as Array<{ staff_id: string; total_score: number | null }> }),
    ]);

    const locationIds = [
      ...new Set(
        (staff ?? [])
          .map((s) => s.location_id)
          .concat(evals.map((e) => e.location_id).filter((id): id is string => !!id)),
      ),
    ];
    const { data: locations } = locationIds.length
      ? await context.supabase.from("locations").select("id, name, code").in("id", locationIds)
      : { data: [] };

    const staffMap = new Map((staff ?? []).map((s) => [s.id, s]));
    const locMap = new Map((locations ?? []).map((l) => [l.id, l]));
    const prevMap = new Map(
      (prevEvals ?? [])
        .filter((e) => e.total_score != null)
        .map((e) => [e.staff_id, Number(e.total_score)]),
    );

    const rows = evals
      .map((ev) => {
        const s = staffMap.get(ev.staff_id);
        const loc = locMap.get(ev.location_id ?? s?.location_id ?? "");
        const score = ev.total_score != null ? Number(ev.total_score) : null;
        const previousScore = prevMap.get(ev.staff_id) ?? null;
        let trend: "up" | "down" | "flat" | "new" = "new";
        if (score != null && previousScore != null) {
          const delta = score - previousScore;
          trend = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
        }
        return {
          staffId: ev.staff_id,
          evaluationId: ev.id,
          fullName: s?.full_name ?? "—",
          employeeCode: s?.employee_code ?? "—",
          jobTitle: s?.job_title ?? null,
          department: s?.department ?? null,
          locationId: ev.location_id ?? s?.location_id ?? null,
          locationName: loc?.name ?? null,
          locationCode: loc?.code ?? null,
          score,
          previousScore,
          ratingBand: ev.rating_band,
          evaluationStatus: ev.status,
          trend,
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    return { cycle: open, previousCycle: previous ?? null, rows };
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);

export const listStaffForAssignment = createAuthenticatedAction(
  z.object({ locationId: z.string().uuid().nullable().optional() }),
  async (data, context) => {
    let q = context.supabase
      .from("staff")
      .select("id, full_name, employee_code, job_title, department, location_id, status")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name")
      .limit(500);
    if (data.locationId) q = q.eq("location_id", data.locationId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  },
  { defaultInput: {}, auth: { capability: "performance.view" } },
);
