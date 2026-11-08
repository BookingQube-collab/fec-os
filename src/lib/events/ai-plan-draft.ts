import "server-only";

import { z } from "zod";

import { completeJsonViaGateway } from "@/lib/ai/complete-json";
import { DEFAULT_READINESS_ITEMS } from "@/lib/events/constants";
import {
  nextActionsFromSignals,
  suggestDeliverablesForType,
  type EventPlanSignals,
} from "@/lib/events/ai-signals";
import { LIFECYCLE_PHASES, WBS_TO_PHASE, type LifecyclePhaseCode } from "@/lib/events/lifecycle";
import {
  addDaysYmd,
  mergeScopeSections,
  suggestPhaseWindows,
} from "@/lib/events/setup";
import type { EventScopeSection } from "@/lib/events/types";
import { STANDARD_WORKSTREAMS, type WorkstreamCode } from "@/lib/events/workstreams";

export type { EventPlanSignals } from "@/lib/events/ai-signals";


export const EVENT_PLAN_FOCUSES = ["all", "scope", "wbs", "schedule", "budget", "tasks", "next"] as const;
export type EventPlanFocus = (typeof EVENT_PLAN_FOCUSES)[number];

export const EventPlanTaskDraftSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
  workstream_code: z.string(),
  lifecycle_phase: z.string().optional().nullable(),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent", "critical"]).optional().nullable(),
  is_critical: z.boolean().optional().nullable(),
});

export const EventPlanBudgetLineDraftSchema = z.object({
  category_code: z.string(),
  title: z.string(),
  original_amount: z.number().or(z.string()),
  notes: z.string().optional().nullable(),
});

export const EventPlanRiskDraftSchema = z.object({
  title: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
});

