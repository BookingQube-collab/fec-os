import {
  EARLY_STAGE_CODES,
  READINESS_CATEGORIES,
  READINESS_CATEGORY_WEIGHTS,
  type DepType,
  type EventRag,
  type ReadinessCategory,
} from "@/lib/events/constants";

export interface HealthInputs {
  overdueCriticalTasks: number;
  overdueHighTasks: number;
  openCriticalRisks: number;
  openHighRisks: number;
  forecast: number;
  revised: number;
  daysUntilEvent: number | null;
  stageCode: string | null;
  readinessPct: number;
}

export interface HealthResult {
  rag: EventRag;
  score: number;
  reasons: string[];
}

export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function readinessBand(pct: number): EventRag {
  if (pct >= 90) return "green";
  if (pct >= 75) return "amber";
  if (pct >= 50) return "red";
  return "critical";
}

export function effectiveHealth(
  computed: EventRag,
  override: EventRag | null | undefined,
): EventRag {
  return override ?? computed;
}

export function computeReadiness(input: {
  categoryScores: Partial<Record<ReadinessCategory, number | null>>;
}): { pct: number; parts: Record<string, number>; band: EventRag } {
  let weightSum = 0;
  let acc = 0;
  const parts: Record<string, number> = {};
  for (const key of READINESS_CATEGORIES) {
    const value = input.categoryScores[key];
    if (value == null) continue;
    const weight = READINESS_CATEGORY_WEIGHTS[key];
    acc += value * weight;
    weightSum += weight;
    parts[key] = Math.round(value * 10) / 10;
  }
  const pct = weightSum <= 0 ? 0 : Math.round((acc / weightSum) * 10) / 10;
  return { pct, parts, band: readinessBand(pct) };
}

export function scoreOr(done: number, total: number): number | null {
  if (total <= 0) return null;
  return (done / total) * 100;
}

export function blendScores(...values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null);
  if (!present.length) return null;
  return present.reduce((s, v) => s + v, 0) / present.length;
}

export function computeEventHealth(input: HealthInputs): HealthResult {
  const reasons: string[] = [];
  const overrun = input.revised > 0 && input.forecast > input.revised + 0.005;
  const overrunPct = input.revised > 0 ? ((input.forecast - input.revised) / input.revised) * 100 : 0;
  const early = input.stageCode ? EARLY_STAGE_CODES.has(input.stageCode) : false;

  if (input.overdueCriticalTasks > 0) reasons.push("overdue_critical_tasks");
  if (input.openCriticalRisks > 0) reasons.push("open_critical_risks");
  if (overrunPct > 10) reasons.push("budget_overrun_critical");
  else if (overrunPct > 5) reasons.push("budget_overrun_severe");
  else if (overrun) reasons.push("budget_overrun");
  if (input.overdueHighTasks > 0) reasons.push("overdue_high_tasks");
  if (input.openHighRisks > 0) reasons.push("open_high_risks");
  if (input.readinessPct < 50) reasons.push("readiness_critical");
  else if (input.readinessPct < 75) reasons.push("readiness_low");
  if (input.daysUntilEvent != null && input.daysUntilEvent <= 3 && early) reasons.push("late_stage_critical");
  else if (input.daysUntilEvent != null && input.daysUntilEvent <= 7 && early) reasons.push("late_stage");
  else if (input.daysUntilEvent != null && input.daysUntilEvent <= 21 && early) reasons.push("stage_behind");

  let rag: EventRag = "green";
  if (
    (input.overdueCriticalTasks > 0 && input.openCriticalRisks > 0) ||
    overrunPct > 10 ||
    input.readinessPct < 50 ||
    (input.daysUntilEvent != null && input.daysUntilEvent <= 3 && early)
  ) {
    rag = "critical";
  } else if (
    input.overdueCriticalTasks > 0 ||
    input.openCriticalRisks > 0 ||
    overrunPct > 5 ||
    (input.daysUntilEvent != null && input.daysUntilEvent <= 7 && early)
  ) {
    rag = "red";
  } else if (reasons.length > 0) {
    rag = "amber";
  }

  let score = 100;
  score -= input.overdueCriticalTasks * 18;
  score -= input.openCriticalRisks * 16;
  score -= input.overdueHighTasks * 8;
  score -= input.openHighRisks * 6;
  if (overrun) score -= Math.min(25, Math.round(overrunPct));
  if (input.readinessPct < 80) score -= Math.round((80 - input.readinessPct) * 0.4);
  score = Math.max(0, Math.min(100, score));

  return { rag, score, reasons };
}

export interface TaskDateLike {
  id: string;
  start_date: string | null;
  due_date: string | null;
}

