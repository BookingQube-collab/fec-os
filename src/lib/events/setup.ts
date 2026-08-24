import { EARLY_STAGE_CODES } from "@/lib/events/constants";
import { LIFECYCLE_PHASES, type LifecyclePhaseCode } from "@/lib/events/lifecycle";
import type { EventBudgetLineRow, EventOverview, EventScopeSection, EventTaskRow } from "@/lib/events/types";

export const EVENT_SETUP_STEPS = [
  { id: "basics", number: 1 },
  { id: "scope", number: 2 },
  { id: "workstreams", number: 3 },
  { id: "schedule", number: 4 },
  { id: "budget", number: 5 },
  { id: "team", number: 6 },
  { id: "review", number: 7 },
] as const;

export type EventSetupStepId = (typeof EVENT_SETUP_STEPS)[number]["id"];

export const DEFAULT_SCOPE_SECTIONS: EventScopeSection[] = [
  { key: "objectives", title: "What success looks like", body: "" },
  { key: "inclusions", title: "In scope", body: "" },
  { key: "exclusions", title: "Out of scope", body: "" },
  { key: "assumptions", title: "Assumptions", body: "" },
];

export interface EventSetupFacts {
  hasName: boolean;
  hasLocation: boolean;
  hasDates: boolean;
  hasScope: boolean;
  hasWorkstreamTasks: boolean;
  hasSchedule: boolean;
  hasBudget: boolean;
  hasOwners: boolean;
  launched: boolean;
}

export interface EventSetupProgress {
  facts: EventSetupFacts;
  completed: Record<EventSetupStepId, boolean>;
  doneCount: number;
  total: number;
  currentStep: EventSetupStepId;
  currentNumber: number;
  incomplete: boolean;
  showWizard: boolean;
}

function hasFilledScope(sections: EventScopeSection[] | null | undefined): boolean {
  return Boolean(sections?.some((s) => s.body.trim().length >= 8));
}

export function eventSetupFacts(input: {
  name?: string | null;
  locationId?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  status?: string | null;
  scopeSections?: EventScopeSection[] | null;
  tasks?: Array<Pick<EventTaskRow, "start_date" | "due_date" | "owner_staff_id" | "assignee_staff_id" | "status">>;
  budgetLines?: Array<Pick<EventBudgetLineRow, "original_amount" | "revised_amount">>;
}): EventSetupFacts {
  const openTasks = (input.tasks ?? []).filter((t) => t.status !== "cancelled");
  return {
    hasName: Boolean(input.name?.trim()),
    hasLocation: Boolean(input.locationId),
    hasDates: Boolean(input.eventStart),
    hasScope: hasFilledScope(input.scopeSections),
    hasWorkstreamTasks: openTasks.length >= 3,
    hasSchedule: openTasks.some((t) => t.start_date || t.due_date) || Boolean(input.eventStart && input.eventEnd),
    hasBudget: (input.budgetLines ?? []).some((l) => Number(l.original_amount || l.revised_amount) > 0),
    hasOwners: openTasks.some((t) => t.owner_staff_id || t.assignee_staff_id),
    launched: input.status !== "draft",
  };
}

export function computeEventSetupProgress(
  facts: EventSetupFacts,
  opts?: { forceWizard?: boolean; stageCode?: string | null; taskCount?: number },
): EventSetupProgress {
  const completed: Record<EventSetupStepId, boolean> = {
    basics: facts.hasName && facts.hasLocation && facts.hasDates,
    scope: facts.hasScope,
    workstreams: facts.hasWorkstreamTasks,
    schedule: facts.hasSchedule && facts.hasWorkstreamTasks,
    budget: facts.hasBudget,
    team: facts.hasOwners,
    review: facts.launched && facts.hasScope && facts.hasWorkstreamTasks,
  };
  const firstOpen = EVENT_SETUP_STEPS.find((s) => !completed[s.id]) ?? EVENT_SETUP_STEPS[EVENT_SETUP_STEPS.length - 1];
  const doneCount = EVENT_SETUP_STEPS.filter((s) => completed[s.id]).length;
  const incomplete = doneCount < EVENT_SETUP_STEPS.length;
  const early = !opts?.stageCode || EARLY_STAGE_CODES.has(opts.stageCode);
  const thinPlan = (opts?.taskCount ?? 0) < 3;
  const showWizard = Boolean(opts?.forceWizard) || !facts.launched || (incomplete && early && thinPlan);

  return {
    facts,
    completed,
    doneCount,
    total: EVENT_SETUP_STEPS.length,
    currentStep: firstOpen.id,
    currentNumber: firstOpen.number,
    incomplete,
    showWizard,
  };
}