export const EventPlanDraftSchema = z.object({
  scope: z
    .object({
      objectives: z.string().optional().nullable(),
      inclusions: z.string().optional().nullable(),
      exclusions: z.string().optional().nullable(),
      assumptions: z.string().optional().nullable(),
      success: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
  deliverables: z
    .array(z.object({ title: z.string(), due_date: z.string().optional().nullable() }))
    .optional()
    .nullable(),
  workstreams: z
    .array(
      z.object({
        code: z.string(),
        include: z.boolean().optional().nullable(),
      }),
    )
    .optional()
    .nullable(),
  tasks: z.array(EventPlanTaskDraftSchema).optional().nullable(),
  budget_lines: z.array(EventPlanBudgetLineDraftSchema).optional().nullable(),
  risks: z.array(EventPlanRiskDraftSchema).optional().nullable(),
  next_actions: z.array(z.string()).optional().nullable(),
  event_dates: z
    .object({
      planning_start: z.string().optional().nullable(),
      setup_start: z.string().optional().nullable(),
      setup_end: z.string().optional().nullable(),
      event_start: z.string().optional().nullable(),
      event_end: z.string().optional().nullable(),
      dismantle_start: z.string().optional().nullable(),
      dismantle_end: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export type EventPlanTaskDraft = z.infer<typeof EventPlanTaskDraftSchema>;
export type EventPlanBudgetLineDraft = z.infer<typeof EventPlanBudgetLineDraftSchema>;
export type EventPlanRiskDraft = z.infer<typeof EventPlanRiskDraftSchema>;
export type EventPlanDraft = {
  scope_sections: EventScopeSection[];
  deliverables: Array<{ title: string; due_date: string | null }>;
  included_workstreams: WorkstreamCode[];
  tasks: Array<{
    title: string;
    description: string;
    workstream_code: WorkstreamCode;
    lifecycle_phase: LifecyclePhaseCode;
    start_date: string;
    due_date: string;
    priority: "low" | "normal" | "high" | "urgent" | "critical";
    is_critical: boolean;
  }>;
  budget_lines: Array<{
    category_code: string;
    title: string;
    original_amount: number;
    notes: string;
  }>;
  risks: Array<{ title: string; severity: "low" | "medium" | "high" | "critical" }>;
  next_actions: string[];
  event_dates: {
    planning_start: string | null;
    setup_start: string | null;
    setup_end: string | null;
    event_start: string | null;
    event_end: string | null;
    dismantle_start: string | null;
    dismantle_end: string | null;
  };
};

export type EventCostCategoryOption = { id: string; code: string; label_en: string; label_ar: string };

export interface EventPlanAiDraftContext {
  notes: string;
  focus?: EventPlanFocus;
  event_name?: string | null;
  client_name?: string | null;
  venue_name?: string | null;
  location_name?: string | null;
  event_type?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  planning_start?: string | null;
  setup_start?: string | null;
  setup_end?: string | null;
  dismantle_start?: string | null;
  dismantle_end?: string | null;
  contracted_value?: number | null;
  cost_categories: EventCostCategoryOption[];
  signals?: EventPlanSignals | null;
  locale?: "en" | "ar";
}

const BUDGET_SPLITS: Array<{ codes: string[]; title: string; pct: number; notes: string }> = [
  { codes: ["production", "decor", "decoration", "materials"], title: "Production and fabrication", pct: 0.18, notes: "Estimate — adjust after quotes" },
  { codes: ["manpower", "labor"], title: "Staffing and crew", pct: 0.14, notes: "Estimate — roster still open" },
  { codes: ["logistics", "transport", "transportation", "vehicle_rental"], title: "Logistics and transport", pct: 0.1, notes: "Estimate" },
  { codes: ["branding", "printing", "marketing"], title: "Creative, branding and print", pct: 0.08, notes: "Estimate" },
  { codes: ["technology", "av", "led", "internet", "power"], title: "IT, POS and technical", pct: 0.1, notes: "Estimate" },
  { codes: ["venue"], title: "Venue / mall charges", pct: 0.08, notes: "Estimate" },
  { codes: ["permits", "government_fees", "insurance"], title: "Permits, fees and insurance", pct: 0.06, notes: "Estimate" },
  { codes: ["equipment", "equipment_rental"], title: "Equipment rental", pct: 0.08, notes: "Estimate" },
  { codes: ["catering", "fnb", "consumables"], title: "F&B and consumables", pct: 0.06, notes: "Estimate" },
  { codes: ["contingency"], title: "Contingency", pct: 0.12, notes: "Starting contingency — do not treat as committed" },
];

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isYmd(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function pickCategory(preferred: string[], available: EventCostCategoryOption[]): EventCostCategoryOption | null {
  for (const code of preferred) {
    const hit = available.find((c) => c.code === code);
    if (hit) return hit;
  }
  return available[0] ?? null;
}

function formatYmdLabel(value: string | null | undefined): string | null {
  if (!isYmd(value)) return null;
  return value;
}

function phaseWindowLabel(
  start: string | null | undefined,
  end: string | null | undefined,
  fallback: string,
): string {
  const s = formatYmdLabel(start);
  const e = formatYmdLabel(end);
  if (s && e) return s === e ? s : `${s} → ${e}`;
  if (s) return `from ${s}`;
  if (e) return `through ${e}`;
  return fallback;
}

function briefHighlights(notes: string, max = 280): string {
  const cleaned = notes.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return `${(at > 80 ? cut.slice(0, at + 1) : cut).trim()}…`;
}

function workstreamPhase(code: WorkstreamCode): LifecyclePhaseCode {
  return WBS_TO_PHASE[code] ?? "initiation";
}

function templateTasks(windows: ReturnType<typeof suggestPhaseWindows>): EventPlanDraft["tasks"] {
  const tasks: EventPlanDraft["tasks"] = [];
  for (const ws of STANDARD_WORKSTREAMS) {
    const phase = workstreamPhase(ws.code);
    const items = DEFAULT_READINESS_ITEMS.filter((item) => item.phase_code === phase).slice(0, 3);
    const window = windows[phase];
    items.forEach((item, idx) => {
      const start = idx === 0 ? window.start : addDaysYmd(window.start, Math.min(2, idx));
      tasks.push({
        title: item.title,
        description: `${ws.title_en}: ${item.title}.`,
        workstream_code: ws.code,
        lifecycle_phase: (item.phase_code as LifecyclePhaseCode) ?? phase,
        start_date: start,
        due_date: window.end < start ? start : window.end,
        priority: item.weight >= 12 ? "high" : "normal",
        is_critical: item.weight >= 12,
      });
    });
  }
  return tasks;
}

function templateScope(ctx: EventPlanAiDraftContext): EventScopeSection[] {
  const venue = ctx.venue_name || ctx.location_name || "the venue";
  const site = ctx.location_name && ctx.venue_name && ctx.location_name !== ctx.venue_name ? ctx.location_name : null;
  const name = ctx.event_name || "this event";
  const brief = ctx.notes.trim();
  const type = ctx.event_type || "FEC activation";
  const client = ctx.client_name?.trim() || null;
  const openWindow = phaseWindowLabel(ctx.event_start, ctx.event_end, "opening/closing dates TBC");
  const setupWindow = phaseWindowLabel(ctx.setup_start, ctx.setup_end, "setup dates TBC");
  const dismantleWindow = phaseWindowLabel(ctx.dismantle_start, ctx.dismantle_end, "dismantle dates TBC");
  const highlights = briefHighlights(brief);
  const siteLine = site ? ` (site: ${site})` : "";

  const objectives = [
    `Success for ${name} means a safe, guest-ready ${type} at ${venue}${siteLine} that opens and closes on ${openWindow}${client ? `, delivered for ${client}` : ""}.`,
    highlights
      ? `Guest experience should reflect the brief (without restating it verbatim): ${highlights}`
      : "Guest experience should feel intentional for the activation type—clear arrival, working attractions/zones, and staffed touchpoints throughout public hours.",
    `Ops readiness: setup complete in ${setupWindow}, live operation stable through closing, and orderly dismantle in ${dismantleWindow} with no unresolved critical HSE, permit, or staffing blockers at opening.`,
  ].join("\n\n");

  const workstreamLines = STANDARD_WORKSTREAMS.map(
    (ws) =>
      `- ${ws.title_en}: plan, coordinate, and close deliverables for this workstream across setup, live, and dismantle (owners and task detail follow in the plan).`,
  ).join("\n");

  const inclusions = [
    `FEC delivery scope for ${name} at ${venue}${siteLine}:`,
    `Setup / bump-in (${setupWindow}): site access, build/install, technical fit-out, soft checks, and pre-open readiness against the brief.`,
    `Live / public operation (${openWindow}): daily ops, staffing coverage, guest flow, attractions/zones called out in the brief, vendor coordination, HSE watch, and issue response during opening hours.`,
    `Dismantle / bump-out (${dismantleWindow}): de-install, asset recovery, venue reinstatement, and close-out handover.`,
    "Workstreams and concrete delivery responsibility:",
    workstreamLines,
  ].join("\n\n");

  const exclusions = [
    "Explicitly out of scope unless added by a written change order:",
    "- Client-side media buying, paid social, or agency retainers not assigned to FEC.",
    "- Third-party mall or landlord CAPEX / permanent works outside the temporary activation footprint.",
    "- Content, IP, or brand approvals that remain with the client or rights holder.",
    "- Permanent store operations, unrelated FEC sites, or other events on the calendar.",
    "- Any attraction, zone, or vendor not described in the brief or later added to this scope.",
  ].join("\n");

  const assumptions = [
    `Venue / landlord access for ${venue} is available for the setup window (${setupWindow}) including agreed load-in routes and storage.`,
    "Temporary power, data, and base building services required for the build are available or will be confirmed before bump-in.",
    "Permits and mall approvals needed for a public FEC activation in Qatar are identifiable during feasibility and tracked to clearance before opening.",
    "Staffing (core + temporary) can be rostered to cover public hours once headcount and roles are confirmed.",
    client
      ? `${client} will provide brief clarifications, brand/content approvals, and decision turnaround in time for setup milestones.`
      : "Client decision turnaround (content, approvals, change requests) stays aligned with setup milestones.",
    ctx.contracted_value && ctx.contracted_value > 0
      ? `Budget planning starts from the contracted envelope (QAR ${Math.round(ctx.contracted_value).toLocaleString("en-QA")}); supplier quotes will be confirmed before formal budget approval.`
      : "Contracted value and supplier quotes will be confirmed before formal budget approval.",
  ].join("\n");

  const success = [
    `Open on ${ctx.event_start || "the published opening date"} and operate through ${ctx.event_end || "the published closing date"} at ${venue}${siteLine}.`,
    `Setup complete by ${ctx.setup_end || ctx.setup_start || "the agreed setup end"} with guest-facing zones/attractions from the brief in a working, guest-ready state.`,
    "All critical permits / mall clearances resolved before public opening; no open critical HSE findings.",
    "Opening-day staffing roster filled for guest-facing and ops-critical roles with named coverage for the first public sessions.",
    `Dismantle started no earlier than closing and completed by ${ctx.dismantle_end || ctx.dismantle_start || "the agreed dismantle end"} with venue reinstatement accepted.`,
  ].join("\n");

  return mergeScopeSections([
    { key: "objectives", title: "What success looks like", body: objectives },
    { key: "inclusions", title: "In scope", body: inclusions },
    { key: "exclusions", title: "Out of scope", body: exclusions },
    { key: "assumptions", title: "Assumptions", body: assumptions },
    { key: "success", title: "Success criteria", body: success },
  ]);
}

function templateBudget(ctx: EventPlanAiDraftContext): EventPlanDraft["budget_lines"] {
  const envelope = ctx.contracted_value && ctx.contracted_value > 0 ? ctx.contracted_value : 80_000;
  const lines: EventPlanDraft["budget_lines"] = [];
  for (const split of BUDGET_SPLITS) {
    const cat = pickCategory(split.codes, ctx.cost_categories);
    if (!cat) continue;
    if (lines.some((l) => l.category_code === cat.code)) continue;
    lines.push({
      category_code: cat.code,
      title: split.title,
      original_amount: Math.round(envelope * split.pct),
      notes: split.notes,
    });
  }
  return lines;
}

function templateRisks(ctx: EventPlanAiDraftContext): EventPlanDraft["risks"] {
  const venue = ctx.venue_name || ctx.location_name || "venue";
  return [
    { title: `Permit or mall access delay at ${venue}`, severity: "high" },
    { title: "Critical supplier lead time slips before bump-in", severity: "high" },
    { title: "Staffing gap on opening weekend", severity: "medium" },
    { title: "Budget estimate exceeds approved envelope after quotes", severity: "medium" },
  ];
}

function templateDates(ctx: EventPlanAiDraftContext, windows: ReturnType<typeof suggestPhaseWindows>) {
  return {
    planning_start: ctx.planning_start || windows.initiation.start,
    setup_start: ctx.setup_start || windows.bump_in.start,
    setup_end: ctx.setup_end || windows.bump_in.end,
    event_start: ctx.event_start || windows.go_live.start,
    event_end: ctx.event_end || windows.operations.end,
    dismantle_start: ctx.dismantle_start || windows.bump_out.start,
    dismantle_end: ctx.dismantle_end || windows.bump_out.end,
  };
}

export function buildFallbackEventPlanDraft(ctx: EventPlanAiDraftContext): EventPlanDraft {
  const windows = suggestPhaseWindows(ctx);
  const tasks = templateTasks(windows);
  const fromSignals = nextActionsFromSignals(ctx.signals);
  const next =
    ctx.focus === "next" && fromSignals.length
      ? fromSignals
      : fromSignals.length
        ? fromSignals
        : tasks.slice(0, 5).map((t) => t.title);
  const typed = suggestDeliverablesForType(ctx.event_type);
  return {
    scope_sections: templateScope(ctx),
    deliverables: typed.map((title, idx) => ({
      title,
      due_date: idx === typed.length - 1 ? windows.go_live.start : windows.initiation.end,
    })),
    included_workstreams: STANDARD_WORKSTREAMS.map((w) => w.code),
    tasks,
    budget_lines: templateBudget(ctx),
    risks: templateRisks(ctx),
    next_actions: next,
    event_dates: templateDates(ctx, windows),
  };
}

function normalizePhase(code: string | null | undefined): LifecyclePhaseCode {
  const hit = LIFECYCLE_PHASES.find((p) => p.code === code);
  return hit?.code ?? "initiation";
}

function normalizeWorkstream(code: string | null | undefined): WorkstreamCode | null {
  return STANDARD_WORKSTREAMS.some((w) => w.code === code) ? (code as WorkstreamCode) : null;
}

/** True when objectives are mostly a paste of the PM brief (the thin-scope failure mode). */
function objectivesEchoBrief(objectives: string, notes: string): boolean {
  const o = objectives.replace(/\s+/g, " ").trim().toLowerCase();
  const n = notes.replace(/\s+/g, " ").trim().toLowerCase();
  if (!o || !n || n.length < 40) return false;
  const head = n.slice(0, Math.min(160, n.length));
  if (o === n || o.startsWith(head) || n.startsWith(o.slice(0, Math.min(160, o.length)))) return true;
  // Thin single-paragraph objectives that share most of the brief opening.
  if (o.length < 360 && head.length >= 80 && o.includes(head.slice(0, 80))) return true;
  return false;
}

function normalizeDraft(raw: z.infer<typeof EventPlanDraftSchema>, fallback: EventPlanDraft, ctx: EventPlanAiDraftContext): EventPlanDraft {
  const windows = suggestPhaseWindows({ ...ctx, ...raw.event_dates });
  const included = (raw.workstreams ?? [])
    .filter((w) => w.include !== false)
    .map((w) => normalizeWorkstream(w.code))
    .filter((c): c is WorkstreamCode => Boolean(c));
  const included_workstreams = included.length ? included : fallback.included_workstreams;

  const rawObjectives = raw.scope?.objectives?.trim() || "";
  const rejectObjectives = objectivesEchoBrief(rawObjectives, ctx.notes);
  const scope_sections = mergeScopeSections(
    [
      { key: "objectives", title: "What success looks like", body: rejectObjectives ? "" : rawObjectives },
      { key: "inclusions", title: "In scope", body: raw.scope?.inclusions?.trim() || "" },
      { key: "exclusions", title: "Out of scope", body: raw.scope?.exclusions?.trim() || "" },
      { key: "assumptions", title: "Assumptions", body: raw.scope?.assumptions?.trim() || "" },
      {
        key: "success",
        title: "Success criteria",
        body: raw.scope?.success?.trim() || (rejectObjectives ? "" : rawObjectives),
      },
    ].filter((s) => s.body),
    fallback.scope_sections,
  );

  const tasks = (raw.tasks ?? [])
    .map((task) => {
      const ws = normalizeWorkstream(task.workstream_code);
      if (!ws || !task.title.trim()) return null;
      const phase = normalizePhase(task.lifecycle_phase || workstreamPhase(ws));
      const window = windows[phase];
      const start = isYmd(task.start_date) ? task.start_date : window.start;
      const due = isYmd(task.due_date) ? task.due_date : window.end;
      return {
        title: task.title.trim().slice(0, 200),
        description: (task.description ?? "").trim().slice(0, 2000),
        workstream_code: ws,
        lifecycle_phase: phase,
        start_date: start,
        due_date: due < start ? start : due,
        priority: task.priority ?? "normal",
        is_critical: Boolean(task.is_critical || task.priority === "critical" || task.priority === "urgent"),
      };
    })
    .filter((t): t is EventPlanDraft["tasks"][number] => Boolean(t));

  const budget_lines = (raw.budget_lines ?? [])
    .map((line) => {
      const cat = ctx.cost_categories.find((c) => c.code === line.category_code) ?? pickCategory([line.category_code], ctx.cost_categories);
      if (!cat) return null;
      const amount = Math.max(0, toNumber(line.original_amount, 0));
      return {
        category_code: cat.code,
        title: line.title.trim().slice(0, 200) || cat.label_en,
        original_amount: amount,
        notes: (line.notes ?? "Estimate").trim().slice(0, 500),
      };
    })
    .filter((l): l is EventPlanDraft["budget_lines"][number] => Boolean(l));

  const dates = raw.event_dates ?? {};
  return {
    scope_sections,
    deliverables: (raw.deliverables ?? [])
      .filter((d) => d.title.trim())
      .map((d) => ({ title: d.title.trim().slice(0, 200), due_date: isYmd(d.due_date) ? d.due_date : null })),
    included_workstreams,
    tasks: tasks.length ? tasks.filter((t) => included_workstreams.includes(t.workstream_code)) : fallback.tasks,
    budget_lines: budget_lines.length ? budget_lines : fallback.budget_lines,
    risks: (raw.risks ?? [])
      .filter((r) => r.title.trim())
      .map((r) => ({ title: r.title.trim().slice(0, 200), severity: r.severity ?? "medium" })),
    next_actions: (raw.next_actions ?? []).map((a) => a.trim()).filter(Boolean).slice(0, 8),
    event_dates: {
      planning_start: isYmd(dates.planning_start) ? dates.planning_start : fallback.event_dates.planning_start,
      setup_start: isYmd(dates.setup_start) ? dates.setup_start : fallback.event_dates.setup_start,
      setup_end: isYmd(dates.setup_end) ? dates.setup_end : fallback.event_dates.setup_end,
      event_start: isYmd(dates.event_start) ? dates.event_start : fallback.event_dates.event_start,
      event_end: isYmd(dates.event_end) ? dates.event_end : fallback.event_dates.event_end,
      dismantle_start: isYmd(dates.dismantle_start) ? dates.dismantle_start : fallback.event_dates.dismantle_start,
      dismantle_end: isYmd(dates.dismantle_end) ? dates.dismantle_end : fallback.event_dates.dismantle_end,
    },
  };
}

function withFocusDefaults(draft: EventPlanDraft, fallback: EventPlanDraft, focus: EventPlanFocus): EventPlanDraft {
  if (focus === "all") {
    return {
      ...draft,
      deliverables: draft.deliverables.length ? draft.deliverables : fallback.deliverables,
      risks: draft.risks.length ? draft.risks : fallback.risks,
      next_actions: draft.next_actions.length ? draft.next_actions : fallback.next_actions,
    };
  }
  if (focus === "scope") {
    return { ...fallback, scope_sections: draft.scope_sections, deliverables: draft.deliverables.length ? draft.deliverables : fallback.deliverables };
  }
  if (focus === "wbs" || focus === "tasks") {
    return { ...fallback, included_workstreams: draft.included_workstreams, tasks: draft.tasks };
  }
  if (focus === "schedule") {
    return { ...fallback, tasks: draft.tasks, event_dates: draft.event_dates };
  }
  if (focus === "budget") {
    return { ...fallback, budget_lines: draft.budget_lines };
  }
  return { ...fallback, next_actions: draft.next_actions.length ? draft.next_actions : fallback.next_actions, risks: draft.risks.length ? draft.risks : fallback.risks };
}

function buildScopePromptBlock(focus: EventPlanFocus): string[] {
  const detailed = focus === "scope" || focus === "all";
  return [
    "scope: { objectives, inclusions, exclusions, assumptions, success }",
    detailed
      ? [
          "Scope quality rules (critical):",
          "- Write DETAILED, event-specific multi-paragraph (or multi-bullet) sections. Thin one-liners are not acceptable.",
          "- objectives (What success looks like): 3 short paragraphs covering (1) business/ops outcomes, (2) guest experience grounded in the brief themes/zones WITHOUT pasting or paraphrasing the brief as the whole section, (3) ops readiness across setup → live → dismantle. Never copy the brief verbatim.",
          "- inclusions (In scope): structure as Setup / Live / Dismantle phases WITH the concrete dates from Basics, then list workstream deliverables with concrete bullets (not just workstream names).",
          "- exclusions (Out of scope): explicit exclusions (client media buying, landlord CAPEX, unrelated sites/events, IP/approvals retained by client, anything not in the brief).",
          "- assumptions: venue access, power/data, permits, staffing availability, budget confirmation, and client dependencies — tie to this venue/client/dates when known.",
          "- success: measurable criteria — open/close dates, setup complete by setup_end, permits cleared, staffing filled, HSE clear, dismantle complete by dismantle_end, guest-ready opening.",
          "- Stay grounded in the brief + FEC structure. Do NOT invent vendor/company names, guest counts, brands, or attractions that are not in the brief.",
          focus === "scope"
            ? "- This request focuses on scope: prioritise rich scope text. Still return the other JSON keys, but keep tasks/budget concise if needed."
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "scope paragraphs should be professional and specific to this event; do not paste the brief into objectives.",
  ];
}

function buildUserPrompt(ctx: EventPlanAiDraftContext): string {
  const focus = ctx.focus ?? "all";
  const cats = ctx.cost_categories.map((c) => c.code).slice(0, 40).join(", ");
  const streams = STANDARD_WORKSTREAMS.map((w) => `${w.code} (${w.title_en})`).join(", ");
  const phases = LIFECYCLE_PHASES.map((p) => p.code).join(", ");
  const signals = ctx.signals
    ? [
        "Operational facts from the live event record. Use ONLY these. Do not invent PRs, documents, or tasks.",
        JSON.stringify(ctx.signals),
        "If a list is empty, do not invent replacements.",
      ].join("\n")
    : "No live operational facts were supplied. Do not invent PRs or uploaded documents.";
  return [
    "Draft a practical event project plan for a Family Entertainment Centre (FEC) operator in Qatar.",
    `Focus: ${focus}`,
    `Event: ${ctx.event_name || "Untitled"}`,
    `Client: ${ctx.client_name || "—"}`,
    `Type: ${ctx.event_type || "activation"}`,
    `Venue: ${ctx.venue_name || "TBC"}`,
    `Site / location: ${ctx.location_name || "TBC"}`,
    "Basics dates (YYYY-MM-DD) — use these exactly in scope phases and event_dates; do not invent different ones when provided:",
    `- planning_start: ${ctx.planning_start || "TBC"}`,
    `- setup_start: ${ctx.setup_start || "TBC"}`,
    `- setup_end: ${ctx.setup_end || "TBC"}`,
    `- event_start (opening): ${ctx.event_start || "TBC"}`,
    `- event_end (closing): ${ctx.event_end || "TBC"}`,
    `- dismantle_start: ${ctx.dismantle_start || "TBC"}`,
    `- dismantle_end: ${ctx.dismantle_end || "TBC"}`,
    `Contracted value (QAR): ${ctx.contracted_value ?? "unknown"}`,
    `Project manager brief (source of themes/zones only — do not paste into objectives): ${ctx.notes.trim() || "(use standard FEC activation template)"}`,
    ctx.locale === "ar" ? "Write scope paragraphs and next_actions in Arabic (Qatar office tone)." : "",
    signals,
    "",
    "Return ONLY valid JSON with:",
    ...buildScopePromptBlock(focus),
    "deliverables: [{ title, due_date YYYY-MM-DD }] — match the event type (night market, mall activation, festival, etc.).",
    `workstreams: [{ code, include }] — codes MUST be from: ${streams}. Keep all 13 unless the brief clearly excludes one.`,
    `tasks: 2-4 per included workstream. Each: title, description, workstream_code, lifecycle_phase (one of: ${phases}), start_date, due_date, priority (low|normal|high|urgent|critical), is_critical.`,
    "Respect Basics dates. Planning before setup_start. Setup between setup_start and setup_end. Operations between event_start and event_end. Dismantle between dismantle_start and dismantle_end.",
    `budget_lines: [{ category_code, title, original_amount, notes }] — category_code MUST be one of: ${cats || "contingency"}. Amounts are labelled estimates in QAR. Include a contingency line.`,
    "risks: 3-5 { title, severity }",
    "next_actions: 5-8 short next steps for the PM this week, grounded in the operational facts when present (overdue tasks, pending PRs, missing BOQ/permits, unassigned owners).",
    "event_dates: planning_start, setup_start, setup_end, event_start, event_end, dismantle_start, dismantle_end as YYYY-MM-DD (preserve provided Basics dates).",
    "Do not invent guest counts, brands, supplier/vendor names, or purchase requests that are not in the brief or operational facts.",
  ]
    .filter(Boolean)
    .join("\n");
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const PLAN_DRAFT_MAX_TOKENS = 8192;

export async function completeEventAiJson(
  messages: ChatMessage[],
  temperature = 0.3,
  options?: { maxTokens?: number; moduleSource?: string },
): Promise<unknown | null> {
  return completeJsonViaGateway(messages, {
    temperature,
    maxTokens: options?.maxTokens,
    moduleSource: options?.moduleSource ?? "events.plan_draft",
  });
}

export async function callEventPlanAiDraft(
  ctx: EventPlanAiDraftContext,
): Promise<{ fields: EventPlanDraft; ai_generated: boolean }> {
  const fallback = buildFallbackEventPlanDraft(ctx);
  const focus = ctx.focus ?? "all";
  const parsed = await completeEventAiJson(
    [
      {
        role: "system",
        content:
          "You are an event project-management assistant for FEC venues in Qatar. Output only valid JSON. Stay inside the 13 standard workstreams and 14-phase lifecycle. Budget figures are starting estimates, not commitments. Never invent purchase requests, vendor names, or documents that are not in the supplied facts. For Goal and scope, write detailed operational text — never paste the PM brief into objectives.",
      },
      { role: "user", content: buildUserPrompt(ctx) },
    ],
    0.3,
    { maxTokens: PLAN_DRAFT_MAX_TOKENS, moduleSource: "events.plan_draft" },
  );
  if (!parsed) return { fields: fallback, ai_generated: false };

  try {
    const fields = EventPlanDraftSchema.parse(parsed);
    const normalized = withFocusDefaults(normalizeDraft(fields, fallback, ctx), fallback, focus);
    if (focus === "next" && ctx.signals && !normalized.next_actions.length) {
      return { fields: { ...normalized, next_actions: fallback.next_actions }, ai_generated: true };
    }
    return { fields: normalized, ai_generated: true };
  } catch {
    return { fields: fallback, ai_generated: false };
  }
}