export interface DependencyLike {
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dependencyViolations(
  tasks: TaskDateLike[],
  deps: DependencyLike[],
): Array<{
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  needed_date: string;
  message: string;
}> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: Array<{
    predecessor_id: string;
    successor_id: string;
    dep_type: DepType;
    needed_date: string;
    message: string;
  }> = [];

  for (const dep of deps) {
    const pred = byId.get(dep.predecessor_id);
    const succ = byId.get(dep.successor_id);
    if (!pred || !succ) continue;

    const predStart = pred.start_date;
    const predEnd = pred.due_date ?? pred.start_date;
    const succStart = succ.start_date;
    const succEnd = succ.due_date ?? succ.start_date;
    if (!predStart && !predEnd) continue;

    let ok = true;
    let needed: string | null = null;
    if (dep.dep_type === "FS" && predEnd && succStart) {
      needed = addDays(predEnd, dep.lag_days);
      ok = succStart >= needed;
    } else if (dep.dep_type === "SS" && predStart && succStart) {
      needed = addDays(predStart, dep.lag_days);
      ok = succStart >= needed;
    } else if (dep.dep_type === "FF" && predEnd && succEnd) {
      needed = addDays(predEnd, dep.lag_days);
      ok = succEnd >= needed;
    } else if (dep.dep_type === "SF" && predStart && succEnd) {
      needed = addDays(predStart, dep.lag_days);
      ok = succEnd >= needed;
    }

    if (!ok && needed) {
      out.push({
        predecessor_id: dep.predecessor_id,
        successor_id: dep.successor_id,
        dep_type: dep.dep_type,
        needed_date: needed,
        message: `${dep.dep_type} requires successor on/after ${needed}`,
      });
    }
  }
  return out;
}

export interface GateEval {
  requirementId: string;
  code: string;
  labelEn: string;
  labelAr: string;
  kind: string;
  blocking: boolean;
  satisfied: boolean;
}

export function evaluateGates(
  requirements: Array<{
    id: string;
    code: string;
    label_en: string;
    label_ar: string;
    requirement_kind: string;
    is_blocking: boolean;
    threshold: number | null;
    readiness_code?: string | null;
  }>,
  facts: {
    hasContractValue: boolean;
    budgetApproved: boolean;
    scopeBaselined: boolean;
    deliverableCount: number;
    milestoneCount: number;
    readinessPct: number;
    openCriticalRisks: number;
    overdueCriticalTasks: number;
    manualSatisfied: Set<string>;
    venueConfirmed: boolean;
    completedReadinessCodes: Set<string>;
    hasPm: boolean;
    hasOpeningDate: boolean;
    scheduleAvailable: boolean;
    criticalPrsApproved: boolean;
  },
): GateEval[] {
  return requirements.map((req) => {
    let satisfied = false;
    switch (req.requirement_kind) {
      case "contract_value":
        satisfied = facts.hasContractValue;
        break;
      case "budget_approved":
        satisfied = facts.budgetApproved;
        break;
      case "scope_baseline":
        satisfied = facts.scopeBaselined;
        break;
      case "deliverables":
        satisfied = facts.deliverableCount > 0;
        break;
      case "milestones":
        satisfied = facts.milestoneCount > 0;
        break;
      case "readiness_min":
        satisfied = facts.readinessPct >= Number(req.threshold ?? 70);
        break;
      case "no_open_critical_risks":
        satisfied = facts.openCriticalRisks === 0;
        break;
      case "no_overdue_critical_tasks":
        satisfied = facts.overdueCriticalTasks === 0;
        break;
      case "manual":
        satisfied = facts.manualSatisfied.has(req.id);
        break;
      case "venue_confirmed":
        satisfied = facts.venueConfirmed;
        break;
      case "readiness_item":
        satisfied = Boolean(req.readiness_code && facts.completedReadinessCodes.has(req.readiness_code));
        break;
      case "has_pm":
        satisfied = facts.hasPm;
        break;
      case "opening_date":
        satisfied = facts.hasOpeningDate;
        break;
      case "schedule_available":
        satisfied =
          facts.scheduleAvailable ||
          Boolean(req.readiness_code && facts.completedReadinessCodes.has(req.readiness_code));
        break;
      case "critical_prs_approved":
        satisfied =
          facts.criticalPrsApproved ||
          Boolean(req.readiness_code && facts.completedReadinessCodes.has(req.readiness_code));
        break;
      default:
        satisfied = false;
    }
    return {
      requirementId: req.id,
      code: req.code,
      labelEn: req.label_en,
      labelAr: req.label_ar,
      kind: req.requirement_kind,
      blocking: req.is_blocking,
      satisfied,
    };
  });
}