export function setupProgressFromOverview(
  overview: EventOverview | null | undefined,
  extras?: {
    scopeSections?: EventScopeSection[] | null;
    tasks?: EventTaskRow[];
    budgetLines?: EventBudgetLineRow[];
    forceWizard?: boolean;
  },
): EventSetupProgress {
  const ev = overview?.event;
  const facts = eventSetupFacts({
    name: ev?.name,
    locationId: ev?.location_id,
    eventStart: ev?.event_start,
    eventEnd: ev?.event_end,
    status: ev?.status,
    scopeSections: extras?.scopeSections,
    tasks: extras?.tasks ?? overview?.overdueActions,
    budgetLines: extras?.budgetLines,
  });
  return computeEventSetupProgress(facts, {
    forceWizard: extras?.forceWizard,
    stageCode: ev?.stage_code,
    taskCount: extras?.tasks?.length ?? overview?.tasks.total ?? 0,
  });
}

function ymdToUtc(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function addDaysYmd(value: string, days: number): string {
  const d = ymdToUtc(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenYmd(start: string, end: string): number {
  return Math.round((ymdToUtc(end).getTime() - ymdToUtc(start).getTime()) / 86_400_000);
}

export function clampYmd(value: string, min: string, max: string): string {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export type PhaseWindow = { start: string; end: string };

/** Spread the 14 lifecycle phases between planning start and close-out. */
export function suggestPhaseWindows(input: {
  planning_start?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  setup_start?: string | null;
  dismantle_end?: string | null;
  today?: string;
}): Record<LifecyclePhaseCode, PhaseWindow> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const eventStart = input.event_start || addDaysYmd(today, 45);
  const eventEnd = input.event_end && input.event_end >= eventStart ? input.event_end : addDaysYmd(eventStart, 14);
  const setupStart = input.setup_start && input.setup_start <= eventStart ? input.setup_start : addDaysYmd(eventStart, -5);
  const dismantleEnd = input.dismantle_end && input.dismantle_end >= eventEnd ? input.dismantle_end : addDaysYmd(eventEnd, 4);
  const planStart =
    input.planning_start && input.planning_start < setupStart ? input.planning_start : addDaysYmd(setupStart, -28);
  const lead = Math.max(14, daysBetweenYmd(planStart, setupStart));

  const pre = (fromPct: number, toPct: number): PhaseWindow => {
    const start = addDaysYmd(planStart, Math.round(lead * fromPct));
    const end = addDaysYmd(planStart, Math.round(lead * toPct));
    return { start, end: end < start ? start : end };
  };

  const windows: Record<LifecyclePhaseCode, PhaseWindow> = {
    initiation: pre(0, 0.12),
    feasibility: pre(0.1, 0.28),
    budget_approval: pre(0.22, 0.4),
    design: pre(0.32, 0.55),
    procurement: pre(0.4, 0.72),
    pre_production: pre(0.55, 0.9),
    staffing: pre(0.6, 0.95),
    logistics: pre(0.7, 1),
    bump_in: { start: setupStart, end: eventStart },
    testing: { start: addDaysYmd(eventStart, -2), end: eventStart },
    go_live: { start: eventStart, end: eventStart },
    operations: { start: eventStart, end: eventEnd },
    bump_out: { start: eventEnd, end: dismantleEnd },
    closure: { start: dismantleEnd, end: addDaysYmd(dismantleEnd, 10) },
  };

  return windows;
}

export function mergeScopeSections(
  incoming?: EventScopeSection[] | null,
  fallback: EventScopeSection[] = DEFAULT_SCOPE_SECTIONS,
): EventScopeSection[] {
  const byKey = new Map((incoming ?? []).map((s) => [s.key, s]));
  const keys = [...new Set([...fallback.map((s) => s.key), ...(incoming ?? []).map((s) => s.key)])];
  return keys.map((key) => {
    const preset = fallback.find((s) => s.key === key);
    const row = byKey.get(key);
    return {
      key,
      title: row?.title || preset?.title || key,
      body: row?.body ?? "",
    };
  });
}

export { LIFECYCLE_PHASES };
