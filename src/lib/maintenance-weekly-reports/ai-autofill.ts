import "server-only";

import { z } from "zod";

import { MAINTENANCE_TEAM_LABELS, type MaintenanceReportTeam } from "@/lib/maintenance-weekly-reports/constants";

const MAINTENANCE_REPORT_AI_MODEL = "google/gemini-3-flash-preview";

const MaintenanceReportNarrativeSchema = z.object({
  top_achievements: z.string(),
  top_challenges: z.string(),
  critical_issues: z.string(),
  support_required: z.string(),
  next_week_action_plan: z.string(),
  operational_notes: z.string(),
});

export type MaintenanceReportNarrative = z.infer<typeof MaintenanceReportNarrativeSchema>;

export interface MaintenanceReportAiContext {
  team: MaintenanceReportTeam;
  reporting_week_start: string;
  reporting_week_end: string;
  location_code: string;
  location_name: string;
  kpi_snapshot: Record<string, unknown>;
  submitted_by_name?: string | null;
}

function buildFallbackNarrative(ctx: MaintenanceReportAiContext): MaintenanceReportNarrative {
  const kpi = ctx.kpi_snapshot;
  const summary = (kpi.summary ?? {}) as Record<string, number>;
  const teamLabel = MAINTENANCE_TEAM_LABELS[ctx.team];

  if (ctx.team === "maintenance") {
    const completed = summary.completed ?? 0;
    const raised = summary.raised ?? 0;
    const sla = summary.sla_compliance_pct ?? 100;
    const overdue = summary.overdue ?? 0;
    const pmPending = summary.pm_pending ?? 0;
    const breakdowns = (kpi.major_breakdowns as Array<{ title: string; location_code: string }> | undefined) ?? [];

    return {
      top_achievements: `Completed ${completed} of ${raised} work orders at ${ctx.location_code} with ${sla}% SLA compliance.`,
      top_challenges: overdue > 0 ? `${overdue} overdue work orders require follow-up.` : "No major backlog issues this week.",
      critical_issues:
        breakdowns.length > 0
          ? breakdowns.map((b) => `${b.title} (${b.location_code})`).join("\n")
          : overdue > 0
            ? `${overdue} overdue items need escalation.`
            : "No critical breakdowns reported.",
      support_required: pmPending > 0 ? `PM backlog: ${pmPending} schedules pending at ${ctx.location_code}.` : "",
      next_week_action_plan: `Clear overdue items and complete pending PM tasks at ${ctx.location_code}.`,
      operational_notes: `${teamLabel} weekly report for ${ctx.location_name} (${ctx.reporting_week_start} to ${ctx.reporting_week_end}).`,
    };
  }

  const requestsSubmitted = (kpi.requests_submitted as number) ?? 0;
  const requestsCompleted = (kpi.requests_completed as number) ?? 0;
  const pending = (kpi.requests_pending as number) ?? 0;
  const urgent = (kpi.requests_urgent as number) ?? 0;

  return {
    top_achievements: `Fulfilled ${requestsCompleted} of ${requestsSubmitted} delivery requests at ${ctx.location_code}.`,
    top_challenges: pending > 0 ? `${pending} requests still pending fulfillment.` : "All requests processed on time.",
    critical_issues: urgent > 0 ? `${urgent} urgent requests need priority handling.` : "",
    support_required: pending > 3 ? "Additional dispatch capacity may be needed." : "",
    next_week_action_plan: `Reduce pending queue and prioritise urgent items at ${ctx.location_code}.`,
    operational_notes: `${teamLabel} weekly report for ${ctx.location_name} (${ctx.reporting_week_start} to ${ctx.reporting_week_end}).`,
  };
}

function buildUserPrompt(ctx: MaintenanceReportAiContext): string {
  return [
    `Write a concise maintenance weekly report narrative for FEC family entertainment centre operations.`,
    `Team: ${MAINTENANCE_TEAM_LABELS[ctx.team]}`,
    `Location: ${ctx.location_name} (${ctx.location_code})`,
    `Week: ${ctx.reporting_week_start} to ${ctx.reporting_week_end}`,
    ctx.submitted_by_name ? `Submitted by: ${ctx.submitted_by_name}` : "",
    `KPI snapshot JSON:\n${JSON.stringify(ctx.kpi_snapshot, null, 2)}`,
    "",
    "Return ONLY valid JSON with these string fields (use bullet points where helpful, plain professional English):",
    "top_achievements, top_challenges, critical_issues, support_required, next_week_action_plan, operational_notes",
    "Base content on the KPI data. Leave support_required empty if none needed. Be specific with numbers from KPIs.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function callMaintenanceReportAiAutofill(
  ctx: MaintenanceReportAiContext,
): Promise<{ fields: MaintenanceReportNarrative; ai_generated: boolean }> {
  const fallback = buildFallbackNarrative(ctx);
  const messages = [
    {
      role: "system" as const,
      content:
        "You are an operations reporting assistant for FEC venue maintenance and logistics teams. Output only valid JSON matching the requested schema.",
    },
    { role: "user" as const, content: buildUserPrompt(ctx) },
  ];

  const lovableKey = process.env.LOVABLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const attempts: Array<{ url: string; headers: Record<string, string>; model: string; jsonMode?: boolean }> = [];
  if (lovableKey) {
    attempts.push({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      model: MAINTENANCE_REPORT_AI_MODEL,
    });
  }
  if (openaiKey) {
    attempts.push({
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      jsonMode: true,
    });
  }

  if (!attempts.length) {
    return { fields: fallback, ai_generated: false };
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: attempt.headers,
        body: JSON.stringify({
          model: attempt.model,
          ...(attempt.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages,
          temperature: 0.35,
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content;
      if (!text) continue;
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as unknown;
      const fields = MaintenanceReportNarrativeSchema.parse(parsed);
      return { fields, ai_generated: true };
    } catch {
      /* try next provider */
    }
  }

  return { fields: fallback, ai_generated: false };
}
