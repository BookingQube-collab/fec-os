import "server-only";

import { z } from "zod";

import { completeEventAiJson } from "@/lib/events/ai-plan-draft";

const ReportBriefSchema = z.object({
  bullets: z.array(z.string()).min(1).max(12),
});

export type EventReportBriefKpi = { label: string; value: string };
export type EventReportBriefRow = Record<string, string | number | null>;
export type EventReportBriefMode = "current" | "executive";

export interface EventReportBriefContext {
  mode: EventReportBriefMode;
  report_id: string;
  report_label: string;
  locale?: "en" | "ar";
  row_count: number;
  kpis: EventReportBriefKpi[];
  columns: string[];
  rows: EventReportBriefRow[];
  portfolio?: Array<{ id: string; label: string; row_count: number }>;
}

function fmtCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function countWhere(rows: EventReportBriefRow[], key: string, pred: (v: string) => boolean): number {
  return rows.filter((row) => pred(fmtCell(row[key]).toLowerCase())).length;
}

function sumKey(rows: EventReportBriefRow[], key: string): number | null {
  const vals = rows
    .map((row) => (typeof row[key] === "number" ? row[key] : Number(row[key])))
    .filter((n): n is number => Number.isFinite(n));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

export function buildFallbackEventReportBrief(ctx: EventReportBriefContext): string[] {
  const bullets: string[] = [];
  const n = ctx.row_count;
  bullets.push(
    ctx.mode === "executive"
      ? `Executive view of the current event report filter: ${n} row${n === 1 ? "" : "s"} on ${ctx.report_label}.`
      : `${ctx.report_label}: ${n} row${n === 1 ? "" : "s"} in the current filter.`,
  );

  for (const kpi of ctx.kpis.slice(0, 4)) {
    if (kpi.label.trim()) bullets.push(`${kpi.label}: ${kpi.value}.`);
  }

  const overdue = countWhere(ctx.rows, "overdue", (v) => v === "yes" || v === "true");
  const blocked = countWhere(ctx.rows, "blocked", (v) => v === "yes" || v === "true")
    + countWhere(ctx.rows, "status", (v) => v === "blocked");
  const pending = countWhere(ctx.rows, "status", (v) => v.includes("pending") || v.includes("submitted") || v.includes("draft"));
  if (ctx.columns.includes("overdue") && overdue) bullets.push(`${overdue} row${overdue === 1 ? "" : "s"} marked overdue.`);
  if (blocked) bullets.push(`${blocked} blocked item${blocked === 1 ? "" : "s"} in this table.`);
  if (ctx.report_id.includes("pending") || ctx.report_id.includes("procurement")) {
    bullets.push(`${pending} pending / in-flight row${pending === 1 ? "" : "s"} in the table.`);
  }

  const variance = sumKey(ctx.rows, "variance") ?? sumKey(ctx.rows, "forecast_variance");
  if (variance != null) {
    bullets.push(`Table variance total: QAR ${Math.round(variance).toLocaleString("en-QA")}.`);
  }

  if (ctx.mode === "executive" && ctx.portfolio?.length) {
    const nonempty = ctx.portfolio.filter((r) => r.row_count > 0).slice(0, 4);
    if (nonempty.length) {
      bullets.push(
        `Other tabs with rows: ${nonempty.map((r) => `${r.label} (${r.row_count})`).join("; ")}.`,
      );
    }
  }

  if (n === 0) {
    return [`${ctx.report_label} has no rows for this filter. No metrics were inferred.`];
  }

  return bullets.filter(Boolean).slice(0, 8);
}

function buildPrompt(ctx: EventReportBriefContext): string {
  const lang = ctx.locale === "ar" ? "Arabic (Qatar office tone)" : "English (Qatar office tone)";
  return [
    `Write a ${ctx.mode === "executive" ? "short executive" : "report"} narrative for an FEC event PM in Qatar.`,
    `Language: ${lang}.`,
    `Report: ${ctx.report_label} (${ctx.report_id}).`,
    `Row count: ${ctx.row_count}.`,
    `KPIs already shown: ${JSON.stringify(ctx.kpis)}`,
    ctx.portfolio?.length ? `Portfolio tab counts: ${JSON.stringify(ctx.portfolio)}` : "",
    "Table rows (do not add events, PRs, or numbers that are not here):",
    JSON.stringify(ctx.rows.slice(0, 40)),
    "",
    "Return ONLY JSON: { bullets: string[] } with 4-8 bullets.",
    "Each bullet is one sentence. Quote counts and names from the rows/KPIs only.",
    "If a metric is not in the table or KPIs, omit it. Empty table → one bullet saying so.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function callEventReportAiBrief(
  ctx: EventReportBriefContext,
): Promise<{ bullets: string[]; ai_generated: boolean }> {
  const fallback = buildFallbackEventReportBrief(ctx);
  const parsed = await completeEventAiJson([
    {
      role: "system",
      content:
        "You write event report briefs for FEC venues in Qatar. Output only valid JSON. Never invent metrics, PRs, or events that are not in the supplied table.",
    },
    { role: "user", content: buildPrompt(ctx) },
  ], 0.2);

  if (!parsed) return { bullets: fallback, ai_generated: false };
  try {
    const fields = ReportBriefSchema.parse(parsed);
    const bullets = fields.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 8);
    return { bullets: bullets.length ? bullets : fallback, ai_generated: Boolean(bullets.length) };
  } catch {
    return { bullets: fallback, ai_generated: false };
  }
}
